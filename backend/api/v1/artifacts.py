"""
Artifact retrieval and authenticated download endpoints.
"""
import uuid
from pathlib import Path
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.storage import get_artifact_absolute_path
from models.db import Artifact
from models.schemas import ArtifactResponse

router = APIRouter()


@router.get("/estimates/{estimate_id}/artifacts", response_model=List[ArtifactResponse])
@router.get("/projects/{project_id}/estimates/{estimate_id}/artifacts", response_model=List[ArtifactResponse])
async def list_estimate_artifacts(
    estimate_id: uuid.UUID,
    project_id: Optional[uuid.UUID] = None,
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Artifact).where(Artifact.estimate_job_id == estimate_id))
    artifacts = res.scalars().all()
    return [
        ArtifactResponse(
            id=a.id,
            estimate_job_id=a.estimate_job_id,
            project_id=a.project_id,
            file_name=a.file_name,
            file_type=a.file_type,
            provenance=a.provenance,
            provenance_label=a.provenance_label,
            file_size=a.file_size,
            checksum=a.checksum,
            download_count=a.download_count,
            download_url=f"/api/v1/artifacts/{a.id}/download",
            is_valid=a.is_valid,
            validation_message=a.validation_message,
            created_at=a.created_at,
        )
        for a in artifacts
    ]


@router.get("/artifacts/{artifact_id}/download")
async def download_artifact(
    artifact_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(Artifact).where(Artifact.id == artifact_id))
    artifact = res.scalar_one_or_none()
    if not artifact:
        raise HTTPException(status_code=404, detail="Artifact not found")

    abs_path = get_artifact_absolute_path(artifact.file_path)
    if not abs_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found on storage: {abs_path}")

    # Increment download counter
    artifact.download_count += 1
    await db.commit()

    media_type = "text/csv" if artifact.file_type == "csv" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    
    return FileResponse(
        path=str(abs_path),
        filename=artifact.file_name,
        media_type=media_type,
    )
