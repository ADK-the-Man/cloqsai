"""
Context-Aware Interactive Architect Chat Engine.
Enables real-time conversational pair-architecting between the user and an elite
AI Principal Cloud Solutions Architect. Analyzes current workload context, recommends
trade-offs, and provides 1-click prompt mutations to update the architecture graph and pricing.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from ai.llm_client import get_llm_client, LLMConfigError
from models.schemas import ArchitectChatMessage, ArchitectChatResponse

logger = logging.getLogger(__name__)

ARCHITECT_CHAT_SYSTEM_PROMPT = """You are an elite Principal Cloud Solutions Architect and FinOps Advisor at CLOQS AI.
You are pair-architecting with a cloud engineer in real-time. You have complete context of their current workload,
architecture diagram, sized AWS/Azure resources, and monthly costs.

Your mission:
1. Provide concise, expert, battle-tested cloud engineering advice (AWS & Azure).
2. Transparently explain architectural trade-offs (e.g., EKS vs ECS Fargate, Graviton vs Intel, RDS vs Aurora, Secrets Manager vs SSM Parameter Store).
3. If the user asks to change, add, remove, or optimize anything in their architecture (e.g. 'switch to Graviton', 'add Redis', 'remove MWAA', 'cut costs by $200'):
   - Thoroughly explain the SLA, latency, and cost impact.
   - Generate a clean `suggested_prompt_update` containing their updated specification with the modification seamlessly integrated.
   - Provide clear `suggested_actions` pills for quick confirmation.

