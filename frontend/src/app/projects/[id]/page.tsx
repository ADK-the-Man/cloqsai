'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'

export default function ProjectRedirectPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string

  useEffect(() => {
    if (id) {
      router.replace(`/projects/${id}/discover`)
    }
  }, [id, router])

  return (
    <div className="flex h-64 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  )
}
