# CLOQS AI — API Application Server (Reloaded with updated Auth Config)
from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import settings
from core.database import engine, AsyncSessionLocal
from models.db import Base
from api.v1 import auth, projects, requirements, conversation, architecture, scenarios, estimates, artifacts, catalog
from jobs import start_worker, get_job_subscribers
from jobs.worker import job_subscribers

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


async def create_demo_user() -> None:
    """Create the demo user at startup if it does not already exist."""
    from models.db import User
    from core.security import hash_password
    from sqlalchemy import select
    import uuid

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == settings.DEMO_EMAIL))
        existing = result.scalar_one_or_none()
        if existing is None:
            demo = User(
                id=uuid.uuid4(),
                email=settings.DEMO_EMAIL,
                hashed_password=hash_password(settings.DEMO_PASSWORD),
                name="Demo User",
                is_active=True,
            )
            session.add(demo)
            await session.commit()
            logger.info("Demo user created: %s", settings.DEMO_EMAIL)
        else:
            existing.hashed_password = hash_password(settings.DEMO_PASSWORD)
            await session.commit()
            logger.info("Demo user password updated: %s", settings.DEMO_EMAIL)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Create tables (idempotent – Alembic handles migrations in prod)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await create_demo_user()
    worker_task = asyncio.create_task(start_worker())

    if not settings.ANTHROPIC_API_KEY:
        logger.warning(
            "ANTHROPIC_API_KEY is not set. AI features will be unavailable."
        )

    yield

    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass
    await engine.dispose()


app = FastAPI(
    title="CLOQS AI API",
    version="0.1.0",
    description="CLOQS AI: AI-Powered Cloud Architecture & Cost Intelligence. Architect Smarter. Optimize Everything.",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers (mounted on /api/v1 and root)
# ---------------------------------------------------------------------------
for prefix in ["/api/v1", "/v1", "/api", ""]:
    app.include_router(auth.router, prefix=prefix, tags=["auth"])
    app.include_router(projects.router, prefix=prefix, tags=["projects"])
    app.include_router(requirements.router, prefix=prefix, tags=["requirements"])
    app.include_router(conversation.router, prefix=prefix, tags=["conversation"])
    app.include_router(architecture.router, prefix=prefix, tags=["architecture"])
    app.include_router(scenarios.router, prefix=prefix, tags=["scenarios"])
    app.include_router(estimates.router, prefix=prefix, tags=["estimates"])
    app.include_router(artifacts.router, prefix=prefix, tags=["artifacts"])
    app.include_router(catalog.router, prefix=prefix, tags=["catalog"])


# ---------------------------------------------------------------------------
# Health endpoints
# ---------------------------------------------------------------------------
@app.get("/health", tags=["health"])
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0"}


@app.get("/health/ready", tags=["health"])
async def health_ready() -> dict:
    from sqlalchemy import text
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        db_ok = True
    except Exception as exc:
        logger.error("DB health check failed: %s", exc)
        db_ok = False

    if not db_ok:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "not_ready", "db": "unreachable"},
        )
    return {"status": "ready", "db": "ok"}


# ---------------------------------------------------------------------------
# WebSocket: job status streaming
# ---------------------------------------------------------------------------
@app.websocket("/ws/jobs/{job_id}")
async def websocket_job(websocket: WebSocket, job_id: str) -> None:
    await websocket.accept()
    subscribers = get_job_subscribers()
    if job_id not in subscribers:
        subscribers[job_id] = set()
    subscribers[job_id].add(websocket)
    logger.info("WS client connected for job %s", job_id)
    try:
        while True:
            # Keep connection alive; client can send pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        logger.info("WS client disconnected for job %s", job_id)
    finally:
        if job_id in subscribers:
            subscribers[job_id].discard(websocket)
            if not subscribers[job_id]:
                del subscribers[job_id]
