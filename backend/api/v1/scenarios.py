"""
Scenario generation, resource configuration, and comparison endpoints.
"""
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from api.deps import get_project_or_404
from models.db import Project, Scenario, Conversation, Architecture
from models.schemas import (
    ScenarioResponse,
    ScenarioResource,
    ResourceUpdateRequest,
    AddResourceRequest,
    NaturalLanguageDeltaRequest,
    NaturalLanguageDeltaResponse,
    DeltaClarificationQuestion,
)
from pricing.rate_lookup import lookup_sku_monthly_cost

router = APIRouter()


@router.get("/projects/{id}/scenarios", response_model=List[ScenarioResponse])
async def get_scenarios(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Scenario).where(Scenario.project_id == project.id))
    scenarios = res.scalars().all()
    if not scenarios:
        return await generate_project_scenarios(project, db)

    return [
        ScenarioResponse(
            id=s.id,
            project_id=s.project_id,
            provider=s.provider,
            scenario_type=s.scenario_type,
            resources=[ScenarioResource(**r) for r in s.resources],
            monthly_cost_usd=s.monthly_cost_usd,
            annual_cost_usd=s.annual_cost_usd,
            assumptions=s.assumptions or [],
            exclusions=s.exclusions or [],
            cost_drivers=s.cost_drivers or [],
            limitations=s.limitations or [],
            pricing_as_of=s.pricing_as_of,
            created_at=s.created_at,
        )
        for s in scenarios
    ]


