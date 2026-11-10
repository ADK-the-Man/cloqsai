'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Sparkles,
  Cloud,
  Server,
  Layers,
  Github,
  GitBranch,
  CheckCircle2,
  Lock,
  Unlock,
  SlidersHorizontal,
  FileCode,
  Database,
  Cpu,
  Zap,
  HardDrive,
  RefreshCw,
  ExternalLink,
  Check,
  AlertCircle
} from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { getToken, isAuthenticated } from '@/lib/auth'

const EXAMPLE_PROMPT =
  'I need a production application with a React frontend, Python FastAPI backend, PostgreSQL database, 150 concurrent users, file uploads, monitoring, daily backups, and high availability. Deploy it in US East (us-east-1). I expect the application to grow over the next year. Recommend the appropriate AWS and Azure infrastructure and provide monthly and annual cost estimates.'

const POPULAR_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia) — us-east-1 / East US' },
  { value: 'us-east-2', label: 'US East (Ohio) — us-east-2 / East US 2' },
  { value: 'us-west-2', label: 'US West (Oregon) — us-west-2 / West US 2' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai) — ap-south-1 / Central India' },
  { value: 'eu-west-1', label: 'Europe (Ireland) — eu-west-1 / North Europe' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt) — eu-central-1 / Germany West Central' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore) — ap-southeast-1 / Southeast Asia' },
  { value: 'custom', label: 'Custom / Type My Own Region...' },
]

interface GitHubComponentFinding {
  category: string
  name: string
  confidence: number
  detail: string
  detected_in?: string
}

interface GitHubAnalysisResult {
  repo_name: string
  owner: string
  default_branch: string
  description?: string
  primary_language: string
  frameworks: string[]
  detected_components: GitHubComponentFinding[]
  recommended_services_aws: string[]
  recommended_services_azure: string[]
  suggested_project_name: string
  suggested_prompt: string
  summary_markdown: string
  estimated_monthly_range: { min: number; max: number }
  scanned_files_count: number
}

