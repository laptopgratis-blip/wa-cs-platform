// StatusBadge generik berbasis "tone" — semua status pill (payment,
// delivery, enrollment, WA session, dll) pakai satu palet dari
// lib/ui-tones.ts. Label/tone per-domain didefinisikan di lib/status.ts.
import type { LucideIcon } from 'lucide-react'

import { TONES, type Tone } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

// Alias tipe lama dipertahankan supaya 11+ pemakai existing tidak berubah.
export type StatusTone = Tone

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
  const p = TONES[tone] ?? TONES.neutral
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
