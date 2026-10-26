'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Cloud, LogOut, PlusCircle, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { removeToken } from '@/lib/auth'

export function Navbar() {
  const router = useRouter()
  const pathname = usePathname()
  const isNewProjectPage = pathname === '/projects/new'

  const handleLogout = () => {
    removeToken()
    router.push('/login')
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container flex h-16 items-center justify-between px-3 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm shrink-0">
              <Cloud className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-base font-extrabold tracking-tight text-slate-900">
                  CLOQS
                </span>
                <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-blue-100 text-blue-700 font-bold">
                  AI
                </span>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 hidden sm:inline">
                Cloud Architecture & Cost Intelligence
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-4 text-sm font-medium text-slate-600">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 transition-colors hover:text-slate-900 px-3 py-1.5 rounded-md hover:bg-slate-100"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {!isNewProjectPage && (
            <Button asChild size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 shadow-2xs font-semibold text-xs">
              <Link href="/projects/new">
                <PlusCircle className="h-3.5 w-3.5" />
                <span>New Estimate</span>
              </Link>
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-slate-500 hover:text-slate-900 gap-1.5"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