@router.post("/projects/{id}/scenarios/generate", response_model=List[ScenarioResponse])
async def generate_project_scenarios(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    from ai.stages.scenario_generator import generate_scenarios_for_provider

    # Remove existing
    existing = await db.execute(select(Scenario).where(Scenario.project_id == project.id))
    for s in existing.scalars().all():
        await db.delete(s)

    conv_res = await db.execute(select(Conversation).where(Conversation.project_id == project.id))
    conv = conv_res.scalar_one_or_none()
    req = dict(conv.collected_requirements or {}) if conv else {}

    # Prioritize latest Requirements record for complete, non-truncated prompt
    from models.db import Requirements
    req_rec = (await db.execute(
        select(Requirements)
        .where(Requirements.project_id == project.id)
        .order_by(desc(Requirements.version))
    )).scalars().first()

    if req_rec:
        if req_rec.raw_text:
            req["raw_text"] = req_rec.raw_text
        if req_rec.structured_spec and isinstance(req_rec.structured_spec, dict):
            for k, v in req_rec.structured_spec.items():
                if k not in req or req[k] is None:
                    req[k] = v

    if not req.get("raw_text") and project.description:
        req["raw_text"] = project.description

    # Also include any conversation message additions
    if conv and conv.messages:
        chat_parts = []
        for m in conv.messages:
            if isinstance(m, dict) and m.get("content"):
                chat_parts.append(str(m["content"]))
        if chat_parts:
            req["raw_text"] = f"{req.get('raw_text', '')} {' '.join(chat_parts)}"

    providers_to_generate = []
    sel = (project.provider_selection or "both").lower()
    if sel in ["aws", "both"]:
        providers_to_generate.append("aws")
    if sel in ["azure", "both"]:
        providers_to_generate.append("azure")

    created = []
    for prov in providers_to_generate:
        scenarios_data = generate_scenarios_for_provider(prov, req)
        for s_data in scenarios_data:
            scenario = Scenario(
                id=uuid.uuid4(),
                project_id=project.id,
                provider=s_data["provider"],
                scenario_type=s_data["scenario_type"],
                resources=[r.model_dump() for r in s_data["resources"]],
                monthly_cost_usd=s_data["monthly_cost_usd"],
                annual_cost_usd=s_data["annual_cost_usd"],
                assumptions=s_data["assumptions"],
                exclusions=s_data["exclusions"],
                cost_drivers=s_data["cost_drivers"],
                limitations=s_data["limitations"],
            )
            db.add(scenario)
            created.append(scenario)

    project.status = "scenarios_generated"
    # Update monthly cost estimate on project with recommended cost
    rec_cost = sum(s.monthly_cost_usd for s in created if s.scenario_type == "recommended")
    project.monthly_cost_estimate = rec_cost

    await db.commit()

    return [
        ScenarioResponse(
            id=s.id,
            project_id=s.project_id,
            provider=s.provider,
            scenario_type=s.scenario_type,
            resources=[ScenarioResource(**r) for r in s.resources],
            monthly_cost_usd=s.monthly_cost_usd,
            annual_cost_usd=s.annual_cost_usd,
            assumptions=s.assumptions or [],
            exclusions=s.exclusions or [],
            cost_drivers=s.cost_drivers or [],
            limitations=s.limitations or [],
            created_at=s.created_at,
        )
        for s in created
    ]


@router.patch("/projects/{id}/scenarios/{scenario_id}/resources/{resource_id}", response_model=ScenarioResponse)
async def update_resource_configuration(
    id: uuid.UUID,
    scenario_id: uuid.UUID,
    resource_id: str,
    req: ResourceUpdateRequest,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Scenario).where(Scenario.id == scenario_id, Scenario.project_id == project.id)
    )
    scenario = res.scalar_one_or_none()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    resources = list(scenario.resources or [])
    target = None
    for r in resources:
        if r.get("id") == resource_id:
            target = r
            break

    if not target:
        raise HTTPException(status_code=404, detail=f"Resource {resource_id} not found in scenario")

    sku_changed = req.sku is not None and req.sku.strip() != target.get("sku", "").strip()
    if req.resource_name is not None:
        target["resource_name"] = req.resource_name
    if req.region is not None:
        target["region"] = req.region
    if req.sku is not None:
        target["sku"] = req.sku.strip()
    if req.quantity is not None:
        target["quantity"] = max(1, req.quantity)
    if req.config is not None:
        target["config"] = {**(target.get("config") or {}), **req.config}
    if req.pricing_model is not None:
        target["pricing_model"] = req.pricing_model

    # If SKU was changed, automatically re-price based on the new SKU
    if sku_changed:
        new_cost = lookup_sku_monthly_cost(
            provider=scenario.provider,
            service_family=target.get("service_family", ""),
            sku=target["sku"],
            quantity=target.get("quantity", 1),
            availability_config=target.get("availability_config", ""),
            config=target.get("config", {}),
            current_cost=target.get("monthly_cost_usd", 0.0),
        )
        target["monthly_cost_usd"] = new_cost
        target["annual_cost_usd"] = round(new_cost * 12, 2)
    elif req.monthly_cost_usd is not None and req.monthly_cost_usd > 0:
        target["monthly_cost_usd"] = round(float(req.monthly_cost_usd), 2)
        target["annual_cost_usd"] = round(target["monthly_cost_usd"] * 12, 2)
    elif req.quantity is not None:
        qty = target.get("quantity", 1)
        base_unit = target.get("monthly_cost_usd", 30.0) / max(1, target.get("quantity", 1))
        target["monthly_cost_usd"] = round(base_unit * qty, 2)
        target["annual_cost_usd"] = round(target["monthly_cost_usd"] * 12, 2)

    # Persist modified JSON to SQLAlchemy
    scenario.resources = [dict(r) for r in resources]
    flag_modified(scenario, "resources")
    scenario.monthly_cost_usd = round(sum(r.get("monthly_cost_usd", 0.0) for r in scenario.resources), 2)
    scenario.annual_cost_usd = round(scenario.monthly_cost_usd * 12, 2)

    if scenario.scenario_type == "recommended":
        project.monthly_cost_estimate = scenario.monthly_cost_usd
        flag_modified(project, "monthly_cost_estimate")

    await db.commit()
    await db.refresh(scenario)

    return ScenarioResponse(
        id=scenario.id,
        project_id=scenario.project_id,
        provider=scenario.provider,
        scenario_type=scenario.scenario_type,
        resources=[ScenarioResource(**r) for r in scenario.resources],
        monthly_cost_usd=scenario.monthly_cost_usd,
        annual_cost_usd=scenario.annual_cost_usd,
        assumptions=scenario.assumptions or [],
        exclusions=scenario.exclusions or [],
        cost_drivers=scenario.cost_drivers or [],
        limitations=scenario.limitations or [],
        created_at=scenario.created_at,
    )


