"""
FastAPI dependency functions.
"""
import uuid
from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import get_db
from core.security import get_current_user
from models.db import User, Project


async def get_project_or_404(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
) -> Project:
    res = await db.execute(
        select(Project).where(Project.id == id, Project.user_id == current_user.id)
    )
    project = res.scalar_one_or_none()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {id} not found or access denied."
        )
    return project
