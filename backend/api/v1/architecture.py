"""
Architecture generation and interactive diagram endpoints.
"""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc, delete
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from api.deps import get_project_or_404
from models.db import Project, Architecture, Conversation
from models.schemas import ArchitectureResponse, ArchitectureService, DiagramData
from ai.stages.architecture_selector import build_architecture_graph

router = APIRouter()


@router.get("/projects/{id}/architecture", response_model=List[ArchitectureResponse])
async def get_architectures(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Architecture)
        .where(Architecture.project_id == project.id)
        .order_by(desc(Architecture.version))
    )
    archs = res.scalars().all()
    if not archs:
        # Auto-generate if not yet present
        return await generate_architectures(project, db)

    return [
        ArchitectureResponse(
            id=a.id,
            project_id=a.project_id,
            version=a.version,
            provider=a.provider,
            services=[ArchitectureService(**s) for s in a.services],
            diagram_data=DiagramData(**a.diagram_data),
            created_at=a.created_at,
        )
        for a in archs
    ]


@router.patch("/projects/{id}/architecture/{arch_id}", response_model=ArchitectureResponse)
async def update_architecture(
    arch_id: uuid.UUID,
    payload: dict,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(Architecture).where(Architecture.id == arch_id, Architecture.project_id == project.id)
    )
    arch = res.scalar_one_or_none()
    if not arch:
        raise HTTPException(status_code=404, detail="Architecture not found")

    if "services" in payload:
        arch.services = payload["services"]
    if "diagram_data" in payload:
        arch.diagram_data = payload["diagram_data"]

    await db.commit()
    await db.refresh(arch)

    return ArchitectureResponse(
        id=arch.id,
        project_id=arch.project_id,
        version=arch.version,
        provider=arch.provider,
        services=[ArchitectureService(**s) for s in arch.services],
        diagram_data=DiagramData(**arch.diagram_data),
        created_at=arch.created_at,
    )


@router.post("/projects/{id}/architecture/generate", response_model=List[ArchitectureResponse])
async def generate_architectures(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    # Fetch collected requirements
    conv_res = await db.execute(select(Conversation).where(Conversation.project_id == project.id))
    conv = conv_res.scalar_one_or_none()
    req = dict(conv.collected_requirements or {}) if conv else {}

    # Enrich req with project description, prompt, and conversation chat history
    chat_parts = []
    if project.description:
        chat_parts.append(project.description)
    if conv and conv.messages:
        for m in conv.messages:
            if isinstance(m, dict) and m.get("content"):
                chat_parts.append(str(m["content"]))
    existing_raw = req.get("raw_text", "")
    req["raw_text"] = f"{existing_raw} {' '.join(chat_parts)}"

    providers_to_generate = []
    sel = (project.provider_selection or "both").lower()
    if sel in ["aws", "both"]:
        providers_to_generate.append("aws")
    if sel in ["azure", "both"]:
        providers_to_generate.append("azure")

    # Remove prior architecture records for project if re-generating
    await db.execute(delete(Architecture).where(Architecture.project_id == project.id))

    created = []
    for prov in providers_to_generate:
        services, diag_data = build_architecture_graph(prov, req)
        arch = Architecture(
            id=uuid.uuid4(),
            project_id=project.id,
            version=1,
            provider=prov,
            services=[s.model_dump() for s in services],
            diagram_data=diag_data.model_dump(),
        )
        db.add(arch)
        created.append(arch)

    project.status = "architecture_generated"
    await db.commit()

    return [
        ArchitectureResponse(
            id=a.id,
            project_id=a.project_id,
            version=a.version,
            provider=a.provider,
            services=[ArchitectureService(**s) for s in a.services],
            diagram_data=DiagramData(**a.diagram_data),
            created_at=a.created_at,
        )
        for a in created
    ]
