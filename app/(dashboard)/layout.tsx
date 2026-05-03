// Layout untuk semua halaman dashboard. Sudah di-protect oleh middleware,
// tapi getServerSession() di sini juga jadi sumber data user untuk Topbar.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { Sidebar } from '@/components/dashboard/Sidebar'
import { Topbar } from '@/components/dashboard/Topbar'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  // Fetch saldo token sekali di server — di-pass ke Sidebar.
  const balance = await prisma.tokenBalance.findUnique({
    where: { userId: session.user.id },
    select: { balance: true },
  })

  return (
    <div className="flex min-h-svh w-full">
      <Sidebar
        className="hidden md:flex"
        tokenBalance={balance?.balance ?? 0}
      />
      <div className="flex flex-1 flex-col">
        <Topbar
          name={session.user.name}
          email={session.user.email}
          image={session.user.image}
        />
        {/* Padding diberikan per-halaman supaya halaman seperti /inbox bisa
            full-bleed (split panel) tanpa di-pad parent. */}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
