// Header halaman standar: judul (gaya seragam) + deskripsi + slot aksi kanan.
// Menggantikan h1 ad-hoc yang ukurannya/strukturnya beda-beda antar layar.
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface PageHeaderProps {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div>
        <h1 className="font-display text-warm-900 flex items-center gap-2 text-2xl font-semibold tracking-tight md:text-3xl">
          {Icon && <Icon className="text-primary-500 size-6" aria-hidden />}
          {title}
        </h1>
        {description && (
          <p className="text-warm-500 mt-1 text-sm">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  )
}
