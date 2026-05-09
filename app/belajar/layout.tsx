// Layout publik untuk /belajar — TIDAK pakai dashboard auth gate.
// Login flow handled di client pakai cookie StudentSession.
import type { ReactNode } from 'react'

export default function BelajarLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh bg-warm-50 text-warm-900">
      <header className="border-b border-warm-200 bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <a
            href="/belajar"
            className="font-display text-lg font-extrabold text-primary-600"
          >
            Hulao Belajar
          </a>
          <a
            href="/"
            className="text-xs text-warm-500 hover:text-warm-700"
          >
            ← Beranda
          </a>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
