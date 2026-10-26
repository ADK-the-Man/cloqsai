"""
Requirements extraction stage: converts natural language to structured RequirementsSpec.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai.llm_client import get_llm_client, LLMConfigError
from models.db import Requirements, Project
from models.schemas import RequirementsSpec, RequirementsField

logger = logging.getLogger(__name__)

REQUIREMENTS_SYSTEM_PROMPT = """You are a cloud architecture requirements analyst. Your job is to extract structured requirements from a customer's natural language application description.

For each field, determine:
- value: the extracted value (null if unknown)
- unit: the unit of measurement (if applicable)
- source: "explicit" (customer said it directly), "inferred" (you derived it from context), "assumed" (reasonable default), or "unknown" (not determinable)
- confidence: 0.0-1.0 representing how confident you are in this value

Be conservative: only mark confidence > 0.8 for explicitly stated values. Never silently transform an unknown value into a confirmed fact.

For regions, recognize common names: "Mumbai" = "ap-south-1" (AWS) / "centralindia" (Azure), "US East" = "us-east-1"/"eastus", etc. Store the human-readable name as the value.
For environments, list all mentioned (e.g. ["production", "staging", "development"]).
For unknown_fields, list field names that you cannot determine and that materially affect sizing.
"""

REQUIREMENTS_SCHEMA = {
    "type": "object",
    "properties": {
        "application_type": {
            "type": "object",
            "properties": {
                "value": {"type": ["string", "null"], "description": "e.g. 'web application', 'API service', 'data pipeline', 'ML inference'"},
                "unit": {"type": ["string", "null"]},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "workload_type": {
            "type": "object",
            "properties": {
                "value": {"type": ["string", "null"], "description": "e.g. 'web serving', 'batch processing', 'real-time streaming', 'OLAP'"},
                "unit": {"type": ["string", "null"]},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "concurrent_users": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "users"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "avg_rps": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "requests/second"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "peak_rps": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "requests/second"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "cpu_cores": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "vCPU"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "memory_gb": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "GB"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "latency_p99_ms": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "ms"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "db_engine": {
            "type": "object",
            "properties": {
                "value": {"type": ["string", "null"], "description": "e.g. 'postgresql', 'mysql', 'mongodb'"},
                "unit": {"type": ["string", "null"]},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "db_storage_gb": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "GB"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "storage_total_gb": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "GB"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "network_egress_gb_month": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "GB/month"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "availability_target_percent": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"], "description": "e.g. 99.9, 99.99"},
                "unit": {"type": ["string", "null"], "default": "%"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "rto_minutes": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "minutes"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "rpo_minutes": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "minutes"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "security_requirements": {
            "type": "object",
            "properties": {
                "value": {"type": ["array", "null"], "items": {"type": "string"}, "description": "e.g. ['WAF', 'encryption at rest', 'HIPAA', 'SOC2']"},
                "unit": {"type": ["string", "null"]},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "operating_hours_per_day": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "hours/day"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "regions": {
            "type": "object",
            "properties": {
                "value": {"type": ["array", "null"], "items": {"type": "string"}, "description": "e.g. ['Mumbai', 'US East']"},
                "unit": {"type": ["string", "null"]},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "environments": {
            "type": "object",
            "properties": {
                "value": {"type": ["array", "null"], "items": {"type": "string"}, "description": "e.g. ['production', 'staging']"},
                "unit": {"type": ["string", "null"]},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "budget_usd_month": {
            "type": "object",
            "properties": {
                "value": {"type": ["number", "null"]},
                "unit": {"type": ["string", "null"], "default": "USD/month"},
                "source": {"type": "string", "enum": ["explicit", "inferred", "assumed", "unknown"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1}
            },
            "required": ["value", "unit", "source", "confidence"]
        },
        "unknown_fields": {
            "type": "array",
            "items": {"type": "string"},
            "description": "List of field names that could not be determined and materially affect architecture or cost"
        },
        "raw_notes": {
            "type": "string",
            "description": "Any additional context or notes extracted from the text"
        }
    },
    "required": [
        "application_type", "workload_type", "concurrent_users", "avg_rps", "peak_rps",
        "cpu_cores", "memory_gb", "latency_p99_ms", "db_engine", "db_storage_gb",
        "storage_total_gb", "network_egress_gb_month", "availability_target_percent",
        "rto_minutes", "rpo_minutes", "security_requirements", "operating_hours_per_day",
        "regions", "environments", "budget_usd_month", "unknown_fields", "raw_notes"
    ]
}


async def extract_requirements(
    project_id: uuid.UUID,
    raw_text: str,
    db: AsyncSession,
) -> RequirementsSpec:
    """
    Extract structured requirements from natural language text.
    Saves to DB and returns RequirementsSpec.
    """
    client = get_llm_client()

    messages = [
        {
            "role": "user",
            "content": f"Extract the cloud infrastructure requirements from this application description:\n\n{raw_text}"
        }
    ]

    logger.info(f"Extracting requirements for project {project_id}")
    raw_result = await client.chat_completion(
        messages=messages,
        system_prompt=REQUIREMENTS_SYSTEM_PROMPT,
        response_schema=REQUIREMENTS_SCHEMA,
        tool_name="extract_requirements",
        tool_description="Extract structured cloud infrastructure requirements from the customer description",
    )

    # Validate and parse into RequirementsSpec
    spec = RequirementsSpec(**raw_result)

    # Get current version
    result = await db.execute(
        select(Requirements)
        .where(Requirements.project_id == project_id)
        .order_by(Requirements.version.desc())
    )
    existing = result.scalars().all()
    next_version = (max((r.version for r in existing), default=0) + 1)

    # Save to DB
    req_record = Requirements(
        id=uuid.uuid4(),
        project_id=project_id,
        version=next_version,
        raw_text=raw_text,
        structured_spec=spec.model_dump(),
    )
    db.add(req_record)

    # Update project status
    proj_result = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_result.scalar_one_or_none()
    if project:
        project.status = "requirements_extracted"

    await db.flush()
    logger.info(f"Requirements extracted and saved (version {next_version}) for project {project_id}")
    return spec
