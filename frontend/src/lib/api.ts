import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { getToken, removeToken } from './auth'

const getBaseUrl = () => {
  if (typeof window !== 'undefined') {
    const envUrl = process.env.NEXT_PUBLIC_API_URL
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl
    }
    return '/api/v1'
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'
}

const API_URL = getBaseUrl()

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

// Request interceptor: attach token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error)
)

// Response interceptor: handle 401
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      removeToken()
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// ─── Auth ──────────────────────────────────────────────────────────────────
export interface LoginPayload {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: {
    id: string
    email: string
    name: string
  }
}

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const form = new URLSearchParams()
  form.append('username', payload.email)
  form.append('password', payload.password)
  const { data } = await apiClient.post<LoginResponse>('/auth/token', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data
}

// ─── Provider Status ────────────────────────────────────────────────────────
export interface ProviderStatus {
  provider: string
  status: 'healthy' | 'degraded' | 'unavailable'
  message: string
  last_checked: string
}

export async function getProviderStatus(): Promise<ProviderStatus[]> {
  const { data } = await apiClient.get<ProviderStatus[]>('/health/providers')
  return data
}

// ─── Projects ───────────────────────────────────────────────────────────────
export interface Project {
  id: string
  name: string
  description: string
  provider: 'aws' | 'azure' | 'both'
  status: 'active' | 'completed' | 'archived'
  monthly_cost?: number
  created_at: string
  updated_at: string
  requirements_complete: boolean
  architecture_generated: boolean
  scenarios_generated: boolean
  estimates_generated: boolean
}

export async function getProjects(): Promise<Project[]> {
  const { data } = await apiClient.get<Project[]>('/projects')
  return data
}

export async function createProject(payload: {
  name: string
  description: string
  provider: string
}): Promise<Project> {
  const { data } = await apiClient.post<Project>('/projects', payload)
  return data
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await apiClient.get<Project>(`/projects/${id}`)
  return data
}

