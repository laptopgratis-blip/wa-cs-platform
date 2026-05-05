// Layout admin — cek role ADMIN di server-side, plus sidebar khusus.
// Middleware juga sudah cek, ini second line of defense.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { Topbar } from '@/components/dashboard/Topbar'
import { MobileNav } from '@/components/layout/MobileNav'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  // ADMIN dapat semua menu; FINANCE hanya boleh masuk dengan akses ke
  // /admin/finance (granular check ditangani middleware + per-route guard).
  const role = session.user.role
  if (role !== 'ADMIN' && role !== 'FINANCE') redirect('/dashboard')

  // Saldo token tetap ditampilkan di drawer mobile supaya admin yang juga
  // pakai akun untuk WA personal bisa cek tanpa keluar dari area admin.
  const balance = await prisma.tokenBalance.findUnique({
    where: { userId: session.user.id },
    select: { balance: true },
  })

  return (
    <div className="flex min-h-svh w-full">
      <AdminSidebar className="hidden md:flex" role={role} />
      <div className="flex flex-1 flex-col">
        <Topbar
          name={session.user.name}
          email={session.user.email}
          image={session.user.image}
        />
        <main className="flex-1 overflow-hidden pb-16 md:pb-0">{children}</main>
      </div>
      <MobileNav
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
          role,
        }}
        tokenBalance={balance?.balance ?? 0}
      />
    </div>
  )
}
