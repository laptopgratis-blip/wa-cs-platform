// Topbar dashboard. Kiri: nama halaman aktif (breadcrumb sederhana).
// Kanan: tombol notif + avatar dropdown.
'use client'

import { usePathname } from 'next/navigation'

import { UserMenu } from '@/components/dashboard/UserMenu'
import { NotificationBell } from '@/components/notification/NotificationBell'
import { PlanBadge } from '@/components/subscription/PlanBadge'
import { getNavTitle } from '@/lib/navigation'

interface TopbarProps {
  name?: string | null
  email?: string | null
  image?: string | null
}

export function Topbar({ name, email, image }: TopbarProps) {
  const pathname = usePathname()
  const title = getNavTitle(pathname)

  return (
    <header className="flex h-14 items-center justify-between border-b border-warm-200 bg-card px-4 shadow-sm md:px-6">
      <div className="flex items-baseline gap-2">
        <p className="font-display text-base font-semibold text-foreground">
          {title}
        </p>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          / {name ?? 'Pengguna'}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <PlanBadge />
        <NotificationBell />
        <UserMenu name={name} email={email} image={image} />
      </div>
    </header>
  )
}
