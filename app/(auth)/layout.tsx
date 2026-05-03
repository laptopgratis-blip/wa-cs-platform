// Layout untuk halaman auth (login/register) — centered card dengan
// background gradient warm + dot grid subtle, plus logo platform di atas card.
import { MessageCircle } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh w-full flex-col items-center justify-center px-4 py-10">
      {/* Background gradient + subtle dot grid */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-gradient-to-br from-primary-50 via-warm-50 to-white"
      />
      <div
        aria-hidden
        className="dot-grid absolute inset-0 -z-10 opacity-[0.06]"
      />

      <Link href="/" className="mb-6 flex items-center gap-2.5">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary-500 text-white shadow-orange">
          <MessageCircle className="size-5" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-lg font-bold text-warm-900">WA CS</p>
          <p className="text-[11px] font-medium text-primary-500">Platform</p>
        </div>
      </Link>

      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
