'use client'

// Sidebar admin panel — light theme, accent merah supaya admin context jelas.
// Menu di-grup berdasarkan kategori (MANAJEMEN, AI & SOUL, ANALISIS, SISTEM)
// dari lib/navigation.ts. Filter per role: FINANCE hanya melihat item
// yang `roles` mereka.
import { ArrowLeft, Shield } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { AlertsBell } from '@/components/admin/AlertsBell'
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_HOME,
  filterGroupsByRole,
  type Role,
} from '@/lib/navigation'
import { cn } from '@/lib/utils'

interface AdminSidebarProps {
  className?: string
  role?: Role
  onNavigate?: () => void
}

export function AdminSidebar({
  className,
  role = 'ADMIN',
  onNavigate,
}: AdminSidebarProps) {
  const pathname = usePathname()
  const groups = filterGroupsByRole(ADMIN_NAV_GROUPS, role)

  function isActive(href: string): boolean {
    if (!pathname) return false
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <aside
      className={cn(
        'flex h-full w-60 flex-col border-r border-warm-200 bg-card text-warm-700',
        className,
      )}
    >
      {/* Header */}
      <div className="flex h-16 items-center gap-3 border-b border-warm-200 px-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-red-100 text-red-600">
          <Shield className="size-4" />
        </div>
        <div className="flex-1 leading-tight">
          <p className="font-display text-base font-bold text-warm-900">Admin</p>
          <p className="text-[11px] font-medium text-red-600">Hulao</p>
        </div>
        {role === 'ADMIN' && <AlertsBell />}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {/* Home (Admin Dashboard) — selalu tampil untuk role admin/finance */}
        <ul className="space-y-1">
          <li>
            <AdminLink
              href={ADMIN_NAV_HOME.href}
              label={ADMIN_NAV_HOME.label}
              Icon={ADMIN_NAV_HOME.icon}
              active={isActive(ADMIN_NAV_HOME.href)}
              onClick={onNavigate}
            />
          </li>
        </ul>

        {groups.map((group) => (
          <div key={group.label} className="mt-4">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-warm-400">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map((it) => (
                <li key={it.href}>
                  <AdminLink
                    href={it.href}
                    label={it.label}
                    Icon={it.icon}
                    active={isActive(it.href)}
                    onClick={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-warm-200 px-3 py-3">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-warm-500 transition-colors hover:bg-warm-100 hover:text-warm-900"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke User Dashboard
        </Link>
      </div>
    </aside>
  )
}

function AdminLink({
  href,
  label,
  Icon,
  active,
  onClick,
}: {
  href: string
  label: string
  Icon: (typeof ADMIN_NAV_GROUPS)[number]['items'][number]['icon']
  active: boolean
  onClick?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150',
        active
          ? 'bg-primary-50 text-primary-700 font-semibold'
          : 'text-warm-600 hover:bg-warm-100 hover:text-warm-900',
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary-500"
        />
      )}
      <Icon
        className={cn(
          'size-4 shrink-0 transition-colors',
          active
            ? 'text-primary-600'
            : 'text-warm-500 group-hover:text-warm-700',
        )}
      />
      {label}
    </Link>
  )
}
