'use client'

// Sidebar utama dashboard — light theme.
// Menu di-grup berdasarkan kategori (CHAT & CS, ORDER SYSTEM, LANDING PAGE,
// INTEGRASI, LAPORAN, AKUN). Section header tipis di atas tiap grup. Group
// bisa di-collapse via chevron — state persist di localStorage. Sumber data
// dari lib/navigation.ts (USER_NAV_HOME + USER_NAV_GROUPS) supaya konsisten
// dengan Drawer mobile.
import { ChevronDown, ChevronRight, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { formatNumber } from '@/lib/format'
import {
  USER_NAV_GROUPS,
  USER_NAV_HOME,
  filterGroupsByOrderSystem,
} from '@/lib/navigation'
import { cn } from '@/lib/utils'

const COLLAPSED_GROUPS_KEY = 'hulao.sidebar.collapsed'

interface SidebarProps {
  className?: string
  onNavigate?: () => void
  /** Saldo token user untuk card di bawah. Null = sembunyi (mis. admin). */
  tokenBalance?: number | null
  /** Akses ke Order System (paket POWER). Default false. */
  hasOrderSystemAccess?: boolean
}

export function Sidebar({
  className,
  onNavigate,
  tokenBalance,
  hasOrderSystemAccess = false,
}: SidebarProps) {
  const pathname = usePathname()
  const groups = filterGroupsByOrderSystem(
    USER_NAV_GROUPS,
    hasOrderSystemAccess,
  )

  // Collapsed state per group label, persist ke localStorage. Default semua
  // expanded. Group yang punya item active otomatis di-force expand supaya
  // user tidak bingung kenapa link aktif tidak terlihat.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(COLLAPSED_GROUPS_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) setCollapsed(new Set(arr))
      }
    } catch {
      /* abaikan corrupt state */
    }
  }, [])

  function toggleGroup(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      try {
        window.localStorage.setItem(
          COLLAPSED_GROUPS_KEY,
          JSON.stringify([...next]),
        )
      } catch {
        /* abaikan */
      }
      return next
    })
  }

  function isActive(href: string): boolean {
    if (!pathname) return false
    return pathname === href || pathname.startsWith(href + '/')
  }

  function groupHasActive(items: { href: string }[]): boolean {
    return items.some((it) => isActive(it.href))
  }

  return (
    <aside
      className={cn(
        'flex h-full w-60 flex-col border-r border-warm-200 bg-card text-warm-700',
        className,
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-warm-200 px-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary-500 text-white shadow-orange">
          <MessageCircle className="size-4" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-base font-bold text-warm-900">Hulao</p>
          <p className="text-[11px] font-medium text-primary-500">Dashboard</p>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {/* Home (Dashboard) */}
        <ul className="space-y-1">
          <li>
            <SidebarLink
              href={USER_NAV_HOME.href}
              label={USER_NAV_HOME.label}
              Icon={USER_NAV_HOME.icon}
              active={isActive(USER_NAV_HOME.href)}
              onClick={onNavigate}
            />
          </li>
        </ul>

        {/* Grup — collapsible via chevron. Force-expand kalau ada item active. */}
        {groups.map((group) => {
          const hasActive = groupHasActive(group.items)
          const isCollapsed = collapsed.has(group.label) && !hasActive
          return (
            <div key={group.label} className="mt-4">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="group flex w-full items-center justify-between rounded px-3 pb-1 text-left text-[11px] font-semibold uppercase tracking-wider text-warm-400 transition-colors hover:text-warm-600"
                title={isCollapsed ? 'Klik untuk buka' : 'Klik untuk tutup'}
              >
                <span>{group.label}</span>
                {isCollapsed ? (
                  <ChevronRight className="size-3 opacity-60 group-hover:opacity-100" />
                ) : (
                  <ChevronDown className="size-3 opacity-60 group-hover:opacity-100" />
                )}
              </button>
              {!isCollapsed && (
                <ul className="space-y-1">
                  {group.items.map((it) => (
                    <li key={it.href}>
                      <SidebarLink
                        href={it.href}
                        label={it.label}
                        Icon={it.icon}
                        active={isActive(it.href)}
                        onClick={onNavigate}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </nav>

      {/* Saldo Token — warna & label adaptif sesuai level saldo */}
      {typeof tokenBalance === 'number' && (
        <div className="px-3 pb-3">
          {(() => {
            const isEmpty = tokenBalance === 0
            const isLow = tokenBalance > 0 && tokenBalance < 1000
            const wrapClass = isEmpty
              ? 'border-destructive/40 bg-destructive/10 hover:bg-destructive/15'
              : isLow
                ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                : 'border-primary-200 bg-primary-50 hover:bg-primary-100'
            const labelClass = isEmpty
              ? 'text-destructive'
              : isLow
                ? 'text-amber-800'
                : 'text-primary-700'
            const valueClass = isEmpty
              ? 'text-destructive'
              : isLow
                ? 'text-amber-700'
                : 'text-primary-600'
            const helperClass = isEmpty
              ? 'text-destructive/80'
              : isLow
                ? 'text-amber-700/80'
                : 'text-primary-700/70'
            const helperText = isEmpty
              ? 'Habis — top up sekarang!'
              : isLow
                ? 'Hampir habis, top up dulu'
                : 'Tap untuk top-up'
            return (
              <Link
                href="/billing"
                onClick={onNavigate}
                className={cn(
                  'block rounded-lg border p-3 transition-colors',
                  wrapClass,
                )}
              >
                <p
                  className={cn(
                    'text-[11px] font-medium uppercase tracking-wider',
                    labelClass,
                  )}
                >
                  Saldo Token
                </p>
                <p
                  className={cn(
                    'mt-1 font-display text-xl font-bold tabular-nums',
                    valueClass,
                  )}
                >
                  {formatNumber(tokenBalance)}
                </p>
                <p className={cn('mt-0.5 text-[11px]', helperClass)}>
                  {helperText}
                </p>
              </Link>
            )
          })()}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-warm-200 px-4 py-3">
        <p className="text-[11px] text-warm-400">v0.1.0 — beta</p>
      </div>
    </aside>
  )
}

function SidebarLink({
  href,
  label,
  Icon,
  active,
  onClick,
}: {
  href: string
  label: string
  Icon: (typeof USER_NAV_GROUPS)[number]['items'][number]['icon']
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
