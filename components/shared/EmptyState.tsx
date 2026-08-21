// Empty state standar untuk list/tabel/grid: ikon + judul + deskripsi + CTA opsional.
// Prop `bordered` membungkus dengan dashed-card (pola standar untuk empty state
// yang berdiri sendiri di halaman, bukan di dalam Card lain).
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  /** Bungkus dengan dashed-card — pakai saat empty state berdiri sendiri. */
  bordered?: boolean
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  bordered = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        bordered && 'rounded-xl border border-dashed border-warm-300 bg-card',
        className,
      )}
    >
      {Icon && (
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Icon className="size-6 text-muted-foreground" aria-hidden />
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-warm-900">{title}</h3>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
