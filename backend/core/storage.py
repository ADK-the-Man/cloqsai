"""
Artifact storage: save, retrieve, verify, and manage generated files.
"""
from __future__ import annotations

import hashlib
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

try:
    import aiofiles
except ImportError:
    aiofiles = None

from core.config import settings

logger = logging.getLogger(__name__)


def _artifact_dir(user_id: str, job_id: str) -> Path:
    """Return the directory for a specific artifact."""
    base = Path(settings.ARTIFACTS_DIR)
    return base / str(user_id) / str(job_id)


async def save_artifact(
    content: bytes,
    filename: str,
    user_id: str,
    job_id: str,
) -> tuple[str, int, str]:
    """
    Save artifact bytes to disk.
    Returns (relative_path, file_size, sha256_checksum).
    """
    artifact_dir = _artifact_dir(user_id, job_id)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    file_path = artifact_dir / filename
    if aiofiles:
        async with aiofiles.open(file_path, "wb") as f:
            await f.write(content)
    else:
        with open(file_path, "wb") as f:
            f.write(content)

    file_size = file_path.stat().st_size
    if file_size == 0:
        raise ValueError(f"Artifact {filename} was written but has zero size")

    checksum = hashlib.sha256(content).hexdigest()
    relative_path = str(file_path.relative_to(Path(settings.ARTIFACTS_DIR)))

    logger.info(f"Artifact saved: {relative_path} ({file_size} bytes, sha256={checksum[:8]}...)")
    return relative_path, file_size, checksum


async def save_artifact_from_path(
    source_path: str,
    filename: str,
    user_id: str,
    job_id: str,
) -> tuple[str, int, str]:
    """Copy an existing file to artifact storage."""
    if aiofiles:
        async with aiofiles.open(source_path, "rb") as f:
            content = await f.read()
    else:
        with open(source_path, "rb") as f:
            content = f.read()
    return await save_artifact(content, filename, user_id, job_id)


def get_artifact_absolute_path(relative_path: str) -> Path:
    """Resolve a relative artifact path to an absolute path."""
    return Path(settings.ARTIFACTS_DIR) / relative_path


def verify_artifact(relative_path: str, expected_checksum: Optional[str] = None) -> tuple[bool, str]:
    """
    Verify an artifact exists, has nonzero size, and optionally matches checksum.
    Returns (is_valid, message).
    """
    abs_path = get_artifact_absolute_path(relative_path)
    if not abs_path.exists():
        return False, f"File not found: {abs_path}"
    size = abs_path.stat().st_size
    if size == 0:
        return False, f"File exists but has zero size: {abs_path}"
    if expected_checksum:
        with open(abs_path, "rb") as f:
            actual = hashlib.sha256(f.read()).hexdigest()
        if actual != expected_checksum:
            return False, f"Checksum mismatch: expected {expected_checksum[:8]}... got {actual[:8]}..."
    return True, f"Valid ({size} bytes)"


async def cleanup_old_artifacts(max_age_days: int = settings.ARTIFACT_MAX_AGE_DAYS):
    """Remove artifact directories older than max_age_days."""
    base = Path(settings.ARTIFACTS_DIR)
    if not base.exists():
        return

    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    removed = 0
    for user_dir in base.iterdir():
        if not user_dir.is_dir():
            continue
        for job_dir in user_dir.iterdir():
            if not job_dir.is_dir():
                continue
            mtime = datetime.fromtimestamp(job_dir.stat().st_mtime, tz=timezone.utc)
            if mtime < cutoff:
                import shutil
                shutil.rmtree(job_dir)
                removed += 1
    logger.info(f"Artifact cleanup: removed {removed} old job directories")
