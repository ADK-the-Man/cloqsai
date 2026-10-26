'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'
import { Cloud } from 'lucide-react'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (isAuthenticated()) {
        router.replace('/dashboard')
      } else {
        router.replace('/login')
      }
    }
  }, [router])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 text-slate-800 p-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
          <Cloud className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">CLOQS AI</h2>
          <p className="text-xs text-slate-500 mt-1">Connecting to Cloud Intelligence Workspace...</p>
        </div>
        <div className="flex justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
        <div className="pt-2">
          <a
            href="/login"
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 underline"
          >
            Click here if you are not redirected automatically
          </a>
        </div>
      </div>
    </div>
  )
}
