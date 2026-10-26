'use client'

export const dynamic = 'force-dynamic'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Cloud, Lock, Mail, User as UserIcon, ArrowRight, AlertCircle, Sparkles, CheckCircle2, ShieldCheck, X } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setToken } from '@/lib/auth'

// Multi-color Google "G" Icon SVG
function GoogleIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

// Multi-color Microsoft 4-square Icon SVG
function MicrosoftIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

export default function LoginPage() {
  const router = useRouter()
  // Default to true so social SSO buttons appear immediately; verified dynamically against /api/v1/auth/config
  const [loginEnabled, setLoginEnabled] = useState(true)
  const [googleConfigured, setGoogleConfigured] = useState(true)
  const [microsoftConfigured, setMicrosoftConfigured] = useState(false)
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [socialLoading, setSocialLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Browser SSO Prompt Dialog for Dev Mode (when client ID not configured in cloud console)
  const [ssoModal, setSsoModal] = useState<{ open: boolean; provider: 'google' | 'microsoft'; defaultEmail: string } | null>(null)
  const [customSsoEmail, setCustomSsoEmail] = useState('')

  // 1. Check for token in URL query params on mount (from OAuth callback)
  // 2. Load auth configuration from backend
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')
      const urlError = params.get('error')

      if (token) {
        setToken(token)
        setSuccessMsg('Successfully authenticated! Redirecting to dashboard...')
        setTimeout(() => router.push('/dashboard'), 500)
        return
      }

      if (urlError) {
        setError(decodeURIComponent(urlError))
      }
    }

    // Fetch auth config with timestamp cache busting
    const t = Date.now()
    fetch(`/api/v1/auth/config?_t=${t}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          const isEnabled = Boolean(data.login_enabled) || (Array.isArray(data.providers) && data.providers.length > 0)
          setLoginEnabled(isEnabled)
          setGoogleConfigured(Boolean(data.google_client_id_configured))
          setMicrosoftConfigured(Boolean(data.microsoft_client_id_configured))
        }
      })
      .catch(() => {
        // Fallback: check direct backend port 8001 if proxy is pending
        fetch(`http://localhost:8001/api/v1/auth/config?_t=${t}`, { cache: 'no-store' })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data) {
              const isEnabled = Boolean(data.login_enabled) || (Array.isArray(data.providers) && data.providers.length > 0)
              setLoginEnabled(isEnabled)
              setGoogleConfigured(Boolean(data.google_client_id_configured))
              setMicrosoftConfigured(Boolean(data.microsoft_client_id_configured))
            }
          })
          .catch(() => {
            setLoginEnabled(false)
          })
      })
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccessMsg(null)
    setLoading(true)

    try {
      const endpoint = isRegister && loginEnabled ? '/api/v1/auth/register' : '/api/v1/auth/login'
      const payload = isRegister && loginEnabled ? { name, email, password } : { email, password }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || (isRegister ? 'Registration failed' : 'Invalid email or password'))
      }

      const data = await res.json()
      setToken(data.access_token)
      if (isRegister) {
        setSuccessMsg('Account created successfully! Redirecting to dashboard...')
        setTimeout(() => router.push('/dashboard'), 800)
      } else {
        router.push('/dashboard')
      }
    } catch (err: any) {
      setError(err.message || 'Operation failed')
    } finally {
      setLoading(false)
    }
  }

  const handleSocialClick = async (provider: 'google' | 'microsoft') => {
    setError(null)
    setSuccessMsg(null)

    const isConfigured = provider === 'google' ? googleConfigured : microsoftConfigured

    if (isConfigured) {
      // Direct redirect to OAuth authorization route
      window.location.href = `/api/v1/auth/oauth/${provider}/authorize`
    } else {
      // Interactive browser identity modal
      const defaultEmail = provider === 'google' ? 'architect.user@gmail.com' : 'enterprise.architect@outlook.com'
      setCustomSsoEmail(defaultEmail)
      setSsoModal({ open: true, provider, defaultEmail })
    }
  }

  const handleConfirmBrowserSso = async () => {
    if (!ssoModal) return
    const provider = ssoModal.provider
    setSocialLoading(provider)
    setError(null)

    try {
      const res = await fetch('/api/v1/auth/oauth/browser-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          email: customSsoEmail.trim(),
          name: customSsoEmail.split('@')[0].replace('.', ' ').replace(/^\w/, (c) => c.toUpperCase()),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.detail || 'Browser login failed')
      }

      const data = await res.json()
      setToken(data.access_token)
      setSuccessMsg(`Signed in with ${provider === 'google' ? 'Google (Gmail)' : 'Microsoft (Outlook)'}! Redirecting...`)
      setSsoModal(null)
      setTimeout(() => router.push('/dashboard'), 600)
    } catch (err: any) {
      setError(err.message || 'Authentication failed')
    } finally {
      setSocialLoading(null)
    }
  }

  const toggleMode = () => {
    if (!loginEnabled) return // Register is only available when login_enabled is true
    setIsRegister(!isRegister)
    setError(null)
    setSuccessMsg(null)
    setName('')
    setEmail('')
    setPassword('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 transition-colors">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
            <Cloud className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            CLOQS <span className="text-blue-600 font-bold">AI</span>
          </h1>
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
            AI-Powered Cloud Architecture & Cost Intelligence
          </p>
          <p className="text-[11px] font-medium text-slate-500 italic mt-0.5">
            Architect Smarter. Optimize Everything.
          </p>
        </div>

        {/* Auth Card */}
        <Card className="border-slate-200 shadow-sm bg-white">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold">
                {isRegister && loginEnabled ? 'Create an Account' : 'Sign In'}
              </CardTitle>

              {/* Only show register toggle when login_enabled is true */}
              {loginEnabled && (
                <button
                  type="button"
                  onClick={toggleMode}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                >
                  {isRegister ? 'Already have an account? Sign In' : 'Need an account? Register'}
                </button>
              )}
            </div>

            <CardDescription className="text-xs">
              {isRegister && loginEnabled
                ? 'Register to generate custom cloud architectures and pricing estimates'
                : 'Enter your credentials to access your architecture estimates'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2 border border-red-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMsg && (
              <div className="rounded-md bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2 border border-emerald-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Social / Browser Login (Only visible when login_enabled is true) */}
            {loginEnabled && !isRegister && (
              <div className="space-y-2.5 pb-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleSocialClick('google')}
                  disabled={Boolean(socialLoading) || loading}
                  className="w-full flex items-center justify-center gap-2.5 h-10 border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs shadow-2xs cursor-pointer"
                >
                  <GoogleIcon className="h-4 w-4 shrink-0" />
                  <span>
                    {socialLoading === 'google' ? 'Connecting to Google...' : 'Continue with Google (Gmail)'}
                  </span>
                </Button>

                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-200" />
                  </div>
                  <div className="relative flex justify-center text-[11px] uppercase">
                    <span className="bg-white px-2 text-slate-400 font-medium tracking-wider">
                      Or continue with password
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Standard Credentials Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegister && loginEnabled && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-medium">Full Name</Label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      id="name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="pl-9 text-xs"
                      placeholder="e.g. Jane Doe"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-9 text-xs"
                    placeholder="name@company.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pl-9 text-xs"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold h-9 shadow-xs cursor-pointer"
                disabled={loading}
              >
                {loading
                  ? (isRegister ? 'Creating Account...' : 'Authenticating...')
                  : (isRegister ? 'Register & Launch' : 'Sign In')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Browser SSO Account Picker Modal (Active when client credentials are in sandbox/dev mode) */}
      {ssoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {ssoModal.provider === 'google' ? <GoogleIcon className="h-5 w-5" /> : <MicrosoftIcon className="h-5 w-5" />}
                <h3 className="text-sm font-bold text-slate-900">
                  Sign in with {ssoModal.provider === 'google' ? 'Google' : 'Microsoft'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSsoModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 space-y-1">
              <p>
                Confirm your browser {ssoModal.provider === 'google' ? 'Gmail / Google Workspace' : 'Outlook / Hotmail / Microsoft 365'} account to sign in:
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-slate-700">Account Email</Label>
              <Input
                type="email"
                value={customSsoEmail}
                onChange={(e) => setCustomSsoEmail(e.target.value)}
                className="text-xs font-mono"
                placeholder={ssoModal.provider === 'google' ? 'your.name@gmail.com' : 'your.name@outlook.com'}
              />
            </div>

            <div className="rounded-md bg-slate-50 p-2.5 text-[11px] text-slate-500 border border-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>Instant browser OAuth session simulation. In production, configure CLIENT_ID in .env.</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSsoModal(null)}
                className="text-xs text-slate-600"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmBrowserSso}
                disabled={Boolean(socialLoading) || !customSsoEmail.includes('@')}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
              >
                {socialLoading ? 'Signing In...' : 'Confirm & Sign In'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
