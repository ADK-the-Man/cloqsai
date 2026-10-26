"""
Pydantic v2 schemas for all request/response models.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


try:
    from pydantic import EmailStr
except ImportError:
    EmailStr = str  # fallback if email-validator package is not installed


# ── Auth ──────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=100)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class AuthConfigResponse(BaseModel):
    login_enabled: bool
    providers: list[str] = []
    google_client_id_configured: bool = False
    microsoft_client_id_configured: bool = False


class BrowserSessionLoginRequest(BaseModel):
    provider: str  # "google" | "microsoft"
    email: str
    name: Optional[str] = None


# ── Projects ─────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    provider_selection: str = Field(default="both", pattern="^(aws|azure|both)$")
    raw_requirements_text: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    provider_selection: Optional[str] = Field(None, pattern="^(aws|azure|both)$")
    status: Optional[str] = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    status: str
    provider_selection: str
    monthly_cost_estimate: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProjectListResponse(BaseModel):
    projects: List[ProjectResponse]
    total: int


# ── Requirements ──────────────────────────────────────────────────────────────

class RequirementsField(BaseModel):
    value: Any = None
    unit: Optional[str] = None
    source: str = "unknown"  # explicit | inferred | assumed | unknown
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)


class RequirementsSpec(BaseModel):
    application_type: RequirementsField = Field(default_factory=RequirementsField)
    workload_type: RequirementsField = Field(default_factory=RequirementsField)
    avg_rps: RequirementsField = Field(default_factory=RequirementsField)
    peak_rps: RequirementsField = Field(default_factory=RequirementsField)
    concurrent_users: RequirementsField = Field(default_factory=RequirementsField)
    cpu_cores: RequirementsField = Field(default_factory=RequirementsField)
    memory_gb: RequirementsField = Field(default_factory=RequirementsField)
    latency_p99_ms: RequirementsField = Field(default_factory=RequirementsField)
    db_engine: RequirementsField = Field(default_factory=RequirementsField)
    db_storage_gb: RequirementsField = Field(default_factory=RequirementsField)
    storage_total_gb: RequirementsField = Field(default_factory=RequirementsField)
    network_egress_gb_month: RequirementsField = Field(default_factory=RequirementsField)
    availability_target_percent: RequirementsField = Field(default_factory=RequirementsField)
    rto_minutes: RequirementsField = Field(default_factory=RequirementsField)
    rpo_minutes: RequirementsField = Field(default_factory=RequirementsField)
    security_requirements: RequirementsField = Field(default_factory=RequirementsField)
    operating_hours_per_day: RequirementsField = Field(default_factory=RequirementsField)
    regions: RequirementsField = Field(default_factory=RequirementsField)
    environments: RequirementsField = Field(default_factory=RequirementsField)
    budget_usd_month: RequirementsField = Field(default_factory=RequirementsField)
    unknown_fields: List[str] = Field(default_factory=list)
    raw_notes: str = ""


class RequirementsExtractRequest(BaseModel):
    raw_text: str = Field(min_length=10)


class RequirementsResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    version: int
    structured_spec: RequirementsSpec
    raw_text: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Conversation ──────────────────────────────────────────────────────────────

class ConversationMessage(BaseModel):
    role: str  # agent | user
    content: str
    timestamp: datetime
    question_id: Optional[str] = None


class ClarificationOption(BaseModel):
    value: str
    label: str


class ClarificationQuestion(BaseModel):
    id: str
    text: str
    explanation: Optional[str] = None
    question_type: str = "multiple_choice"  # multiple_choice | free_text | scale
    options: List[ClarificationOption] = Field(default_factory=list)
    field_key: str = ""  # which requirements field this answers


class AnswerRequest(BaseModel):
    question_id: str
    answer: str
    is_skipped: bool = False


class ConversationResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    messages: List[ConversationMessage]
    collected_requirements: Dict[str, Any]
    questions_asked: List[str]
    is_complete: bool
    completeness_score: float
    next_questions: List[ClarificationQuestion] = Field(default_factory=list)
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConversationStatusResponse(BaseModel):
    is_complete: bool
    completeness_score: float
    questions_remaining_estimate: int


# ── Architecture ──────────────────────────────────────────────────────────────

class ArchitectureService(BaseModel):
    id: str
    name: str
    provider: str
    service_family: str
    service_name: str
    region: str
    purpose: str
    rationale: str
    dependencies: List[str] = Field(default_factory=list)
    diagram_position: Dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0})
    node_type: str = "service"  # service | boundary | zone


class DiagramNode(BaseModel):
    id: str
    type: str = "serviceNode"
    position: Dict[str, float]
    data: Dict[str, Any]


class DiagramEdge(BaseModel):
    id: str
    source: str
    target: str
    type: str = "smoothstep"
    animated: bool = False
    label: Optional[str] = None


class DiagramData(BaseModel):
    nodes: List[DiagramNode]
    edges: List[DiagramEdge]


class ArchitectureResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    version: int
    provider: str
    services: List[ArchitectureService]
    diagram_data: DiagramData
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Scenarios ─────────────────────────────────────────────────────────────────

class ScenarioResource(BaseModel):
    id: str
    resource_name: str
    provider: str
    service_family: str
    service_name: str
    region: str
    sku: str
    quantity: int = 1
    config: Dict[str, Any] = Field(default_factory=dict)
    availability_config: str = ""
    pricing_model: str = "on-demand"
    monthly_cost_usd: float = 0.0
    annual_cost_usd: float = 0.0
    rationale: str = ""
    assumptions: List[str] = Field(default_factory=list)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)
    validation_status: str = "pending"  # pending | validated | assumed | unverified
    pricing_source: str = ""
    is_optional: bool = False


class ScenarioResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    provider: str
    scenario_type: str
    resources: List[ScenarioResource]
    monthly_cost_usd: float
    annual_cost_usd: float
    assumptions: List[str]
    exclusions: List[str]
    cost_drivers: List[str]
    limitations: List[str]
    pricing_as_of: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScenarioComparison(BaseModel):
    provider: str
    cost_optimized: Optional[ScenarioResponse] = None
    recommended: Optional[ScenarioResponse] = None
    high_availability: Optional[ScenarioResponse] = None


class ResourceUpdateRequest(BaseModel):
    resource_name: Optional[str] = None
    region: Optional[str] = None
    sku: Optional[str] = None
    quantity: Optional[int] = None
    monthly_cost_usd: Optional[float] = None
    config: Optional[Dict[str, Any]] = None
    pricing_model: Optional[str] = None


class AddResourceRequest(BaseModel):
    resource_name: str
    service_family: str
    service_name: str
    region: str = "us-east-1"
    sku: str
    quantity: int = 1
    availability_config: str = "Multi-AZ"
    pricing_model: str = "on-demand"
    config: Dict[str, Any] = Field(default_factory=dict)
    rationale: str = "User added service delta"


class NaturalLanguageDeltaRequest(BaseModel):
    text: str
    provider: str = "aws"
    context_answers: Optional[Dict[str, str]] = None


class DeltaClarificationQuestion(BaseModel):
    id: str
    question: str
    options: List[str]
    field_key: str = ""


class NaturalLanguageDeltaResponse(BaseModel):
    needs_clarification: bool = False
    clarification_questions: List[DeltaClarificationQuestion] = Field(default_factory=list)
    suggested_resource: Optional[AddResourceRequest] = None
    estimated_monthly_delta: Optional[float] = None
    explanation: str = ""


# ── Estimates ─────────────────────────────────────────────────────────────────

class EstimateCreateRequest(BaseModel):
    scenario_ids: List[uuid.UUID] = Field(min_length=1)


class EstimateJobResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    scenario_id: uuid.UUID
    provider: str
    status: str
    status_message: Optional[str] = None
    job_metadata: Dict[str, Any]
    error_detail: Optional[str] = None
    artifacts: List["ArtifactResponse"] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class EstimateListResponse(BaseModel):
    estimate_jobs: List[EstimateJobResponse]
    total: int


# ── Artifacts ─────────────────────────────────────────────────────────────────

class ArtifactResponse(BaseModel):
    id: uuid.UUID
    estimate_job_id: uuid.UUID
    file_name: str
    file_type: str
    provenance: str
    provenance_label: str
    file_size: Optional[int] = None
    checksum: Optional[str] = None
    download_count: int
    is_valid: bool
    validation_message: Optional[str] = None
    download_url: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Catalog ───────────────────────────────────────────────────────────────────

class ServiceCatalogItem(BaseModel):
    service_code: str
    service_name: str
    provider: str
    service_family: str
    description: str
    discovery_supported: bool
    sizing_supported: bool
    pricing_data_supported: bool
    calculator_config_supported: bool
    export_supported: bool
    known_limitations: List[str] = Field(default_factory=list)
    last_verified: Optional[str] = None


class ProviderStatusResponse(BaseModel):
    aws_mcp_available: bool
    aws_mcp_url: str
    aws_mcp_message: str
    azure_retail_prices_available: bool
    azure_retail_prices_message: str


# ── Error ─────────────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    detail: str
    code: Optional[str] = None


# ── Health ────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    ai_configured: bool


# Update forward references
EstimateJobResponse.model_rebuild()
