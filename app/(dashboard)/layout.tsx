// Layout untuk semua halaman dashboard. Sudah di-protect oleh middleware,
// tapi getServerSession() di sini juga jadi sumber data user untuk Topbar
// + Drawer mobile.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { DashboardOrderPopup } from '@/components/dashboard/DashboardOrderPopup'
import { Sidebar } from '@/components/dashboard/Sidebar'
import { Topbar } from '@/components/dashboard/Topbar'
import { MobileNav } from '@/components/layout/MobileNav'
import { MainWelcomeWizard } from '@/components/onboarding/MainWelcomeWizard'
import { authOptions } from '@/lib/auth'
import { MESSAGE_CREDIT_BILLING_ENABLED } from '@/lib/billing/message-credit-mode'
import type { OnboardingGoal } from '@/lib/navigation'
import { checkOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Onboarding: user baru (<7 hari) tanpa goal & belum skip → redirect
  // ke /onboarding. Existing user >7 hari boleh tanpa goal (banner kecil
  // di dashboard, no force redirect).
  const userMeta = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      createdAt: true,
      onboardingGoal: true,
      onboardingDismissedAt: true,
      welcomeWizardDismissedAt: true,
      dashboardOrderPopupEnabled: true,
      dashboardOrderPopupSound: true,
    },
  })
  if (
    userMeta &&
    !userMeta.onboardingGoal &&
    !userMeta.onboardingDismissedAt &&
    userMeta.createdAt.getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
  ) {
    redirect('/onboarding')
  }

  // Fetch saldo token + akses Order System paralel — di-pass ke Sidebar (desktop)
  // + Drawer (mobile) untuk filter menu Order System (POWER only).
  const [balance, orderAccess, cloudSessionCount] = await Promise.all([
    prisma.tokenBalance.findUnique({
      where: { userId: session.user.id },
      select: { balance: true, messageCreditRp: true },
    }),
    checkOrderSystemAccess(session.user.id),
    // Kartu "Kredit Pesan WA" hanya relevan bila user punya nomor Cloud API.
    prisma.whatsappSession.count({
      where: { userId: session.user.id, provider: 'CLOUD_API', isActive: true },
    }),
  ])
  const tokenBalance = balance?.balance ?? 0
  // null = kartu Kredit Pesan tidak dirender (billing kredit nonaktif).
  const messageCreditRp =
    MESSAGE_CREDIT_BILLING_ENABLED &&
    (cloudSessionCount > 0 || (balance?.messageCreditRp ?? 0) !== 0)
      ? (balance?.messageCreditRp ?? 0)
      : null
  const hasOrderSystemAccess = orderAccess.hasAccess
  const onboardingGoal = (userMeta?.onboardingGoal ?? null) as
    | OnboardingGoal
    | null
  // Welcome wizard utama: tampil setiap login selama user belum klik
  // "Jangan tampilkan lagi". Client component handle sessionStorage flag
  // supaya nggak nongol pas navigate antar halaman.
  const showWelcomeWizard = !userMeta?.welcomeWizardDismissedAt

  return (
    // App-shell fixed-height: dokumen tidak pernah scroll — sidebar & topbar
    // diam, hanya <main> (konten halaman) yang scroll.
    <div className="flex h-dvh w-full overflow-hidden">
      {/* Desktop sidebar */}
      <Sidebar
        className="hidden md:flex"
        tokenBalance={tokenBalance}
        messageCreditRp={messageCreditRp}
        hasOrderSystemAccess={hasOrderSystemAccess}
        onboardingGoal={onboardingGoal}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          name={session.user.name}
          email={session.user.email}
          image={session.user.image}
        />
        {/* Padding diberikan per-halaman supaya halaman seperti /inbox bisa
            full-bleed (split panel) tanpa di-pad parent. Padding-bottom
            untuk mobile = tinggi BottomNav + safe-area-inset-bottom (iPhone
            home indicator) supaya konten paling bawah tidak ketutup nav. */}
        <main className="flex-1 overflow-y-auto pb-mobile-nav md:pb-0">
          {children}
        </main>
      </div>
      {/* Mobile bottom nav + drawer (md:hidden internally) */}
      <MobileNav
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
          role: session.user.role,
        }}
        tokenBalance={tokenBalance}
        messageCreditRp={messageCreditRp}
        hasOrderSystemAccess={hasOrderSystemAccess}
        onboardingGoal={onboardingGoal}
      />
      {showWelcomeWizard && <MainWelcomeWizard initialOpen />}
      <DashboardOrderPopup
        enabled={userMeta?.dashboardOrderPopupEnabled ?? true}
        sound={
          (userMeta?.dashboardOrderPopupSound ?? 'chime') as
            | 'bell'
            | 'ding'
            | 'chime'
            | 'pop'
            | 'off'
        }
      />
    </div>
  )
}
