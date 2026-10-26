'use client'

import React from 'react'
import { Navbar } from './Navbar'
import { Sidebar } from './Sidebar'

interface ProjectLayoutProps {
  children: React.ReactNode
  projectId: string
  projectName?: string
}

export function ProjectLayout({ children, projectId, projectName }: ProjectLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50/30">
      <Navbar />
      <div className="flex flex-1">
        <Sidebar projectId={projectId} projectName={projectName} />
        <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