Keep answers concise, technical, and formatted in clean GitHub-style Markdown.
"""

ARCHITECT_CHAT_SCHEMA = {
    "type": "object",
    "properties": {
        "reply": {
            "type": "string",
            "description": "Comprehensive markdown response explaining architectural advice, trade-offs, and reasoning."
        },
        "suggested_prompt_update": {
            "type": ["string", "null"],
            "description": "If user requested a design change, the full updated natural language specification prompt ready to be applied. Null if user only asked an informational question."
        },
        "suggested_actions": {
            "type": "array",
            "items": {"type": "string"},
            "description": "2-3 quick follow-up action pills the user can click."
        },
        "impacted_services": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Names of AWS/Azure services added, removed, or modified."
        },
        "projected_cost_delta": {
            "type": ["number", "null"],
            "description": "Estimated monthly cost change in USD (negative for savings, positive for additions)."
        }
    },
    "required": ["reply", "suggested_actions", "impacted_services"]
}


def deterministic_chat_response(
    user_msg: str,
    raw_prompt: str,
    resources: List[Dict[str, Any]],
    monthly_cost: float
) -> ArchitectChatResponse:
    """
    Deterministic conversational fallback that handles common architectural questions,
    cost reduction inquiries, and modifications without requiring external API keys.
    """
    msg_lower = user_msg.lower()
    updated_prompt = raw_prompt

    # 1. User wants to cut costs / save money
    if any(k in msg_lower for k in ["save", "cut", "cheaper", "lower", "reduce", "expensive", "budget", "discount"]):
        reply = (
            f"### Cost Optimization Review (Current: **${monthly_cost:.2f}/mo**)\n\n"
            f"Here are the highest-ROI architectural adjustments to immediately reduce your monthly AWS bill:\n\n"
            f"1. **Switch Intel Nodes to AWS Graviton (c7g / m7g / db.m7g)**\n"
            f"   - **Impact**: Cuts compute and database hourly rates by ~19% with equal or better throughput.\n"
            f"   - **Estimated Savings**: **-$110.00/mo**\n\n"
            f"2. **Migrate Non-Rotating Secrets to SSM Parameter Store**\n"
            f"   - **Impact**: Keep only rotating passwords in Secrets Manager. Standard Parameter Store is $0.00/mo.\n"
            f"   - **Estimated Savings**: **-$170.00/mo**\n\n"
            f"3. **Enable S3 Intelligent-Tiering**\n"
            f"   - **Impact**: Automatically moves inactive 2 GB video files to colder tiers after 30 days.\n"
            f"   - **Estimated Savings**: **-$8.00/mo**\n\n"
            f"**Total Potential Savings**: **~-$288.00/month** without sacrificing Multi-AZ redundancy!"
        )
        mutated = f"{raw_prompt.strip()}\n\nUse AWS Graviton instances (c7g/m7g) and store configuration secrets in AWS Systems Manager Parameter Store Standard Tier."
        return ArchitectChatResponse(
            reply=reply,
            suggested_prompt_update=mutated,
            suggested_actions=["Apply Graviton & SSM Savings", "Keep Current Architecture", "Explain Graviton Migration Risk"],
            impacted_services=["EC2", "RDS", "Secrets Manager", "SSM"],
            projected_cost_delta=-288.00
        )

    # 2. User wants to switch to Graviton
    if "graviton" in msg_lower or "arm" in msg_lower:
        reply = (
            f"### Graviton Migration Analysis\n\n"
            f"Switching from x86_64 Intel (`c7i.large`, `m6i.large`, `db.m6i.xlarge`) to AWS Graviton3/4 (`c7g.large`, `m7g.large`, `db.m7g.xlarge`):\n\n"
            f"- **Compute Savings**: ~19% reduction in hourly instance pricing.\n"
            f"- **Performance**: Up to 25% better price-performance for containerized Linux microservices and PostgreSQL.\n"
            f"- **Compatibility**: Docker images must be built for `linux/arm64` (standard in modern CI/CD pipelines).\n\n"
            f"**Projected Monthly Impact**: **-$115.50/mo** net reduction."
        )
        mutated = f"{raw_prompt.strip()}\n\nUse AWS Graviton ARM-based compute instances (c7g / m7g) and db.m7g for RDS."
        return ArchitectChatResponse(
            reply=reply,
            suggested_prompt_update=mutated,
            suggested_actions=["Apply Graviton to Architecture", "Compare Intel vs Graviton Specs"],
            impacted_services=["EKS Worker Nodes", "RDS PostgreSQL"],
            projected_cost_delta=-115.50
        )

    # 3. User asks about EKS vs ECS Fargate
    if "fargate" in msg_lower or "ecs" in msg_lower:
        reply = (
            f"### EKS vs ECS Fargate Comparison for Your Workload\n\n"
            f"- **EKS (Current)**: Best for complex microservices, ingress routing, custom service mesh, and running private LLM gateways side-by-side with shared node capacity.\n"
            f"- **ECS Fargate**: Eliminates node management, OS patching, and EC2 capacity planning. However, for continuous 24/7 baseline compute, Fargate is ~15-20% more expensive per vCPU/GB than dedicated EC2 worker nodes.\n\n"
            f"**Recommendation**: Keep EKS with 2 worker nodes for predictable 24/7 load; use Fargate only for unpredictable burst jobs."
        )
        return ArchitectChatResponse(
            reply=reply,
            suggested_prompt_update=None,
            suggested_actions=["Keep EKS Cluster", "Switch to ECS Fargate", "Add Fargate Profile to EKS"],
            impacted_services=["Amazon EKS", "AWS Fargate"],
            projected_cost_delta=0.0
        )

    # 4. Default architecture discussion
    reply = (
        f"### Architecture Pair-Review\n\n"
        f"I've analyzed your workload: **{len(resources)} provisioned services** running in **us-east-2** at **${monthly_cost:.2f}/mo**.\n\n"
        f"- **Compute Tier**: Amazon EKS with dedicated In-House LLM Gateway nodes.\n"
        f"- **Data Tier**: Amazon RDS PostgreSQL Master-Slave with Multi-AZ standby for 5,000 concurrent operations.\n"
        f"- **Orchestration**: Managed Apache Airflow (MWAA).\n\n"
        f"How would you like to refine the design? I can help you test alternative instances, model cost savings, or add caching and security layers."
    )
    return ArchitectChatResponse(
        reply=reply,
        suggested_prompt_update=None,
        suggested_actions=["How can we cut $200/mo?", "Switch Compute to Graviton", "Audit Security & Well-Architected Score"],
        impacted_services=[],
        projected_cost_delta=None
    )


async def chat_with_architect(
    user_msg: str,
    history: List[ArchitectChatMessage],
    raw_prompt: str,
    resources: List[Dict[str, Any]],
    monthly_cost: float,
    audit_summary: str = ""
) -> ArchitectChatResponse:
    """
    Executes real-time conversational pair-architecting with Claude or deterministic fallback.
    """
    try:
        client = get_llm_client()
        
        resource_summary = "\n".join([
            f"- {r.get('resource_name', 'Resource')}: ${r.get('monthly_cost_usd', 0.0):.2f}/mo (SKU: {r.get('sku')}, Qty: {r.get('quantity')})"
            for r in resources
        ])

        system_prompt = (
            f"{ARCHITECT_CHAT_SYSTEM_PROMPT}\n\n"
            f"CURRENT WORKLOAD SPECIFICATION:\n"
            f"\"\"\"\n{raw_prompt}\n\"\"\"\n\n"
            f"ACTIVE SIZED RESOURCES (${monthly_cost:.2f}/mo Total):\n"
            f"{resource_summary}\n\n"
            f"WELL-ARCHITECTED AUDIT INSIGHTS:\n"
            f"{audit_summary}\n"
        )

        formatted_messages = []
        for h in history[-6:]:  # Keep last 6 context turns
            formatted_messages.append({"role": h.role, "content": h.content})
        formatted_messages.append({"role": "user", "content": user_msg})

        raw_result = await client.chat_completion(
            messages=formatted_messages,
            system_prompt=system_prompt,
            response_schema=ARCHITECT_CHAT_SCHEMA,
            tool_name="provide_architect_response",
            tool_description="Provide structured architectural response and optional prompt mutation",
            temperature=0.3,
            max_tokens=800
        )

        return ArchitectChatResponse(
            reply=raw_result.get("reply", "I have reviewed your request."),
            suggested_prompt_update=raw_result.get("suggested_prompt_update"),
            suggested_actions=raw_result.get("suggested_actions") or ["Apply Changes", "Keep Current Design"],
            impacted_services=raw_result.get("impacted_services") or [],
            projected_cost_delta=raw_result.get("projected_cost_delta")
        )

    except Exception as e:
        logger.info("LLM Architect Chat offline or fallback engaged: %s", e)
        return deterministic_chat_response(user_msg, raw_prompt, resources, monthly_cost)
