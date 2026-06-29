// StatusBadge generik berbasis "tone" — generalisasi dari
// components/whatsapp/StatusBadge.tsx supaya semua status pill (payment,
// delivery, enrollment, dll) pakai satu palette + dark pairs yang sama.
// Label/tone per-domain didefinisikan di lib/status.ts.
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const TONE: Record<StatusTone, { bg: string; text: string; dot: string }> = {
  success: {
    bg: 'bg-emerald-50 dark:bg-emerald-500/10',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  warning: {
    bg: 'bg-yellow-50 dark:bg-yellow-500/10',
    text: 'text-yellow-700 dark:text-yellow-300',
    dot: 'bg-yellow-500',
  },
  danger: {
    bg: 'bg-red-50 dark:bg-red-500/10',
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
  },
  info: {
    bg: 'bg-primary-50 dark:bg-primary-500/10',
    text: 'text-primary-700 dark:text-primary-300',
    dot: 'bg-primary-500',
  },
  neutral: {
    bg: 'bg-warm-100 dark:bg-warm-700/30',
    text: 'text-warm-600 dark:text-warm-300',
    dot: 'bg-warm-400',
  },
}

interface StatusBadgeProps {
  tone: StatusTone
  label: string
  pulse?: boolean
  icon?: LucideIcon
  className?: string
}

export function StatusBadge({
  tone,
  label,
  pulse = false,
  icon: Icon,
  className,
}: StatusBadgeProps) {
  const p = TONE[tone] ?? TONE.neutral
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        p.bg,
        p.text,
        className,
      )}
    >
      {Icon ? (
        <Icon className="size-3" aria-hidden />
      ) : (
        <span
          aria-hidden
          className={cn(
            'size-1.5 rounded-full',
            p.dot,
            pulse && 'animate-pulse-dot',
          )}
        />
      )}
      {label}
    </span>
  )
}
