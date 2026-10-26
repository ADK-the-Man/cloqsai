'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Sparkles, Cloud, Server, Layers, ChevronDown, ChevronUp } from 'lucide-react'
import { Navbar } from '@/components/layout/Navbar'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getToken } from '@/lib/auth'

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

export default function NewProjectPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<'both' | 'aws' | 'azure'>('both')
  const [loading, setLoading] = useState(false)

  // Explicit Non-Hidden Architectural Parameters (Empty defaults, purely optional overrides)
  const [selectedRegion, setSelectedRegion] = useState('us-east-1')
  const [customRegion, setCustomRegion] = useState('')
  const [users, setUsers] = useState('')
  const [budget, setBudget] = useState('')
  const [availability, setAvailability] = useState('')
  const [dbEngine, setDbEngine] = useState('auto')
  const [storageGb, setStorageGb] = useState('')
  const [backupRetention, setBackupRetention] = useState('')

  const effectiveRegion = selectedRegion === 'custom' ? (customRegion.trim() || 'us-east-1') : selectedRegion

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!prompt.trim() || !name.trim()) return

    setLoading(true)
    const token = getToken()
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }

    try {
      // 1. Create project
      const projRes = await fetch('/api/v1/projects', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name.trim(),
          description: prompt.slice(0, 160) + '...',
          provider_selection: provider,
        }),
      })

      if (!projRes.ok) throw new Error('Failed to create project')
      const project = await projRes.json()

      // 2. Extract requirements only including parameters the user actually provided
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
        ? `${prompt.trim()}\n\nExplicit Parameters:\n${structuredParams.join('\n')}`
        : prompt.trim()

      await fetch(`/api/v1/projects/${project.id}/requirements/extract`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          raw_text: fullRawText,
        }),
      })

      // 3. Navigate to conversational discovery
      router.push(`/projects/${project.id}/discover`)
    } catch (err) {
      console.error(err)
      alert('Error initializing project. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Create Architecture & Cost Estimate
          </h1>
          <p className="text-sm text-slate-500">
            Describe your application in plain language. The AI agent analyzes workload requirements, sizes SKUs, and generates side-by-side estimates.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-4">
              <CardTitle className="text-base">1. Project Title & Target Cloud</CardTitle>
              <CardDescription className="text-xs">
                Give your project a name and choose target cloud environments.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="projectName" className="text-xs font-semibold text-slate-700">
                  Project Name
                </Label>
                <Input
                  id="projectName"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Healthcare Analytics Portal"
                  className="text-xs bg-white"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Target Cloud Providers</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    { key: 'both', label: 'Both Clouds', desc: 'AWS & Azure Comparison', icon: Layers },
                    { key: 'aws', label: 'Amazon AWS', desc: 'AWS Pricing Calculator', icon: Cloud },
                    { key: 'azure', label: 'Microsoft Azure', desc: 'Azure Retail Prices API', icon: Server },
                  ].map((item) => {
                    const Icon = item.icon
                    const isSelected = provider === item.key

                    return (
                      <div
                        key={item.key}
                        onClick={() => setProvider(item.key as any)}
                        className={`cursor-pointer rounded-lg border-2 p-3 text-left transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/30'
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
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">2. Natural Language Application Description</CardTitle>
                  <CardDescription className="text-xs">
                    Explain components, throughput, user counts, database engine, storage, or compliance needs.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPrompt(EXAMPLE_PROMPT)}
                  className="text-xs h-7 gap-1 text-slate-600"
                >
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  Load Sample Spec
                </Button>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your workload, tech stack, concurrency, and growth..."
                rows={6}
                className="text-xs font-normal leading-relaxed bg-white"
                required
              />

              {/* Architectural Parameters & Region Selection */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 mb-3">
                  <Layers className="h-4 w-4 text-blue-600" />
                  Architectural & Workload Sizing Parameters
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-3.5 bg-slate-50/80 rounded-lg border border-slate-200">
                  {/* Mandatory Region Selection */}
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px] font-semibold text-slate-700 flex items-center justify-between">
                      <span>Target Cloud Deployment Region</span>
                      <span className="text-[10px] text-blue-600 font-normal">Primary</span>
                    </Label>
                    <select
                      value={selectedRegion}
                      onChange={(e) => setSelectedRegion(e.target.value)}
                      className="w-full text-xs h-8 px-2.5 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
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
                      className="w-full text-xs h-8 px-2.5 rounded-md border border-slate-300 bg-white text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
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
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Extracting Architecture & Sizing Specs...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Start Workload Analysis & Discovery
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </main>
    </div>
  )
}
