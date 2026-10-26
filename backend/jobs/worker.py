"""
Resilient transactional background job processor and WebSocket subscription registry.
Includes automatic crash recovery, DB polling fallback, and connection health watchdog.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Set
from fastapi import WebSocket
from sqlalchemy import select, update
from core.database import AsyncSessionLocal
from models.db import EstimateJob
from jobs.job_states import JobState

logger = logging.getLogger(__name__)

job_queue: asyncio.Queue = asyncio.Queue()
job_subscribers: Dict[str, Set[WebSocket]] = {}


async def notify_job_update(job_id: str, payload: dict):
    subscribers = job_subscribers.get(str(job_id), set())
    dead = set()
    for ws in list(subscribers):
        try:
            await ws.send_json(payload)
        except Exception:
            dead.add(ws)
    for ws in dead:
        subscribers.discard(ws)


async def submit_job(job_id: str):
    await job_queue.put(str(job_id))
    logger.info(f"Queued estimate job {job_id}")


async def recover_orphaned_jobs():
    """
    Recovers jobs left in intermediate states from prior server restarts.
    Marks stale running jobs as failed with actionable diagnostic messages.
    """
    try:
        async with AsyncSessionLocal() as session:
            # Re-enqueue any jobs still marked pending
            res = await session.execute(
                select(EstimateJob).where(EstimateJob.status == JobState.PENDING.value)
            )
            pending_jobs = res.scalars().all()
            for pj in pending_jobs:
                await job_queue.put(str(pj.id))
                logger.info(f"Recovered pending job {pj.id} on worker startup")

            # Clean up stale jobs that were mid-flight when previous container terminated
            cutoff = datetime.now(timezone.utc) - timedelta(minutes=15)
            active_states = [
                JobState.VALIDATING.value,
                JobState.CONNECTING.value,
                JobState.CONFIGURING.value,
                JobState.CALCULATING.value,
                JobState.EXPORTING.value,
                JobState.VERIFYING.value
            ]
            await session.execute(
                update(EstimateJob)
                .where(EstimateJob.status.in_(active_states))
                .where(EstimateJob.updated_at < cutoff)
                .values(
                    status=JobState.FAILED.value,
                    status_message="Estimate timed out or worker process was restarted. Please retry this estimate.",
                    error_detail="Job recovery timeout: container process terminated before calculation completed.",
                    updated_at=datetime.now(timezone.utc)
                )
            )
            await session.commit()
    except Exception as e:
        logger.warning(f"Error during job recovery sweep: {e}")


async def start_worker():
    from jobs.estimate_job import run_estimate_job
    logger.info("Initializing resilient background estimate worker loop...")
    await recover_orphaned_jobs()

    while True:
        try:
            try:
                # Wait for next job with 5-second timeout so we can periodically poll DB
                job_id = await asyncio.wait_for(job_queue.get(), timeout=5.0)
                logger.info(f"Worker picked up job {job_id}")
                try:
                    await run_estimate_job(job_id)
                except Exception as e:
                    logger.error(f"Error executing job {job_id}: {e}", exc_info=True)
                finally:
                    job_queue.task_done()
            except asyncio.TimeoutError:
                # Periodic DB check for pending jobs (multi-replica resilience)
                async with AsyncSessionLocal() as session:
                    res = await session.execute(
                        select(EstimateJob.id)
                        .where(EstimateJob.status == JobState.PENDING.value)
                        .limit(5)
                    )
                    db_pending = res.scalars().all()
                    for pid in db_pending:
                        await job_queue.put(str(pid))
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Unexpected worker exception: {e}")
            await asyncio.sleep(1.0)
