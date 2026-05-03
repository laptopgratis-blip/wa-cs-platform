// Layout admin — cek role ADMIN di server-side, plus sidebar khusus.
// Middleware juga sudah cek, ini second line of defense.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { Topbar } from '@/components/dashboard/Topbar'
import { authOptions } from '@/lib/auth'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  // ADMIN dapat semua menu; FINANCE hanya boleh masuk dengan akses ke
  // /admin/finance (granular check ditangani middleware + per-route guard).
  const role = session.user.role
  if (role !== 'ADMIN' && role !== 'FINANCE') redirect('/dashboard')

  return (
    <div className="flex min-h-svh w-full">
      <AdminSidebar className="hidden md:flex" role={role} />
      <div className="flex flex-1 flex-col">
        <Topbar
          name={session.user.name}
          email={session.user.email}
          image={session.user.image}
        />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