@router.post("/projects/{id}/scenarios/{scenario_id}/delta-analyze", response_model=NaturalLanguageDeltaResponse)
async def analyze_natural_language_delta(
    id: uuid.UUID,
    scenario_id: uuid.UUID,
    req: NaturalLanguageDeltaRequest,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    """
    Analyzes a natural language delta modification prompt using LLM reasoning (with heuristic fallback).
    If details are ambiguous (e.g. 'add redis', 'add storage', 'add waf'), asks tailored clarification questions.
    Once clarified, returns structured AddResourceRequest with estimated monthly cost.
    """
    res = await db.execute(
        select(Scenario).where(Scenario.id == scenario_id, Scenario.project_id == project.id)
    )
    scenario = res.scalar_one_or_none()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    provider = (req.provider or scenario.provider or "aws").lower()
    text = (req.text or "").strip()
    answers = req.context_answers or {}

    # Check for LLM client availability
    from ai.llm_client import get_llm_client, LLMConfigError
    llm = None
    try:
        llm = get_llm_client()
    except (LLMConfigError, Exception):
        llm = None

    if llm:
        system_prompt = f"""You are a Principal Cloud Solutions Architect helping a user add an incremental service to an existing {provider.upper()} cloud estimate.
Analyze their natural language request: "{text}"
Context answers provided so far: {answers}

Determine:
1. Is the request underspecified? (e.g., they ask for 'redis cache' but didn't specify high availability vs single node, or cache memory size; or 's3 storage' without capacity; or 'waf' without rule complexity).
If answers has already answered the clarification, mark needs_clarification=false.
2. If needs_clarification is true, provide 1 to 2 targeted questions with options.
3. If needs_clarification is false, synthesize the exact resource:
   - resource_name: clean descriptive name
   - service_family: compute|database|storage|networking|security|messaging
   - service_name: official cloud service name (e.g. Amazon ElastiCache, AWS WAF, Azure Cache for Redis)
   - region: {scenario.resources[0].get('region') if scenario.resources else ('us-east-1' if provider=='aws' else 'eastus')}
   - sku: concrete sku (e.g. cache.r6g.large, cache.t4g.medium, Standard_C2, WAF-WebACL-Rules, S3-Standard)
   - quantity: int
   - availability_config: Single-AZ or Multi-AZ
   - rationale: clear technical explanation
   - explanation: user facing summary of the addition
"""
        delta_schema = {
            "type": "object",
            "properties": {
                "needs_clarification": {"type": "boolean"},
                "clarification_questions": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "question": {"type": "string"},
                            "options": {"type": "array", "items": {"type": "string"}},
                            "field_key": {"type": "string"}
                        },
                        "required": ["id", "question", "options"]
                    }
                },
                "suggested_resource": {
                    "type": "object",
                    "properties": {
                        "resource_name": {"type": "string"},
                        "service_family": {"type": "string"},
                        "service_name": {"type": "string"},
                        "region": {"type": "string"},
                        "sku": {"type": "string"},
                        "quantity": {"type": "integer"},
                        "availability_config": {"type": "string"},
                        "pricing_model": {"type": "string"},
                        "rationale": {"type": "string"}
                    }
                },
                "explanation": {"type": "string"}
            },
            "required": ["needs_clarification", "explanation"]
        }

        try:
            llm_result = await llm.chat_completion(
                messages=[{"role": "user", "content": f"User request: {text}. Previous answers: {answers}"}],
                system_prompt=system_prompt,
                response_format_schema=delta_schema,
                temperature=0.2,
            )
            needs_clar = llm_result.get("needs_clarification", False)
            if needs_clar and llm_result.get("clarification_questions"):
                return NaturalLanguageDeltaResponse(
                    needs_clarification=True,
                    clarification_questions=[
                        DeltaClarificationQuestion(**q) for q in llm_result["clarification_questions"]
                    ],
                    explanation=llm_result.get("explanation", "Please clarify these specifications to size accurately.")
                )
            
            sug = llm_result.get("suggested_resource")
            if sug:
                res_obj = AddResourceRequest(
                    resource_name=sug.get("resource_name", "Additional Service"),
                    service_family=sug.get("service_family", "compute"),
                    service_name=sug.get("service_name", "Cloud Service"),
                    region=sug.get("region", "us-east-1" if provider == "aws" else "eastus"),
                    sku=sug.get("sku", "t3.medium"),
                    quantity=max(1, sug.get("quantity", 1)),
                    availability_config=sug.get("availability_config", "Multi-AZ"),
                    pricing_model=sug.get("pricing_model", "on-demand"),
                    rationale=sug.get("rationale", "Added via natural language delta"),
                )
                cost = lookup_sku_monthly_cost(
                    provider=provider,
                    service_family=res_obj.service_family,
                    sku=res_obj.sku,
                    quantity=res_obj.quantity,
                    availability_config=res_obj.availability_config
                )
                return NaturalLanguageDeltaResponse(
                    needs_clarification=False,
                    suggested_resource=res_obj,
                    estimated_monthly_delta=cost,
                    explanation=llm_result.get("explanation", f"Synthesized {res_obj.resource_name} ({res_obj.sku}).")
                )
        except Exception:
            # Fall back to heuristic rule engine below
            pass

    # Deterministic Heuristic Natural Language Parser (when offline or fallback)
    text_lower = text.lower()
    
    # 1. Redis / In-Memory Caching
    if "redis" in text_lower or "cache" in text_lower or "memcached" in text_lower:
        if "tier" not in answers and "ha" not in answers:
            return NaturalLanguageDeltaResponse(
                needs_clarification=True,
                clarification_questions=[
                    DeltaClarificationQuestion(
                        id="redis_ha",
                        question="Do you require Multi-AZ High Availability with automatic failover for Redis?",
                        options=["Multi-AZ (Primary + Read Replica) - Recommended", "Single-Node Standalone (Cost-Optimized)"],
                        field_key="ha"
                    ),
                    DeltaClarificationQuestion(
                        id="redis_size",
                        question="What expected in-memory cache capacity do you anticipate?",
                        options=["Moderate (3 GB to 6 GB RAM, e.g. r6g.large / Standard_C2)", "Entry / Dev (1 GB to 2 GB RAM, e.g. t4g.medium / Basic_C1)", "Heavy / Enterprise (12+ GB RAM)"],
                        field_key="size"
                    )
                ],
                explanation="Caching configuration requires availability tier and memory sizing."
            )
        
        is_ha = "single" not in answers.get("ha", "").lower()
        is_large = "moderate" in answers.get("size", "").lower() or "heavy" in answers.get("size", "").lower()
        if provider == "aws":
            sku = "cache.r6g.large" if is_large else "cache.t4g.medium"
            qty = 2 if is_ha else 1
            res_obj = AddResourceRequest(
                resource_name="ElastiCache Redis Cache Tier",
                service_family="database",
                service_name="Amazon ElastiCache",
                region="us-east-2",
                sku=sku,
                quantity=qty,
                availability_config="Multi-AZ" if is_ha else "Single-AZ",
                pricing_model="on-demand",
                rationale="In-memory cache for sub-millisecond query responses and session management."
            )
        else:
            sku = "Standard_C2" if is_ha else "Basic_C1"
            qty = 1
            res_obj = AddResourceRequest(
                resource_name="Azure Cache for Redis",
                service_family="database",
                service_name="Azure Cache for Redis",
                region="eastus",
                sku=sku,
                quantity=qty,
                availability_config="Zone-Redundant" if is_ha else "Basic",
                pricing_model="on-demand",
                rationale="Enterprise in-memory caching tier on Azure."
            )
        cost = lookup_sku_monthly_cost(provider, "database", res_obj.sku, res_obj.quantity, res_obj.availability_config)
        return NaturalLanguageDeltaResponse(
            needs_clarification=False,
            suggested_resource=res_obj,
            estimated_monthly_delta=cost,
            explanation=f"Configured {res_obj.resource_name} ({res_obj.sku}) based on your requirements."
        )

    # 2. WAF / Security / Firewall
    if "waf" in text_lower or "firewall" in text_lower or "ddos" in text_lower or "security" in text_lower:
        if provider == "aws":
            res_obj = AddResourceRequest(
                resource_name="AWS WAF & Shield Perimeter",
                service_family="security",
                service_name="AWS WAF",
                region="us-east-1",
                sku="WAF-WebACL-Rules",
                quantity=1,
                availability_config="Multi-AZ",
                pricing_model="on-demand",
                rationale="Protects application from web exploits, bots, and Layer 7 attacks."
            )
        else:
            res_obj = AddResourceRequest(
                resource_name="Azure Firewall Tier",
                service_family="security",
                service_name="Azure Firewall",
                region="eastus",
                sku="Standard_Firewall",
                quantity=1,
                availability_config="Zone-Redundant",
                pricing_model="on-demand",
                rationale="Cloud-native network firewall security service."
            )
        cost = lookup_sku_monthly_cost(provider, "security", res_obj.sku, res_obj.quantity)
        return NaturalLanguageDeltaResponse(
            needs_clarification=False,
            suggested_resource=res_obj,
            estimated_monthly_delta=cost,
            explanation=f"Added {res_obj.resource_name} for perimeter defense."
        )

    # 3. CDN / Content Delivery / Front Door
    if "cdn" in text_lower or "cloudfront" in text_lower or "front door" in text_lower or "edge" in text_lower:
        if provider == "aws":
            res_obj = AddResourceRequest(
                resource_name="Amazon CloudFront CDN Distribution",
                service_family="networking",
                service_name="Amazon CloudFront",
                region="global",
                sku="CloudFront-DataTransfer-1TB",
                quantity=1,
                availability_config="Multi-Region",
                pricing_model="on-demand",
                rationale="Global content delivery network with edge SSL termination."
            )
        else:
            res_obj = AddResourceRequest(
                resource_name="Azure Front Door Standard",
                service_family="networking",
                service_name="Azure Front Door",
                region="global",
                sku="Standard-Profile",
                quantity=1,
                availability_config="Global",
                pricing_model="on-demand",
                rationale="Scalable and secure entry point for fast web applications."
            )
        cost = lookup_sku_monthly_cost(provider, "networking", res_obj.sku, res_obj.quantity)
        return NaturalLanguageDeltaResponse(
            needs_clarification=False,
            suggested_resource=res_obj,
            estimated_monthly_delta=cost,
            explanation=f"Added {res_obj.resource_name}."
        )

    # 4. Storage / S3 / Blob Storage
    if "storage" in text_lower or "s3" in text_lower or "blob" in text_lower or "bucket" in text_lower:
        if "capacity" not in answers:
            return NaturalLanguageDeltaResponse(
                needs_clarification=True,
                clarification_questions=[
                    DeltaClarificationQuestion(
                        id="storage_capacity",
                        question="How much object storage capacity do you estimate for this bucket?",
                        options=["500 GB (Standard Web / Documents)", "2,000 GB (2 TB - Media / Backups)", "10,000 GB (10 TB - Big Data / Archives)"],
                        field_key="capacity"
                    )
                ],
                explanation="Object storage pricing is tied directly to stored gigabytes and tier."
            )
        is_large = "2,000" in answers.get("capacity", "") or "10,000" in answers.get("capacity", "")
        gb = 2000 if "2,000" in answers.get("capacity", "") else (10000 if "10,000" in answers.get("capacity", "") else 500)
        if provider == "aws":
            res_obj = AddResourceRequest(
                resource_name="Amazon S3 Object Storage Bucket",
                service_family="storage",
                service_name="Amazon Simple Storage Service",
                region="us-east-2",
                sku=f"S3-Standard-{gb}GB",
                quantity=1,
                availability_config="Multi-AZ",
                config={"storage_gb": gb},
                rationale=f"Scalable object storage bucket sized for {gb} GB."
            )
        else:
            res_obj = AddResourceRequest(
                resource_name="Azure Blob Storage Account",
                service_family="storage",
                service_name="Azure Storage",
                region="eastus",
                sku=f"Blob-Standard-Hot-{gb}GB",
                quantity=1,
                availability_config="Zone-Redundant",
                config={"storage_gb": gb},
                rationale=f"Hot tier blob storage sized for {gb} GB."
            )
        cost = lookup_sku_monthly_cost(provider, "storage", res_obj.sku, res_obj.quantity, config=res_obj.config)
        return NaturalLanguageDeltaResponse(
            needs_clarification=False,
            suggested_resource=res_obj,
            estimated_monthly_delta=cost,
            explanation=f"Added {res_obj.resource_name} sized at {gb} GB."
        )

    # 5. Generic / Compute fallback
    sku = "t3.large" if provider == "aws" else "Standard_D2s_v5"
    res_obj = AddResourceRequest(
        resource_name=f"Custom {text[:30]} Service",
        service_family="compute",
        service_name="Compute Instance",
        region="us-east-2" if provider == "aws" else "eastus",
        sku=sku,
        quantity=1,
        availability_config="Multi-AZ",
        pricing_model="on-demand",
        rationale=f"Added via prompt: {text}"
    )
    cost = lookup_sku_monthly_cost(provider, "compute", res_obj.sku, res_obj.quantity)
    return NaturalLanguageDeltaResponse(
        needs_clarification=False,
        suggested_resource=res_obj,
        estimated_monthly_delta=cost,
        explanation=f"Configured {res_obj.resource_name} with general purpose compute SKU ({res_obj.sku})."
    )

