// Layout untuk semua halaman dashboard. Sudah di-protect oleh middleware,
// tapi getServerSession() di sini juga jadi sumber data user untuk Topbar
// + Drawer mobile.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { Sidebar } from '@/components/dashboard/Sidebar'
import { Topbar } from '@/components/dashboard/Topbar'
import { MobileNav } from '@/components/layout/MobileNav'
import { authOptions } from '@/lib/auth'
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
  const [balance, orderAccess] = await Promise.all([
    prisma.tokenBalance.findUnique({
      where: { userId: session.user.id },
      select: { balance: true },
    }),
    checkOrderSystemAccess(session.user.id),
  ])
  const tokenBalance = balance?.balance ?? 0
  const hasOrderSystemAccess = orderAccess.hasAccess
  const onboardingGoal = (userMeta?.onboardingGoal ?? null) as
    | OnboardingGoal
    | null

  return (
    <div className="flex min-h-svh w-full">
      {/* Desktop sidebar */}
      <Sidebar
        className="hidden md:flex"
        tokenBalance={tokenBalance}
        hasOrderSystemAccess={hasOrderSystemAccess}
        onboardingGoal={onboardingGoal}
      />
      <div className="flex flex-1 flex-col">
        <Topbar
          name={session.user.name}
          email={session.user.email}
          image={session.user.image}
        />
        {/* Padding diberikan per-halaman supaya halaman seperti /inbox bisa
            full-bleed (split panel) tanpa di-pad parent. Padding-bottom
            untuk mobile supaya konten tidak ketutup BottomNav. */}
        <main className="flex-1 overflow-hidden pb-16 md:pb-0">
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
        hasOrderSystemAccess={hasOrderSystemAccess}
        onboardingGoal={onboardingGoal}
      />
    </div>
  )
}