export default function NewProjectPage() {
  const router = useRouter()

  // Creation Mode: 'github' | 'prompt'
  const [creationMode, setCreationMode] = useState<'github' | 'prompt'>('github')

  // Shared state
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<'both' | 'aws' | 'azure'>('both')
  const [loading, setLoading] = useState(false)

  // GitHub Analysis State
  const [githubUrl, setGithubUrl] = useState('')
  const [githubBranch, setGithubBranch] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [showTokenInput, setShowTokenInput] = useState(false)
  const [trafficScale, setTrafficScale] = useState<'small' | 'medium' | 'high' | 'enterprise'>('medium')
  const [analyzingGithub, setAnalyzingGithub] = useState(false)
  const [githubResult, setGithubResult] = useState<GitHubAnalysisResult | null>(null)

  // Explicit Sizing Parameters
  const [selectedRegion, setSelectedRegion] = useState('us-east-1')
  const [customRegion, setCustomRegion] = useState('')
  const [users, setUsers] = useState('')
  const [budget, setBudget] = useState('')
  const [availability, setAvailability] = useState('')
  const [dbEngine, setDbEngine] = useState('auto')
  const [storageGb, setStorageGb] = useState('')
  const [backupRetention, setBackupRetention] = useState('')

  const effectiveRegion = selectedRegion === 'custom' ? (customRegion.trim() || 'us-east-1') : selectedRegion

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login')
    }
  }, [router])

  // Handle GitHub Analysis
  const handleAnalyzeGithub = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!githubUrl.trim() || analyzingGithub) return

    setAnalyzingGithub(true)
    const token = getToken()
    if (!token) {
      toast.error('Session expired. Please sign in again.')
      router.push('/login')
      setAnalyzingGithub(false)
      return
    }

    try {
      const res = await fetch('/api/v1/projects/analyze-github', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          repo_url: githubUrl.trim(),
          branch: githubBranch.trim() || undefined,
          github_token: githubToken.trim() || undefined,
          traffic_scale: trafficScale,
          provider_preference: provider,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = err.detail || 'Failed to inspect GitHub repository.'
        toast.error(msg)
        return
      }

      const data: GitHubAnalysisResult = await res.json()
      setGithubResult(data)
      setName(data.suggested_project_name)
      setPrompt(data.suggested_prompt)
      toast.success(`Successfully analyzed ${data.owner}/${data.repo_name} (${data.scanned_files_count} files)!`)
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error connecting to repository analyzer.')
    } finally {
      setAnalyzingGithub(false)
    }
  }

  // Create Project & Run Pipeline
  const handleCreateProject = async (overridePrompt?: string, overrideName?: string) => {
    const finalPrompt = (overridePrompt || prompt).trim()
    if (!finalPrompt) {
      toast.error('Workload specification prompt is required.')
      return
    }

    setLoading(true)
    const token = getToken()
    if (!token) {
      toast.error('Session expired. Please sign in again.')
      router.push('/login')
      setLoading(false)
      return
    }

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }

    try {
      const effectiveName = (overrideName || name).trim() || finalPrompt.slice(0, 36) || 'Cloud Infrastructure Project'

      // 1. Create Project
      const projRes = await fetch('/api/v1/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: effectiveName,
          description: finalPrompt,
          provider_selection: provider,
        }),
      })

      if (!projRes.ok) {
        const errData = await projRes.json().catch(() => ({}))
        throw new Error(errData.detail || 'Failed to create project.')
      }
      const project = await projRes.json()

      // 2. Extract Sizing Parameters
      const structuredParams: string[] = []
      if (effectiveRegion && effectiveRegion !== 'us-east-1') {
        structuredParams.push(`Region: ${effectiveRegion}`)
      }
      if (users.trim()) {
        structuredParams.push(`Users: ${users.trim()}`)
      }
      if (budget.trim()) {
        structuredParams.push(`Budget: $${budget.trim()}/mo`)
      }
      if (availability.trim()) {
        structuredParams.push(`Availability: ${availability.trim()}`)
      }
      if (dbEngine !== 'auto' && dbEngine.trim()) {
        structuredParams.push(`Database Engine: ${dbEngine.trim()}`)
      }
      if (storageGb.trim()) {
        structuredParams.push(`Storage: ${storageGb.trim()} GB`)
      }
      if (backupRetention.trim()) {
        structuredParams.push(`Backup Retention: ${backupRetention.trim()}`)
      }

      const fullRawText = structuredParams.length > 0
        ? `${finalPrompt}\n\nExplicit Parameters:\n${structuredParams.join('\n')}`
        : finalPrompt

      // 3. Extract requirements
      await fetch(`/api/v1/projects/${project.id}/requirements/extract`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ raw_text: fullRawText }),
      })

      // 4. Generate Architecture Graph
      await fetch(`/api/v1/projects/${project.id}/architecture/generate`, {
        method: 'POST',
        headers,
      })

      toast.success('Architecture graph & sizing pipeline initialized!')
      // Navigate directly to the interactive architecture visualizer
      router.push(`/projects/${project.id}/architecture`)
    } catch (err: any) {
      console.error(err)
      toast.error(err.message || 'Error generating architecture.')
    } finally {
      setLoading(false)
    }
  }

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'database':
        return <Database className="h-3.5 w-3.5 text-emerald-600" />
      case 'cache':
        return <Zap className="h-3.5 w-3.5 text-amber-500" />
      case 'storage':
        return <HardDrive className="h-3.5 w-3.5 text-blue-600" />
      case 'compute':
        return <Cpu className="h-3.5 w-3.5 text-indigo-600" />
      case 'framework':
        return <FileCode className="h-3.5 w-3.5 text-purple-600" />
      default:
        return <Layers className="h-3.5 w-3.5 text-slate-600" />
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        <div className="mb-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Create Architecture & Cost Estimate
              </h1>
              <p className="text-sm text-slate-500">
                Scan your GitHub repository codebase or specify your application requirements in natural language.
              </p>
            </div>

            {/* Mode Switcher Pill */}
            <div className="flex items-center p-1 rounded-xl bg-slate-200/80 border border-slate-300/80 self-start sm:self-auto shrink-0 shadow-2xs">
              <button
                type="button"
                onClick={() => setCreationMode('github')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  creationMode === 'github'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Github className="h-3.5 w-3.5 text-slate-800" />
                <span>Import GitHub Repo</span>
                <span className="px-1.5 py-0.2 rounded-full bg-blue-600 text-[9px] font-bold text-white uppercase tracking-wider">
                  AI Scan
                </span>
              </button>

              <button
                type="button"
                onClick={() => setCreationMode('prompt')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  creationMode === 'prompt'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                <span>Describe in Text</span>
              </button>
            </div>
          </div>
        </div>

        {/* Global Cloud Selection */}
        <Card className="border-slate-200 shadow-xs bg-white">
          <CardHeader className="py-3 px-4 sm:px-6 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-slate-900">Target Cloud Providers</CardTitle>
                <CardDescription className="text-xs">
                  Generate dual-cloud comparative architecture or target a specific cloud ecosystem.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { key: 'both', label: 'Both Clouds', desc: 'AWS & Azure Side-by-Side', icon: Layers },
                { key: 'aws', label: 'Amazon Web Services', desc: 'AWS Pricing Calculator', icon: Cloud },
                { key: 'azure', label: 'Microsoft Azure', desc: 'Azure Retail Prices API', icon: Server },
              ].map((item) => {
                const Icon = item.icon
                const isSelected = provider === item.key

                return (
                  <div
                    key={item.key}
                    onClick={() => setProvider(item.key as any)}
                    className={`cursor-pointer rounded-xl border-2 p-3 text-left transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/40 shadow-xs'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`h-4 w-4 ${isSelected ? 'text-blue-600' : 'text-slate-500'}`} />
                      <span className={`text-xs font-bold ${isSelected ? 'text-blue-900' : 'text-slate-800'}`}>
                        {item.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">{item.desc}</p>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* ── MODE 1: GITHUB REPO SCAN & ANALYSIS ───────────────────────────── */}
        {creationMode === 'github' && (
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-xs bg-white">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2 text-slate-900">
                  <div className="p-2 rounded-xl bg-slate-900 text-white shadow-xs">
                    <Github className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-base">GitHub Repository Inspection</CardTitle>
                    <CardDescription className="text-xs">
                      Paste your repository URL. CLOQS AI will inspect manifests, Dockerfiles, and dependencies to suggest infrastructure.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <form onSubmit={handleAnalyzeGithub} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                      <span>GitHub Repository URL</span>
                      <span className="text-[10px] text-slate-400">Public or Private</span>
                    </Label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1">
                        <Input
                          value={githubUrl}
                          onChange={(e) => setGithubUrl(e.target.value)}
                          placeholder="https://github.com/fastapi/full-stack-fastapi-template"
                          className="text-xs font-mono pl-8 bg-slate-50 focus:bg-white"
                          required
                        />
                        <Github className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                      </div>

                      <Button
                        type="submit"
                        disabled={analyzingGithub || !githubUrl.trim()}
                        className="h-9 px-4 text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold gap-1.5 cursor-pointer shrink-0 shadow-xs"
                      >
                        {analyzingGithub ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            <span>Scanning Codebase...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                            <span>Analyze Repository</span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Sample Repository Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                    <span className="text-[10px] font-semibold text-slate-400">Try popular repos:</span>
                    {[
                      { label: 'FastAPI Full-Stack Template', url: 'https://github.com/fastapi/full-stack-fastapi-template' },
                      { label: 'Vercel Next.js Commerce', url: 'https://github.com/vercel/commerce' },
                      { label: 'Cal.com Scheduling Platform', url: 'https://github.com/calcom/cal.com' },
                    ].map((sample) => (
                      <button
                        key={sample.url}
                        type="button"
                        onClick={() => {
                          setGithubUrl(sample.url)
                          setGithubResult(null)
                        }}
                        className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-medium transition-colors cursor-pointer"
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>

                  {/* Advanced Branch & Token Options */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setShowTokenInput(!showTokenInput)}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <SlidersHorizontal className="h-3 w-3" />
                      <span>{showTokenInput ? 'Hide branch & authentication options' : 'Specify branch or private repo token'}</span>
                    </button>

                    {showTokenInput && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 mt-2 rounded-lg bg-slate-50 border border-slate-200 animate-in fade-in-50 duration-150">
                        <div className="space-y-1">
                          <Label className="text-[10px] font-semibold text-slate-700 flex items-center gap-1">
                            <GitBranch className="h-3 w-3" />
                            <span>Specific Branch (optional)</span>
                          </Label>
                          <Input
                            value={githubBranch}
                            onChange={(e) => setGithubBranch(e.target.value)}
                            placeholder="main, master, or staging"
                            className="text-xs h-7.5 bg-white font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label className="text-[10px] font-semibold text-slate-700 flex items-center gap-1">
                            <Lock className="h-3 w-3" />
                            <span>Personal Access Token (for private repos)</span>
                          </Label>
                          <Input
                            type="password"
                            value={githubToken}
                            onChange={(e) => setGithubToken(e.target.value)}
                            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                            className="text-xs h-7.5 bg-white font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* ── ANALYSIS RESULT & INTERACTIVE REVIEW CARD ─────────────────── */}
            {githubResult && (
              <Card className="border-blue-200 shadow-md bg-white animate-in fade-in-50 slide-in-from-bottom-2 duration-200">
                <CardHeader className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-t-xl p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        <h3 className="text-base font-bold text-white tracking-tight">
                          {githubResult.owner} / {githubResult.repo_name}
                        </h3>
                        <Badge className="bg-white/20 text-white text-[10px] font-mono border-0">
                          {githubResult.default_branch}
                        </Badge>
                      </div>
                      <p className="text-xs text-blue-200 line-clamp-2">
                        {githubResult.description || 'Full-stack application codebase ready for cloud infrastructure synthesis.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-blue-200 block">Est. Monthly Cloud Cost</span>
                        <span className="text-lg font-black text-white">
                          ${githubResult.estimated_monthly_range.min.toFixed(0)} &ndash; ${githubResult.estimated_monthly_range.max.toFixed(0)}/mo
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-6 space-y-5">
                  {/* Detected Components Grid */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                      <span>Detected Architecture Stack ({githubResult.detected_components.length} components found in {githubResult.scanned_files_count} files)</span>
                      <span className="text-[10px] font-normal text-slate-500 lowercase font-mono">
                        primary: {githubResult.primary_language}
                      </span>
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                      {githubResult.detected_components.map((comp, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-blue-300 transition-all text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900 truncate">
                              {getCategoryIcon(comp.category)}
                              <span className="truncate">{comp.name}</span>
                            </div>
                            <Badge variant="outline" className="text-[9px] capitalize px-1 py-0 bg-white">
                              {comp.category}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-tight">
                            {comp.detail}
                          </p>
                          {comp.detected_in && (
                            <span className="text-[9px] font-mono text-blue-600 block truncate" title={comp.detected_in}>
                              &bull; {comp.detected_in}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommended Cloud Services (AWS & Azure) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                    <div className="p-3 rounded-xl bg-orange-50/50 border border-orange-200/70 space-y-2">
                      <div className="flex items-center gap-2">
                        <Cloud className="h-4 w-4 text-orange-600" />
                        <span className="text-xs font-bold text-slate-900">Recommended AWS Services</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {githubResult.recommended_services_aws.map((svc, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-orange-200 text-orange-950 shadow-2xs"
                          >
                            {svc}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-200/70 space-y-2">
                      <div className="flex items-center gap-2">
                        <Server className="h-4 w-4 text-blue-600" />
                        <span className="text-xs font-bold text-slate-900">Recommended Azure Services</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {githubResult.recommended_services_azure.map((svc, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white border border-blue-200 text-blue-950 shadow-2xs"
                          >
                            {svc}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Sizing & Concurrency Fine-Tuning */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
                        <span>Interactive Sizing & Scale Feedback</span>
                      </div>
                      <span className="text-[10px] text-slate-500">Fine-tune before generating topology</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-slate-700">Target Scale Level</Label>
                        <select
                          value={trafficScale}
                          onChange={(e) => {
                            const val = e.target.value as any
                            setTrafficScale(val)
                            handleAnalyzeGithub()
                          }}
                          className="w-full text-xs h-8 px-2 rounded-md border border-slate-300 bg-white"
                        >
                          <option value="small">Small (Dev / Staging / 100 users)</option>
                          <option value="medium">Medium (Production Baseline / 500 users)</option>
                          <option value="high">High-Throughput (2k-5k users / Multi-AZ)</option>
                          <option value="enterprise">Enterprise (10k+ users / Multi-Region)</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-slate-700">Deployment Region</Label>
                        <select
                          value={selectedRegion}
                          onChange={(e) => setSelectedRegion(e.target.value)}
                          className="w-full text-xs h-8 px-2 rounded-md border border-slate-300 bg-white"
                        >
                          {POPULAR_REGIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px] font-semibold text-slate-700">Target Monthly Budget</Label>
                        <Input
                          value={budget}
                          onChange={(e) => setBudget(e.target.value)}
                          placeholder={`$${githubResult.estimated_monthly_range.max.toFixed(0)}/mo`}
                          className="text-xs h-8 bg-white"
                        />
                      </div>
                    </div>

                    {/* Editable Prompt Preview */}
                    <div className="space-y-1 pt-1">
                      <Label className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
                        <span>Generated Workload Specification (Editable)</span>
                        <span className="text-[10px] text-blue-600 font-normal">Add custom notes or constraints below</span>
                      </Label>
                      <Textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        rows={4}
                        className="text-xs bg-white resize-none font-normal leading-relaxed"
                      />
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="bg-slate-50 border-t border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 text-center sm:text-left">
                    Clicking approve will size resources, build the interactive topology graph, and estimate live monthly pricing.
                  </div>

                  <Button
                    type="button"
                    onClick={() => handleCreateProject(prompt, name)}
                    disabled={loading || !prompt.trim()}
                    className="w-full sm:w-auto h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-2 cursor-pointer shadow-md shrink-0"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Generating Architecture & Sizing...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 text-amber-300" />
                        <span>Approve & Generate Cloud Architecture</span>
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            )}
          </div>
        )}

        {/* ── MODE 2: DESCRIBE IN TEXT / NATURAL LANGUAGE ───────────────────── */}
        {creationMode === 'prompt' && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleCreateProject(prompt, name)
            }}
            className="space-y-6"
          >
            <Card className="border-slate-200 shadow-xs bg-white">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Natural Language Application Description</CardTitle>
                    <CardDescription className="text-xs">
                      Explain components, throughput, user counts, database engine, storage, or compliance needs.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPrompt(EXAMPLE_PROMPT)}
                    className="text-xs h-7 gap-1 text-slate-600 cursor-pointer"
                  >
                    <Sparkles className="h-3 w-3 text-amber-500" />
                    Load Sample Spec
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="projectNamePrompt" className="text-xs font-semibold text-slate-700">
                    Project Name
                  </Label>
                  <Input
                    id="projectNamePrompt"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Healthcare Analytics Portal (optional — auto-generated from prompt if blank)"
                    className="text-xs bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">Application Architecture Specification</Label>
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe your workload, tech stack, concurrency, and growth..."
                    rows={6}
                    className="text-xs font-normal leading-relaxed bg-white"
                    required
                  />
                </div>

                {/* Architectural Parameters & Region Selection */}
                <div className="pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-3">
                    <Layers className="h-4 w-4 text-blue-600" />
                    Architectural & Workload Sizing Parameters
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-3.5 bg-slate-50/80 rounded-lg border border-slate-200">
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
                        <span>Target Cloud Deployment Region</span>
                        <span className="text-[10px] text-blue-600 font-normal">Primary</span>
                      </Label>
                      <select
                        value={selectedRegion}
                        onChange={(e) => setSelectedRegion(e.target.value)}
                        className="w-full text-xs h-8 px-2.5 rounded-md border border-slate-300 bg-white text-slate-800"
                      >
                        {POPULAR_REGIONS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>

                      {selectedRegion === 'custom' && (
                        <Input
                          value={customRegion}
                          onChange={(e) => setCustomRegion(e.target.value)}
                          className="text-xs h-8 bg-white mt-1.5"
                          placeholder="Type custom region code (e.g. ap-northeast-1, centralindia)..."
                        />
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700">Concurrent Users</Label>
                      <Input
                        value={users}
                        onChange={(e) => setUsers(e.target.value)}
                        className="text-xs h-8 bg-white"
                        placeholder="150"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700">Target Budget ($/mo)</Label>
                      <Input
                        value={budget}
                        onChange={(e) => setBudget(e.target.value)}
                        className="text-xs h-8 bg-white"
                        placeholder="500"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700">Availability SLA</Label>
                      <Input
                        value={availability}
                        onChange={(e) => setAvailability(e.target.value)}
                        className="text-xs h-8 bg-white"
                        placeholder="99.9%"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700">Primary Database Engine</Label>
                      <select
                        value={dbEngine}
                        onChange={(e) => setDbEngine(e.target.value)}
                        className="w-full text-xs h-8 px-2.5 rounded-md border border-slate-300 bg-white text-slate-800"
                      >
                        <option value="auto">Auto (Detect from prompt)</option>
                        <option value="PostgreSQL">PostgreSQL</option>
                        <option value="MySQL">MySQL</option>
                        <option value="MongoDB/DocumentDB">DocumentDB / MongoDB</option>
                        <option value="Redis/MemoryDB">Redis / In-Memory Cache</option>
                        <option value="none">No Database Needed</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700">Initial DB Storage (GB)</Label>
                      <Input
                        value={storageGb}
                        onChange={(e) => setStorageGb(e.target.value)}
                        className="text-xs h-8 bg-white"
                        placeholder="100"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-[11px] font-semibold text-slate-700">Backup Policy</Label>
                      <Input
                        value={backupRetention}
                        onChange={(e) => setBackupRetention(e.target.value)}
                        className="text-xs h-8 bg-white"
                        placeholder="7 days"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="pt-2">
                <Button
                  type="submit"
                  disabled={loading || !prompt.trim()}
                  className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer font-bold text-xs h-9 shadow-xs"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Extracting Architecture & Sizing Specs...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 text-amber-300" />
                      <span>Start Workload Analysis & Discovery</span>
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </form>
        )}
      </main>
    </div>
  )
}
