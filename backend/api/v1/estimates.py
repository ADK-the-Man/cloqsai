"""
Estimate execution and job management endpoints.
"""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from api.deps import get_project_or_404
from models.db import Project, Scenario, EstimateJob, Artifact
from models.schemas import EstimateCreateRequest, EstimateJobResponse, ArtifactResponse, EstimateSyncResponse, EstimateFreshnessReport
from jobs.worker import submit_job
from jobs.job_states import JobState
from pricing.freshness_engine import compute_freshness_report, sync_scenario_estimate

router = APIRouter()


@router.post("/projects/{id}/estimates", response_model=List[EstimateJobResponse])
async def create_estimate_jobs(
    req: EstimateCreateRequest,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    jobs_created = []
    for s_id in req.scenario_ids:
        scen_res = await db.execute(
            select(Scenario).where(Scenario.id == s_id, Scenario.project_id == project.id)
        )
        scenario = scen_res.scalar_one_or_none()
        if not scenario:
            raise HTTPException(status_code=400, detail=f"Scenario {s_id} does not belong to project")

        job = EstimateJob(
            id=uuid.uuid4(),
            project_id=project.id,
            scenario_id=scenario.id,
            provider=scenario.provider,
            status=JobState.PENDING.value,
            status_message="Queued for pricing calculation",
            job_metadata={"scenario_type": scenario.scenario_type},
        )
        db.add(job)
        jobs_created.append(job)

    project.status = "estimate_in_progress"
    await db.commit()

    # Enqueue jobs into worker
    for job in jobs_created:
        await submit_job(str(job.id))

    return [
        EstimateJobResponse(
            id=j.id,
            project_id=j.project_id,
            scenario_id=j.scenario_id,
            provider=j.provider,
            status=j.status,
            status_message=j.status_message,
            job_metadata=j.job_metadata or {},
            artifacts=[],
            created_at=j.created_at,
            updated_at=j.updated_at,
            completed_at=j.completed_at,
        )
        for j in jobs_created
    ]


@router.get("/projects/{id}/estimates", response_model=List[EstimateJobResponse])
async def list_project_estimates(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(EstimateJob)
        .where(EstimateJob.project_id == project.id)
        .order_by(desc(EstimateJob.created_at))
    )
    jobs = res.scalars().all()

    output = []
    for j in jobs:
        art_res = await db.execute(select(Artifact).where(Artifact.estimate_job_id == j.id))
        artifacts = art_res.scalars().all()

        scen_res = await db.execute(select(Scenario).where(Scenario.id == j.scenario_id))
        scenario = scen_res.scalar_one_or_none()
        freshness = compute_freshness_report(scenario) if scenario else None

        output.append(EstimateJobResponse(
            id=j.id,
            project_id=j.project_id,
            scenario_id=j.scenario_id,
            provider=j.provider,
            status=j.status,
            status_message=j.status_message,
            job_metadata=j.job_metadata or {},
            error_detail=j.error_detail,
            freshness=freshness,
            artifacts=[
                ArtifactResponse(
                    id=a.id,
                    estimate_job_id=a.estimate_job_id,
                    file_name=a.file_name,
                    file_type=a.file_type,
                    provenance=a.provenance,
                    provenance_label=a.provenance_label,
                    file_size=a.file_size,
                    checksum=a.checksum,
                    download_count=a.download_count,
                    is_valid=a.is_valid,
                    validation_message=a.validation_message,
                    download_url=f"/api/v1/artifacts/{a.id}/download",
                    created_at=a.created_at,
                )
                for a in artifacts
            ],
            created_at=j.created_at,
            updated_at=j.updated_at,
            completed_at=j.completed_at,
        ))

    return output


@router.get("/projects/{id}/estimates/{estimate_id}", response_model=EstimateJobResponse)
async def get_estimate_status(
    estimate_id: uuid.UUID,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(EstimateJob).where(EstimateJob.id == estimate_id, EstimateJob.project_id == project.id)
    )
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Estimate job not found")

    art_res = await db.execute(select(Artifact).where(Artifact.estimate_job_id == job.id))
    artifacts = art_res.scalars().all()

    return EstimateJobResponse(
        id=job.id,
        project_id=job.project_id,
        scenario_id=job.scenario_id,
        provider=job.provider,
        status=job.status,
        status_message=job.status_message,
        job_metadata=job.job_metadata or {},
        error_detail=job.error_detail,
        artifacts=[
            ArtifactResponse(
                id=a.id,
                estimate_job_id=a.estimate_job_id,
                file_name=a.file_name,
                file_type=a.file_type,
                provenance=a.provenance,
                provenance_label=a.provenance_label,
                file_size=a.file_size,
                checksum=a.checksum,
                download_count=a.download_count,
                is_valid=a.is_valid,
                validation_message=a.validation_message,
                download_url=f"/api/v1/artifacts/{a.id}/download",
                created_at=a.created_at,
            )
            for a in artifacts
        ],
        created_at=job.created_at,
        updated_at=job.updated_at,
        completed_at=job.completed_at,
    )


@router.post("/projects/{id}/estimates/{estimate_id}/retry", response_model=EstimateJobResponse)
async def retry_estimate_job(
    estimate_id: uuid.UUID,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(
        select(EstimateJob).where(EstimateJob.id == estimate_id, EstimateJob.project_id == project.id)
    )
    job = res.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Estimate job not found")

    job.status = JobState.PENDING.value
    job.status_message = "Retrying estimate job"
    job.error_detail = None
    await db.commit()

    await submit_job(str(job.id))

    return EstimateJobResponse(
        id=job.id,
        project_id=job.project_id,
        scenario_id=job.scenario_id,
        provider=job.provider,
        status=job.status,
        status_message=job.status_message,
        job_metadata=job.job_metadata or {},
        artifacts=[],
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("/projects/{id}/estimates/freshness", response_model=List[EstimateFreshnessReport])
async def get_project_estimates_freshness(
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    """
    Returns pricing freshness status and drift reports for all scenarios in the project.
    """
    scen_res = await db.execute(select(Scenario).where(Scenario.project_id == project.id))
    scenarios = scen_res.scalars().all()
    return [compute_freshness_report(s) for s in scenarios]


@router.post("/projects/{id}/estimates/{scenario_id}/sync", response_model=EstimateSyncResponse)
async def sync_estimate_pricing(
    scenario_id: uuid.UUID,
    project: Project = Depends(get_project_or_404),
    db: AsyncSession = Depends(get_db)
):
    """
    1-Click sync: re-evaluates scenario pricing against live AWS/Azure catalog rates,
    stamping a fresh pricing_as_of timestamp and computing exact line-item rate diffs.
    """
    try:
        return await sync_scenario_estimate(db, scenario_id, project)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync pricing: {e}")
