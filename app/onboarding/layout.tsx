// Layout halaman /onboarding — full-page tanpa sidebar/topbar dashboard.
// Di-protect oleh middleware (/onboarding/:path*).
import { MessageCircle } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh w-full flex-col px-4 py-8">
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-gradient-to-br from-primary-50 via-warm-50 to-white"
      />
      <div
        aria-hidden
        className="dot-grid absolute inset-0 -z-10 opacity-[0.06]"
      />

      <Link href="/dashboard" className="mb-8 flex items-center gap-2.5 self-start">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary-500 text-white shadow-orange">
          <MessageCircle className="size-5" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-lg font-bold text-warm-900">Hulao</p>
          <p className="text-[11px] font-medium text-primary-500">CS WhatsApp + CRM</p>
        </div>
      </Link>

      <div className="mx-auto w-full max-w-3xl flex-1">{children}</div>
    </div>
  )
}
