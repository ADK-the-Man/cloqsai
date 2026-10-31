"""
Project management CRUD endpoints.
"""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.security import get_current_user
from api.deps import get_project_or_404
from models.db import User, Project, Conversation, Scenario
from models.schemas import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListResponse
from pricing.freshness_engine import compute_freshness_report

router = APIRouter()


@router.get("/projects", response_model=ProjectListResponse)
async def list_projects(
    search: Optional[str] = None,
    provider: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    query = select(Project).where(Project.user_id == current_user.id)
    if search:
        query = query.where(Project.name.ilike(f"%{search}%"))
    if provider and provider != "all":
        query = query.where(Project.provider_selection == provider)
    if status_filter:
        query = query.where(Project.status == status_filter)

    query = query.order_by(desc(Project.updated_at))
    res = await db.execute(query)
    projects = res.scalars().all()

    project_ids = [p.id for p in projects]
    scenario_map = {}
    if project_ids:
        scen_res = await db.execute(
            select(Scenario).where(Scenario.project_id.in_(project_ids))
        )
        all_scens = scen_res.scalars().all()
        for s in all_scens:
            if s.project_id not in scenario_map or s.scenario_type == "recommended":
                scenario_map[s.project_id] = s

    result_projects = []
    for p in projects:
        p_resp = ProjectResponse.model_validate(p)
        scen = scenario_map.get(p.id)
        if scen:
            p_resp.has_scenarios = True
            p_resp.latest_scenario_id = scen.id
            p_resp.freshness = compute_freshness_report(scen)
            if not p_resp.monthly_cost_estimate and scen.monthly_cost_usd:
                p_resp.monthly_cost_estimate = scen.monthly_cost_usd
        else:
            p_resp.has_scenarios = False
            p_resp.latest_scenario_id = None
            p_resp.freshness = None
        result_projects.append(p_resp)

    return ProjectListResponse(
        projects=result_projects,
        total=len(result_projects)
    )


@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    req: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    project = Project(
        id=uuid.uuid4(),
        user_id=current_user.id,
        name=req.name,
        description=req.description,
        provider_selection=req.provider_selection,
        status="draft",
    )
    db.add(project)

    # Initialize associated conversation record
    conv = Conversation(
        id=uuid.uuid4(),
        project_id=project.id,
        messages=[],
        collected_requirements={"raw_text": req.raw_requirements_text or req.description},
        questions_asked=[],
        is_complete=False,
        completeness_score=0.2,
    )
    db.add(conv)
    await db.commit()
    await db.refresh(project)

    return ProjectResponse.model_validate(project)


@router.get("/projects/{id}", response_model=ProjectResponse)
async def get_project(project: Project = Depends(get_project_or_404)):
    return ProjectResponse.model_validate(project)


@router.patch("/projects/{id}", response_model=ProjectResponse)
async def update_project(
    req: ProjectUpdate,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    if req.name is not None:
        project.name = req.name
    if req.description is not None:
        project.description = req.description
    if req.provider_selection is not None:
        project.provider_selection = req.provider_selection
    if req.status is not None:
        project.status = req.status

    await db.commit()
    await db.refresh(project)
    return ProjectResponse.model_validate(project)


@router.delete("/projects/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    # Phase 3: Clean up physical disk artifacts associated with this project
    try:
        from core.config import settings
        from models.db import Artifact
        from pathlib import Path
        import shutil

        res = await db.execute(select(Artifact).where(Artifact.project_id == project.id))
        project_artifacts = res.scalars().all()
        for art in project_artifacts:
            try:
                p = Path(art.file_path)
                if p.exists() and p.is_file():
                    p.unlink(missing_ok=True)
                # If job directory is empty, remove it
                if p.parent.exists() and not any(p.parent.iterdir()):
                    shutil.rmtree(p.parent, ignore_errors=True)
            except Exception as fe:
                logger.warning(f"Could not delete physical artifact {art.file_path}: {fe}")
    except Exception as e:
        logger.warning(f"Error during physical artifact cleanup for project {project.id}: {e}")

    await db.delete(project)
    await db.commit()
    return None
