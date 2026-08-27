'use client'

// Rail tab kiri ala halaman Developers kirimchat: daftar tab vertikal di
// desktop, menyusut jadi pill horizontal di layar sempit. Konten tiap tab
// boleh server component — dioper sebagai ReactNode dari page.
import { useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export interface DevShellTab {
  id: string
  label: string
  /** Elemen ikon yang SUDAH dirender (mis. <KeyRound className="size-4" />) —
   *  fungsi komponen tidak bisa menyeberang batas server→client. */
  icon: ReactNode
  content: ReactNode
  /** Badge kecil di kanan label, mis. "Baru". */
  badge?: string
}

interface DevShellProps {
  tabs: DevShellTab[]
  defaultTab?: string
}

export function DevShell({ tabs, defaultTab }: DevShellProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id)
  const current = tabs.find((t) => t.id === active) ?? tabs[0]

  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col md:overflow-visible">
        {tabs.map((t) => {
          const isActive = t.id === current?.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary-50 font-medium text-primary-700'
                  : 'text-warm-600 hover:bg-warm-100 hover:text-warm-900',
              )}
            >
              {t.icon}
              {t.label}
              {t.badge && (
                <span className="ml-auto rounded-full bg-primary-100 px-1.5 py-0.5 text-xs font-semibold text-primary-700">
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
      <div className="min-w-0 flex-1">{current?.content}</div>
    </div>
  )
}
