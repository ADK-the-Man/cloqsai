'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ProjectLayout } from '@/components/layout/ProjectLayout'
import { getToken } from '@/lib/auth'

export default function Layout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const id = params.id as string
  const [projectName, setProjectName] = useState<string>('')

  useEffect(() => {
    if (!id) return
    const fetchProj = async () => {
      try {
        const token = getToken()
        const res = await fetch(`/api/v1/projects/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const data = await res.json()
          setProjectName(data.name)
        }
      } catch (err) {
        console.error(err)
      }
    }
    fetchProj()
  }, [id])

  return (
    <ProjectLayout projectId={id} projectName={projectName}>
      {children}
    </ProjectLayout>
  )
}
