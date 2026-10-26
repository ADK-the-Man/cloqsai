"""
SQLAlchemy async ORM models for CloudCost Architect AI.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, String, Text, JSON, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    projects: Mapped[list["Project"]] = relationship("Project", back_populates="user", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="draft")
    # draft | requirements_extracted | clarification_in_progress | clarification_complete
    # architecture_generated | scenarios_generated | estimate_in_progress | complete
    provider_selection: Mapped[str] = mapped_column(String(20), nullable=False, default="both")
    # aws | azure | both
    monthly_cost_estimate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship("User", back_populates="projects")
    requirements: Mapped[list["Requirements"]] = relationship("Requirements", back_populates="project", cascade="all, delete-orphan")
    conversations: Mapped[list["Conversation"]] = relationship("Conversation", back_populates="project", cascade="all, delete-orphan")
    architectures: Mapped[list["Architecture"]] = relationship("Architecture", back_populates="project", cascade="all, delete-orphan")
    scenarios: Mapped[list["Scenario"]] = relationship("Scenario", back_populates="project", cascade="all, delete-orphan")
    estimate_jobs: Mapped[list["EstimateJob"]] = relationship("EstimateJob", back_populates="project", cascade="all, delete-orphan")


class Requirements(Base):
    __tablename__ = "requirements"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    structured_spec: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    project: Mapped["Project"] = relationship("Project", back_populates="requirements")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, unique=True, index=True)
    messages: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    collected_requirements: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    questions_asked: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    is_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    completeness_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    project: Mapped["Project"] = relationship("Project", back_populates="conversations")


class Architecture(Base):
    __tablename__ = "architectures"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)  # aws | azure
    services: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    diagram_data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    project: Mapped["Project"] = relationship("Project", back_populates="architectures")
    scenarios: Mapped[list["Scenario"]] = relationship("Scenario", back_populates="architecture")


class Scenario(Base):
    __tablename__ = "scenarios"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    architecture_id: Mapped[Optional[uuid.UUID]] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("architectures.id"), nullable=True)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    scenario_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # cost_optimized | recommended | high_availability
    resources: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    monthly_cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    annual_cost_usd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    assumptions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    exclusions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    cost_drivers: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    limitations: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    pricing_as_of: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    project: Mapped["Project"] = relationship("Project", back_populates="scenarios")
    architecture: Mapped[Optional["Architecture"]] = relationship("Architecture", back_populates="scenarios")
    estimate_jobs: Mapped[list["EstimateJob"]] = relationship("EstimateJob", back_populates="scenario")


class EstimateJob(Base):
    __tablename__ = "estimate_jobs"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    scenario_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("scenarios.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    status_message: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    job_metadata: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    error_detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="estimate_jobs")
    scenario: Mapped["Scenario"] = relationship("Scenario", back_populates="estimate_jobs")
    artifacts: Mapped[list["Artifact"]] = relationship("Artifact", back_populates="estimate_job", cascade="all, delete-orphan")


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    estimate_job_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("estimate_jobs.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_type: Mapped[str] = mapped_column(String(20), nullable=False)  # csv | xlsx | json | url
    provenance: Mapped[str] = mapped_column(String(100), nullable=False)
    # native_calculator | app_generated_csv | app_generated_xlsx | calculator_url
    provenance_label: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    checksum: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    download_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_valid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    validation_message: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    estimate_job: Mapped["EstimateJob"] = relationship("EstimateJob", back_populates="artifacts")
