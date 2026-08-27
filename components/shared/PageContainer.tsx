// Wrapper halaman standar — pengganti semua variasi container ad-hoc
// (`mx-auto h-full max-w-* overflow-y-auto p-4 md:p-6` dkk).
// Scroll TIDAK diatur di sini — scroll milik <main> pada layout shell.
// Halaman full-bleed (inbox, editor LP) tidak memakai komponen ini.
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type PageWidth = 'narrow' | 'default' | 'wide' | 'full'

const WIDTH: Record<PageWidth, string> = {
  /** Form / detail / settings. */
  narrow: 'max-w-3xl',
  /** Mayoritas halaman list & dashboard. */
  default: 'max-w-6xl',
  /** Tabel lebar / analytics. */
  wide: 'max-w-7xl',
  /** Tanpa batas lebar (jarang — pertimbangkan layout sendiri). */
  full: 'max-w-none',
}

interface PageContainerProps {
  children: ReactNode
  width?: PageWidth
  className?: string
}

export function PageContainer({
  children,
  width = 'default',
  className,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        'mx-auto flex min-h-full w-full flex-col gap-6 p-4 md:p-6',
        WIDTH[width],
        className,
      )}
    >
      {children}
    </div>
  )
}