export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/projects/${id}`)
}

// ─── Requirements ───────────────────────────────────────────────────────────
export interface ExtractRequirementsPayload {
  raw_text: string
  provider: string
  region?: string
  concurrent_users?: number
  budget?: number
  availability_target?: string
}

export interface ExtractRequirementsResponse {
  project_id: string
  requirements: Record<string, unknown>
  conversation_id: string
}

export async function extractRequirements(
  payload: ExtractRequirementsPayload
): Promise<ExtractRequirementsResponse> {
  const { data } = await apiClient.post<ExtractRequirementsResponse>(
    '/requirements/extract',
    payload
  )
  return data
}

// ─── Conversations ──────────────────────────────────────────────────────────
export interface ConversationMessage {
  id: string
  role: 'agent' | 'user'
  content: string
  created_at: string
}

export interface ClarificationQuestion {
  id: string
  question: string
  explanation: string
  field: string
  options?: string[]
  is_multiple_choice: boolean
  allow_free_text: boolean
}

export interface Conversation {
  id: string
  project_id: string
  messages: ConversationMessage[]
  current_questions: ClarificationQuestion[]
  is_complete: boolean
  completeness_score: number
  requirements_summary: Record<string, RequirementField>
  created_at: string
  updated_at: string
}

export interface RequirementField {
  value: string | number | boolean | null
  confidence: number
  source: string
}

export async function getConversation(projectId: string): Promise<Conversation> {
  const { data } = await apiClient.get<Conversation>(
    `/projects/${projectId}/conversation`
  )
  return data
}

export async function submitAnswer(
  projectId: string,
  payload: {
    question_id: string
    answer: string
    skipped?: boolean
  }
): Promise<Conversation> {
  const { data } = await apiClient.post<Conversation>(
    `/projects/${projectId}/conversation/answer`,
    payload
  )
  return data
}

// ─── Architecture ────────────────────────────────────────────────────────────
export interface ArchitectureService {
  id: string
  name: string
  provider: string
  service_name: string
  service_type: string
  region: string
  purpose: string
  rationale: string
  sku?: string
  connections: string[]
}

export interface DiagramNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    service_type: string
    provider: string
    sku?: string
  }
}

export interface DiagramEdge {
  id: string
  source: string
  target: string
  type?: string
  animated?: boolean
  label?: string
}

export interface Architecture {
  id: string
  project_id: string
  services: ArchitectureService[]
  diagram_nodes: DiagramNode[]
  diagram_edges: DiagramEdge[]
  summary: string
  created_at: string
}

export async function generateArchitecture(projectId: string): Promise<{ job_id: string }> {
  const { data } = await apiClient.post<{ job_id: string }>(
    `/projects/${projectId}/architecture/generate`
  )
  return data
}

export async function getArchitecture(projectId: string): Promise<Architecture> {
  const { data } = await apiClient.get<Architecture>(
    `/projects/${projectId}/architecture`
  )
  return data
}

// ─── Scenarios ───────────────────────────────────────────────────────────────
export interface ScenarioResource {
  service_name: string
  sku: string
  quantity: number
  monthly_cost: number
  description: string
}

export interface Scenario {
  id: string
  project_id: string
  scenario_type: 'cost_optimized' | 'recommended' | 'high_availability'
  provider: 'aws' | 'azure'
  monthly_cost: number
  annual_cost: number
  az_config: string
  sku_tier: string
  scaling_approach: string
  resources: ScenarioResource[]
  assumptions: string[]
  limitations: string[]
  created_at: string
}

export async function generateScenarios(projectId: string): Promise<{ job_id: string }> {
  const { data } = await apiClient.post<{ job_id: string }>(
    `/projects/${projectId}/scenarios/generate`
  )
  return data
}

export async function getScenarios(projectId: string): Promise<Scenario[]> {
  const { data } = await apiClient.get<Scenario[]>(
    `/projects/${projectId}/scenarios`
  )
  return data
}

// ─── Estimates ────────────────────────────────────────────────────────────────
export type JobStatus =
  | 'pending'
  | 'saving_plan'
  | 'validating'
  | 'connecting'
  | 'configuring'
  | 'calculating'
  | 'exporting'
  | 'verifying'
  | 'completed'
  | 'failed'

export interface EstimateJobStep {
  name: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  message?: string
  started_at?: string
  completed_at?: string
}

export interface EstimateJob {
  id: string
  project_id: string
  scenario_id: string
  provider: 'aws' | 'azure'
  status: JobStatus
  steps: EstimateJobStep[]
  error_message?: string
  calculator_url?: string
  created_at: string
  updated_at: string
}

export interface Artifact {
  id: string
  job_id: string
  project_id: string
  provider: 'aws' | 'azure'
  file_name: string
  file_type: string
  file_size: number
  provenance: 'native_calculator' | 'application_generated'
  download_url: string
  created_at: string
}

export async function createEstimate(payload: {
  project_id: string
  scenario_ids: string[]
}): Promise<EstimateJob[]> {
  const { data } = await apiClient.post<EstimateJob[]>('/estimates', payload)
  return data
}

export async function getEstimate(jobId: string): Promise<EstimateJob> {
  const { data } = await apiClient.get<EstimateJob>(`/estimates/${jobId}`)
  return data
}

export async function getProjectEstimates(projectId: string): Promise<EstimateJob[]> {
  const { data } = await apiClient.get<EstimateJob[]>(
    `/projects/${projectId}/estimates`
  )
  return data
}

export async function retryEstimate(jobId: string): Promise<EstimateJob> {
  const { data } = await apiClient.post<EstimateJob>(`/estimates/${jobId}/retry`)
  return data
}

export async function getArtifacts(jobId: string): Promise<Artifact[]> {
  const { data } = await apiClient.get<Artifact[]>(`/estimates/${jobId}/artifacts`)
  return data
}

export function downloadArtifactUrl(artifactId: string): string {
  return `${API_URL}/artifacts/${artifactId}/download`
}

export async function downloadArtifact(artifactId: string, fileName: string): Promise<void> {
  const token = getToken()
  const response = await fetch(`${API_URL}/artifacts/${artifactId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error('Download failed')
  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

// ─── Job Status ────────────────────────────────────────────────────────────
export async function getJobStatus(jobId: string): Promise<EstimateJob> {
  const { data } = await apiClient.get<EstimateJob>(`/jobs/${jobId}`)
  return data
}
