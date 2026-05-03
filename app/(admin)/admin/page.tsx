// /admin → entry point default berdasarkan role pengguna.
// ADMIN: ke /admin/dashboard. FINANCE: ke /admin/finance.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { authOptions } from '@/lib/auth'

export default async function AdminIndexPage(): Promise<never> {
  const session = await getServerSession(authOptions)
  if (session?.user.role === 'FINANCE') redirect('/admin/finance')
  redirect('/admin/dashboard')
}