def map_resource_to_other_provider(req: AddResourceRequest, src_provider: str, dst_provider: str) -> dict:
    fam = (req.service_family or "").lower()
    res_name = (req.resource_name or "").lower()
    sku = (req.sku or "").lower()
    cfg = dict(req.config or {})

    if dst_provider.lower() == "azure":
        region = "eastus"
        if "airflow" in res_name or "mwaa" in res_name or "airflow" in sku:
            return {
                "resource_name": "Azure Data Factory (Managed Apache Airflow)",
                "service_family": "compute",
                "service_name": "Azure Data Factory",
                "region": region,
                "sku": "Airflow Small (2.0 vCPU, 4 GB RAM)",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Fully Managed Azure Runtime",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"Azure equivalent of {req.resource_name} ({req.rationale or 'Added via delta sync'})"
            }
        elif "llm gateway" in res_name or "ilm gateway" in res_name:
            return {
                "resource_name": "In-House LLM Gateway (VMSS)",
                "service_family": "compute",
                "service_name": "Virtual Machines",
                "region": region,
                "sku": "Standard_D4s_v5",
                "quantity": req.quantity or 2,
                "config": cfg,
                "availability_config": "Zone-Redundant",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"Azure equivalent of {req.resource_name}"
            }
        elif "replica" in res_name or "slave" in res_name:
            return {
                "resource_name": "Azure Database for PostgreSQL Flexible Server (Read Replica - Slave)",
                "service_family": "database",
                "service_name": "Azure Database for PostgreSQL",
                "region": region,
                "sku": "GP_Gen5_4",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Asynchronous Read Replica",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"Azure equivalent read replica of {req.resource_name}"
            }
        elif fam == "database" or "rds" in res_name or "postgres" in res_name:
            return {
                "resource_name": "Azure Database for PostgreSQL Flexible Server (Master Writer)",
                "service_family": "database",
                "service_name": "Azure Database for PostgreSQL",
                "region": region,
                "sku": "GP_Gen5_4",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Zone-Redundant",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"Azure equivalent of {req.resource_name}"
            }
        elif fam == "security" and ("secret" in res_name or "secrets manager" in res_name):
            sec_count = cfg.get("secrets_count", 5)
            return {
                "resource_name": f"Azure Key Vault ({sec_count} Secrets)",
                "service_family": "security",
                "service_name": "Key Vault",
                "region": region,
                "sku": "Standard Tier",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Regional Resilient",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"Azure equivalent of {req.resource_name}"
            }
        elif fam == "storage" or "s3" in res_name or "s3" in sku or "bucket" in res_name:
            gb = cfg.get("storage_gb", 100)
            return {
                "resource_name": "Azure Blob Storage Account",
                "service_family": "storage",
                "service_name": "Azure Storage",
                "region": region,
                "sku": f"Blob-Standard-Hot-{gb}GB",
                "quantity": req.quantity,
                "config": {"storage_gb": gb},
                "availability_config": "Zone-Redundant",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"Azure equivalent of {req.resource_name} ({req.rationale or 'Added via delta update'})"
            }
        elif "redis" in res_name or "redis" in sku or "cache" in res_name:
            return {
                "resource_name": "Azure Cache for Redis",
                "service_family": "database",
                "service_name": "Azure Cache for Redis",
                "region": region,
                "sku": "Standard_C2",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Zone-Redundant",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"Azure equivalent of {req.resource_name} ({req.rationale or 'Added via delta update'})"
            }
        elif fam == "security" or "waf" in res_name or "waf" in sku:
            return {
                "resource_name": "Azure Web Application Firewall",
                "service_family": "security",
                "service_name": "Azure Application Gateway / WAF",
                "region": region,
                "sku": "WAF-Standard",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Zone-Redundant",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"Azure equivalent of {req.resource_name}"
            }
        elif fam == "messaging" or "queue" in res_name or "sqs" in res_name:
            return {
                "resource_name": "Azure Service Bus Standard",
                "service_family": "messaging",
                "service_name": "Azure Service Bus",
                "region": region,
                "sku": "ServiceBus-Standard",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Zone-Redundant",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"Azure equivalent of {req.resource_name}"
            }
        else:
            return {
                "resource_name": f"Azure {req.resource_name}",
                "service_family": fam or "compute",
                "service_name": "Azure Compute",
                "region": region,
                "sku": "Standard_D2s_v5",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Zone-Redundant",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"Azure equivalent of {req.resource_name}"
            }
    else:
        # dst_provider == "aws"
        region = "us-east-1"
        if "airflow" in res_name or "data factory" in res_name or "airflow" in sku:
            return {
                "resource_name": "Amazon MWAA (Managed Apache Airflow)",
                "service_family": "compute",
                "service_name": "AmazonMWAA",
                "region": region,
                "sku": "mw1.small",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Managed Multi-AZ Airflow Environment",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"AWS equivalent of {req.resource_name} ({req.rationale or 'Added via delta sync'})"
            }
        elif "llm gateway" in res_name or "ilm gateway" in res_name:
            return {
                "resource_name": "In-House LLM Gateway Cluster",
                "service_family": "compute",
                "service_name": "AmazonEC2",
                "region": region,
                "sku": "c7i.large",
                "quantity": req.quantity or 2,
                "config": cfg,
                "availability_config": "Multi-AZ",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"AWS equivalent of {req.resource_name}"
            }
        elif "replica" in res_name or "slave" in res_name:
            return {
                "resource_name": "Amazon RDS PostgreSQL Read Replica (Slave)",
                "service_family": "database",
                "service_name": "AmazonRDS",
                "region": region,
                "sku": "db.m6i.large",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Asynchronous Streaming Replication",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"AWS equivalent read replica of {req.resource_name}"
            }
        elif fam == "database" or "flexible server" in res_name or "postgres" in res_name:
            return {
                "resource_name": "Amazon RDS PostgreSQL Master (Writer)",
                "service_family": "database",
                "service_name": "AmazonRDS",
                "region": region,
                "sku": "db.m6i.xlarge",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Multi-AZ",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"AWS equivalent of {req.resource_name}"
            }
        elif fam == "security" and ("secret" in res_name or "key vault" in res_name):
            sec_count = cfg.get("secrets_count", 5)
            return {
                "resource_name": f"AWS Secrets Manager ({sec_count} Secrets)",
                "service_family": "security",
                "service_name": "AWSSecretsManager",
                "region": region,
                "sku": "Secrets Management",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Regional High Availability",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"AWS equivalent of {req.resource_name}"
            }
        elif fam == "storage" or "blob" in res_name or "blob" in sku or "storage" in res_name:
            gb = cfg.get("storage_gb", 100)
            return {
                "resource_name": "Amazon S3 Object Storage Bucket",
                "service_family": "storage",
                "service_name": "Amazon Simple Storage Service",
                "region": region,
                "sku": f"S3-Standard-{gb}GB",
                "quantity": req.quantity,
                "config": {"storage_gb": gb},
                "availability_config": "Multi-AZ",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"AWS equivalent of {req.resource_name} ({req.rationale or 'Added via delta update'})"
            }
        elif "redis" in res_name or "redis" in sku or "cache" in res_name:
            return {
                "resource_name": "Amazon ElastiCache Redis Cluster",
                "service_family": "database",
                "service_name": "Amazon ElastiCache",
                "region": region,
                "sku": "cache.r6g.large",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Multi-AZ",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"AWS equivalent of {req.resource_name} ({req.rationale or 'Added via delta update'})"
            }
        elif fam == "security" or "waf" in res_name or "waf" in sku:
            return {
                "resource_name": "AWS WAF Web ACL",
                "service_family": "security",
                "service_name": "AWS WAF",
                "region": region,
                "sku": "WAF-WebACL-Rules",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Multi-AZ",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"AWS equivalent of {req.resource_name}"
            }
        elif fam == "messaging" or "queue" in res_name or "bus" in res_name:
            return {
                "resource_name": "Amazon Simple Queue Service",
                "service_family": "messaging",
                "service_name": "Amazon SQS",
                "region": region,
                "sku": "SQS-Standard",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Multi-AZ",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"AWS equivalent of {req.resource_name}"
            }
        else:
            return {
                "resource_name": f"AWS {req.resource_name}",
                "service_family": fam or "compute",
                "service_name": "Amazon EC2",
                "region": region,
                "sku": "t3.large",
                "quantity": req.quantity,
                "config": cfg,
                "availability_config": "Multi-AZ",
                "pricing_model": req.pricing_model or "on-demand",
                "rationale": f"AWS equivalent of {req.resource_name}"
            }


