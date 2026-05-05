'use client'

// Drawer slide dari kanan untuk mobile. Berisi:
// - User card (avatar + nama + email)
// - Saldo token + tombol top-up
// - Grup menu USER (Produktivitas, Laporan, Akun)
// - Grup menu ADMIN (hanya muncul kalau session.user.role === 'ADMIN' / 'FINANCE')
// - Tombol logout
//
// Dipanggil dari header / bottom nav. State open dikontrol parent supaya
// trigger di mana saja bisa pakai drawer yang sama.
import { ChevronRight, LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { formatNumber } from '@/lib/format'
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_HOME,
  USER_NAV_GROUPS,
  USER_NAV_HOME,
  filterGroupsByRole,
  type NavGroup,
  type Role,
} from '@/lib/navigation'
import { cn } from '@/lib/utils'

interface MobileDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    role: Role
  }
  /** Saldo token user — untuk card di drawer. */
  tokenBalance?: number | null
}

export function MobileDrawer({
  open,
  onOpenChange,
  user,
  tokenBalance,
}: MobileDrawerProps) {
  const pathname = usePathname()
  const close = () => onOpenChange(false)

  // Filter admin groups by role; user groups selalu tampil.
  const userGroups = USER_NAV_GROUPS
  const adminGroups: NavGroup[] =
    user.role === 'ADMIN' || user.role === 'FINANCE'
      ? filterGroupsByRole(ADMIN_NAV_GROUPS, user.role)
      : []

  const showAdminSection = adminGroups.length > 0

  function isActive(href: string): boolean {
    if (!pathname) return false
    return pathname === href || pathname.startsWith(href + '/')
  }

  const initials = (user.name || user.email || '??')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[85%] max-w-sm overflow-y-auto p-0 sm:max-w-md"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Menu navigasi</SheetTitle>
        </SheetHeader>

        {/* User card */}
        <div className="border-b px-4 py-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-12">
              {user.image && <AvatarImage src={user.image} alt={user.name ?? ''} />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {user.name ?? user.email}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>
        </div>

        {/* Saldo Token */}
        {typeof tokenBalance === 'number' && (
          <div className="px-4 py-3">
            <Link
              href="/billing"
              onClick={close}
              className="flex items-center justify-between rounded-lg border border-primary-200 bg-primary-50 px-3 py-3 transition-colors hover:bg-primary-100"
            >
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-primary-700">
                  💰 Saldo Token
                </p>
                <p className="mt-0.5 font-display text-xl font-bold tabular-nums text-primary-700">
                  {formatNumber(tokenBalance)}
                </p>
              </div>
              <div className="text-xs font-medium text-primary-700">
                Top-up →
              </div>
            </Link>
          </div>
        )}

        {/* Home (Dashboard) */}
        <nav className="px-3 pb-2">
          <DrawerLink
            href={USER_NAV_HOME.href}
            label={USER_NAV_HOME.label}
            Icon={USER_NAV_HOME.icon}
            active={isActive(USER_NAV_HOME.href)}
            onClick={close}
          />
        </nav>

        {/* USER GROUPS */}
        {userGroups.map((g) => (
          <DrawerSection key={g.label} group={g} pathnameActive={isActive} onClickItem={close} />
        ))}

        {/* ADMIN PANEL — hanya untuk admin */}
        {showAdminSection && (
          <>
            <div className="mt-2 border-t" />
            <div className="px-4 pb-2 pt-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-red-600">
                ⚡ ADMIN PANEL
              </p>
            </div>
            <nav className="px-3">
              <DrawerLink
                href={ADMIN_NAV_HOME.href}
                label={ADMIN_NAV_HOME.label}
                Icon={ADMIN_NAV_HOME.icon}
                active={isActive(ADMIN_NAV_HOME.href)}
                onClick={close}
              />
            </nav>
            {adminGroups.map((g) => (
              <DrawerSection
                key={g.label}
                group={g}
                pathnameActive={isActive}
                onClickItem={close}
              />
            ))}
          </>
        )}

        {/* Logout */}
        <div className="mt-2 border-t px-3 py-3">
          <Button
            variant="ghost"
            className="w-full justify-start text-warm-600 hover:bg-warm-100"
            onClick={() => {
              close()
              void signOut({ callbackUrl: '/login' })
            }}
          >
            <LogOut className="mr-3 size-4" /> Logout
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DrawerSection({
  group,
  pathnameActive,
  onClickItem,
}: {
  group: NavGroup
  pathnameActive: (href: string) => boolean
  onClickItem: () => void
}) {
  return (
    <div className="mb-2">
      <p className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {group.label}
      </p>
      <nav className="px-3">
        {group.items.map((it) => (
          <DrawerLink
            key={it.href}
            href={it.href}
            label={it.label}
            Icon={it.icon}
            active={pathnameActive(it.href)}
            onClick={onClickItem}
          />
        ))}
      </nav>
    </div>
  )
}

function DrawerLink({
  href,
  label,
  Icon,
  active,
  onClick,
}: {
  href: string
  label: string
  Icon: NavGroup['items'][number]['icon']
  active: boolean
  onClick: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
        active
          ? 'bg-primary-50 font-semibold text-primary-700'
          : 'text-warm-700 hover:bg-warm-100',
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0',
          active ? 'text-primary-600' : 'text-warm-500',
        )}
      />
      <span className="flex-1">{label}</span>
      {active && <ChevronRight className="size-3 text-primary-500" />}
    </Link>
  )
}
