import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow } from 'date-fns'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(
  amount: number,
  currency = 'USD',
  compact = false
): string {
  if (compact && amount >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateString: string): string {
  try {
    return format(new Date(dateString), 'MMM d, yyyy')
  } catch {
    return dateString
  }
}

export function formatDateRelative(dateString: string): string {
  try {
    return formatDistanceToNow(new Date(dateString), { addSuffix: true })
  } catch {
    return dateString
  }
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function getProviderLabel(provider: string): string {
  switch (provider) {
    case 'aws':
      return 'AWS'
    case 'azure':
      return 'Azure'
    case 'both':
      return 'AWS + Azure'
    default:
      return provider.toUpperCase()
  }
}

export function getStatusColor(
  status: string
): 'default' | 'secondary' | 'destructive' | 'success' | 'warning' {
  switch (status) {
    case 'completed':
    case 'healthy':
      return 'success'
    case 'failed':
    case 'unavailable':
    case 'error':
      return 'destructive'
    case 'in_progress':
    case 'calculating':
    case 'pending':
      return 'warning'
    case 'degraded':
      return 'warning'
    default:
      return 'secondary'
  }
}
