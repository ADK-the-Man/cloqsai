import type { Metadata } from 'next'
import { Providers } from '@/components/providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'CLOQS AI — AI-Powered Cloud Architecture & Cost Intelligence',
  description:
    'CLOQS AI: Architect Smarter. Optimize Everything. AI-Powered Cloud Architecture & Cost Intelligence Engine.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans antialiased text-slate-900">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
