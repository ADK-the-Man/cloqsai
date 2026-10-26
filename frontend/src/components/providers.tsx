'use client'

import React, { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  )

  useEffect(() => {
    try {
      localStorage.removeItem('cloudcost_theme_mode')
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('liquid-glass', 'spatial-ui', 'minimal-ui')
      }
    } catch {}
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster position="top-right" richColors closeButton duration={4000} />
    </QueryClientProvider>
  )
}
