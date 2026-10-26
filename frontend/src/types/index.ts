// Re-export all types from api.ts for convenience
export type {
  Project,
  LoginPayload,
  LoginResponse,
  ProviderStatus,
  ConversationMessage,
  ClarificationQuestion,
  RequirementField,
  Conversation,
  ArchitectureService,
  DiagramNode,
  DiagramEdge,
  Architecture,
  ScenarioResource,
  Scenario,
  EstimateJobStep,
  EstimateJob,
  Artifact,
  JobStatus,
  ExtractRequirementsPayload,
  ExtractRequirementsResponse,
} from '@/lib/api'

// ─── Additional frontend-only types ──────────────────────────────────────────

export type ScenarioType = 'cost_optimized' | 'recommended' | 'high_availability'
export type Provider = 'aws' | 'azure' | 'both'
export type ProjectStatus = 'active' | 'completed' | 'archived'

export interface User {
  id: string
  email: string
  name: string
  role: string
  created_at: string
}

export interface CatalogService {
  id: string
  provider: string
  service_name: string
  service_type: string
  sku: string
  region: string
  price_per_hour?: number
  price_per_month?: number
  price_per_gb?: number
  currency: string
  attributes: Record<string, string | number | boolean>
}

export interface ProjectStep {
  id: string
  label: string
  href: string
  completed: boolean
  active: boolean
}

export type ServiceType =
  | 'compute'
  | 'database'
  | 'storage'
  | 'networking'
  | 'security'
  | 'analytics'
  | 'messaging'
  | 'ai'
  | 'monitoring'
  | 'other'

export type Confidence = 'high' | 'medium' | 'low'

export function getConfidenceLevel(score: number): Confidence {
  if (score >= 0.8) return 'high'
  if (score >= 0.5) return 'medium'
  return 'low'
}

export type DownloadStatus = 'idle' | 'downloading' | 'error'
