// Topbar dashboard. Kiri: nama halaman aktif (breadcrumb sederhana).
// Kanan: tombol notif + avatar dropdown.
'use client'

import { Bell } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { UserMenu } from '@/components/dashboard/UserMenu'
import { Button } from '@/components/ui/button'

interface TopbarProps {
  name?: string | null
  email?: string | null
  image?: string | null
}

// Map path → judul halaman. Default: derive dari segment terakhir.
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/whatsapp': 'WhatsApp',
  '/soul': 'Soul',
  '/inbox': 'Inbox',
  '/contacts': 'Contacts',
  '/broadcast': 'Broadcast',
  '/analytics': 'Analytics',
  '/billing': 'Billing',
  '/purchases': 'Riwayat Pembelian',
  '/admin/dashboard': 'Admin Dashboard',
  '/admin/models': 'AI Models',
  '/admin/packages': 'Token Packages',
  '/admin/users': 'Users',
}

function getPageTitle(pathname: string | null): string {
  if (!pathname) return 'Dashboard'
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]!
  // Fallback: ambil segment terakhir, capitalize.
  const seg = pathname.split('/').filter(Boolean).pop() ?? 'Dashboard'
  return seg.charAt(0).toUpperCase() + seg.slice(1)
}

export function Topbar({ name, email, image }: TopbarProps) {
  const pathname = usePathname()
  const title = getPageTitle(pathname)

  return (
    <header className="flex h-14 items-center justify-between border-b border-warm-200 bg-card px-4 shadow-sm md:px-6">
      <div className="flex items-baseline gap-2">
        <h1 className="font-display text-base font-semibold text-foreground">
          {title}
        </h1>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          / {name ?? 'Pengguna'}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifikasi"
          className="relative text-warm-500 hover:bg-warm-100 hover:text-warm-800"
        >
          <Bell className="size-4" />
          {/* Indicator dot — placeholder untuk notif belum dibaca */}
          <span
            aria-hidden
            className="absolute right-2 top-2 size-1.5 rounded-full bg-primary-500"
          />
        </Button>
        <UserMenu name={name} email={email} image={image} />
      </div>
    </header>
  )
}