@router.post("/projects/{id}/scenarios/{scenario_id}/resources", response_model=ScenarioResponse)
async def add_resource_to_scenario(
    id: uuid.UUID,
    scenario_id: uuid.UUID,
    req: AddResourceRequest,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    """
    Delta update: Add a new service line-item to an existing scenario and automatically reprice.
    Synchronizes equivalent resource to the other cloud provider if multi-cloud is selected.
    """
    res = await db.execute(
        select(Scenario).where(Scenario.id == scenario_id, Scenario.project_id == project.id)
    )
    scenario = res.scalar_one_or_none()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    new_id = f"delta-{uuid.uuid4().hex[:8]}"
    sync_id = f"sync-{uuid.uuid4().hex[:8]}"

    monthly_cost = lookup_sku_monthly_cost(
        provider=scenario.provider,
        service_family=req.service_family,
        sku=req.sku,
        quantity=req.quantity,
        availability_config=req.availability_config,
        config=req.config,
    )

    new_resource = {
        "id": new_id,
        "delta_sync_id": sync_id,
        "resource_name": req.resource_name,
        "provider": scenario.provider,
        "service_family": req.service_family,
        "service_name": req.service_name,
        "region": req.region,
        "sku": req.sku,
        "quantity": req.quantity,
        "config": req.config,
        "availability_config": req.availability_config,
        "pricing_model": req.pricing_model,
        "monthly_cost_usd": monthly_cost,
        "annual_cost_usd": round(monthly_cost * 12, 2),
        "rationale": req.rationale,
        "assumptions": ["Added via post-estimate delta update"],
        "confidence": 0.95,
        "validation_status": "validated",
        "pricing_source": "rate_lookup",
        "is_optional": False,
    }

    resources = list(scenario.resources or [])
    resources.append(new_resource)
    scenario.resources = resources
    flag_modified(scenario, "resources")

    scenario.monthly_cost_usd = round(sum(r.get("monthly_cost_usd", 0.0) for r in scenario.resources), 2)
    scenario.annual_cost_usd = round(scenario.monthly_cost_usd * 12, 2)

    # Cross-cloud delta update: also update the corresponding scenario in the other provider if present
    from sqlalchemy import func
    current_p = (scenario.provider or "").lower()
    other_provider = "azure" if current_p == "aws" else "aws"
    other_res = await db.execute(
        select(Scenario).where(
            Scenario.project_id == project.id,
            func.lower(Scenario.provider) == other_provider,
            Scenario.scenario_type == scenario.scenario_type
        )
    )
    other_scenarios = other_res.scalars().all()
    for other_scenario in other_scenarios:
        mapped = map_resource_to_other_provider(req, scenario.provider, other_provider)
        other_cost = lookup_sku_monthly_cost(
            provider=other_provider,
            service_family=mapped["service_family"],
            sku=mapped["sku"],
            quantity=mapped["quantity"],
            availability_config=mapped["availability_config"],
            config=mapped["config"],
        )
        other_resource = {
            "id": f"delta-{uuid.uuid4().hex[:8]}",
            "delta_sync_id": sync_id,
            "resource_name": mapped["resource_name"],
            "provider": other_scenario.provider,
            "service_family": mapped["service_family"],
            "service_name": mapped["service_name"],
            "region": mapped["region"],
            "sku": mapped["sku"],
            "quantity": mapped["quantity"],
            "config": mapped["config"],
            "availability_config": mapped["availability_config"],
            "pricing_model": mapped["pricing_model"],
            "monthly_cost_usd": other_cost,
            "annual_cost_usd": round(other_cost * 12, 2),
            "rationale": mapped["rationale"],
            "assumptions": ["Added via cross-cloud delta sync"],
            "confidence": 0.95,
            "validation_status": "validated",
            "pricing_source": "rate_lookup",
            "is_optional": False,
        }
        other_resources = list(other_scenario.resources or [])
        other_resources.append(other_resource)
        other_scenario.resources = other_resources
        flag_modified(other_scenario, "resources")
        other_scenario.monthly_cost_usd = round(sum(r.get("monthly_cost_usd", 0.0) for r in other_scenario.resources), 2)
        other_scenario.annual_cost_usd = round(other_scenario.monthly_cost_usd * 12, 2)

    if scenario.scenario_type == "recommended":
        all_rec = await db.execute(
            select(Scenario).where(
                Scenario.project_id == project.id,
                Scenario.scenario_type == "recommended"
            )
        )
        project.monthly_cost_estimate = round(sum(s.monthly_cost_usd for s in all_rec.scalars().all()), 2)
        flag_modified(project, "monthly_cost_estimate")

    await db.commit()
    await db.refresh(scenario)

    return ScenarioResponse(
        id=scenario.id,
        project_id=scenario.project_id,
        provider=scenario.provider,
        scenario_type=scenario.scenario_type,
        resources=[ScenarioResource(**r) for r in scenario.resources],
        monthly_cost_usd=scenario.monthly_cost_usd,
        annual_cost_usd=scenario.annual_cost_usd,
        assumptions=scenario.assumptions or [],
        exclusions=scenario.exclusions or [],
        cost_drivers=scenario.cost_drivers or [],
        limitations=scenario.limitations or [],
        created_at=scenario.created_at,
    )


@router.delete("/projects/{id}/scenarios/{scenario_id}/resources/{resource_id}", response_model=ScenarioResponse)
async def delete_resource_from_scenario(
    id: uuid.UUID,
    scenario_id: uuid.UUID,
    resource_id: str,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    """
    Remove a service line item from a scenario.
    If the resource was cross-cloud synchronized, removes the corresponding resource from the other cloud too.
    """
    res = await db.execute(
        select(Scenario).where(Scenario.id == scenario_id, Scenario.project_id == project.id)
    )
    scenario = res.scalar_one_or_none()
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")

    target_res = next((r for r in (scenario.resources or []) if r.get("id") == resource_id), None)
    sync_id = target_res.get("delta_sync_id") if target_res else None

    resources = [r for r in (scenario.resources or []) if r.get("id") != resource_id]
    scenario.resources = resources
    flag_modified(scenario, "resources")

    scenario.monthly_cost_usd = round(sum(r.get("monthly_cost_usd", 0.0) for r in scenario.resources), 2)
    scenario.annual_cost_usd = round(scenario.monthly_cost_usd * 12, 2)

    if sync_id:
        from sqlalchemy import func
        current_p = (scenario.provider or "").lower()
        other_provider = "azure" if current_p == "aws" else "aws"
        other_res = await db.execute(
            select(Scenario).where(
                Scenario.project_id == project.id,
                func.lower(Scenario.provider) == other_provider,
                Scenario.scenario_type == scenario.scenario_type
            )
        )
        other_scenarios = other_res.scalars().all()
        for other_scenario in other_scenarios:
            other_scenario.resources = [r for r in (other_scenario.resources or []) if r.get("delta_sync_id") != sync_id]
            flag_modified(other_scenario, "resources")
            other_scenario.monthly_cost_usd = round(sum(r.get("monthly_cost_usd", 0.0) for r in other_scenario.resources), 2)
            other_scenario.annual_cost_usd = round(other_scenario.monthly_cost_usd * 12, 2)

    if scenario.scenario_type == "recommended":
        all_rec = await db.execute(
            select(Scenario).where(
                Scenario.project_id == project.id,
                Scenario.scenario_type == "recommended"
            )
        )
        project.monthly_cost_estimate = round(sum(s.monthly_cost_usd for s in all_rec.scalars().all()), 2)
        flag_modified(project, "monthly_cost_estimate")

    await db.commit()
    await db.refresh(scenario)

    return ScenarioResponse(
        id=scenario.id,
        project_id=scenario.project_id,
        provider=scenario.provider,
        scenario_type=scenario.scenario_type,
        resources=[ScenarioResource(**r) for r in scenario.resources],
        monthly_cost_usd=scenario.monthly_cost_usd,
        annual_cost_usd=scenario.annual_cost_usd,
        assumptions=scenario.assumptions or [],
        exclusions=scenario.exclusions or [],
        cost_drivers=scenario.cost_drivers or [],
        limitations=scenario.limitations or [],
        created_at=scenario.created_at,
    )
