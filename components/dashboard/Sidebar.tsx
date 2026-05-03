'use client'

// Sidebar utama dashboard — light theme.
// Background putih, accent orange untuk active state.
import {
  BarChart3,
  CreditCard,
  Globe,
  Home,
  Inbox,
  MessageCircle,
  Send,
  Sparkles,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { formatNumber } from '@/lib/format'

const menu = [
  { href: '/dashboard', label: 'Dashboard', icon: Home },
  { href: '/whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { href: '/soul', label: 'Soul', icon: Sparkles },
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/broadcast', label: 'Broadcast', icon: Send },
  { href: '/landing-pages', label: 'Landing Page', icon: Globe },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/billing', label: 'Billing', icon: CreditCard },
]

interface SidebarProps {
  className?: string
  onNavigate?: () => void
  /** Saldo token user untuk card di bawah. Null = sembunyi (mis. admin). */
  tokenBalance?: number | null
}

export function Sidebar({ className, onNavigate, tokenBalance }: SidebarProps) {
  const pathname = usePathname()

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
          <p className="font-display text-base font-bold text-warm-900">WA CS</p>
          <p className="text-[11px] font-medium text-primary-500">Platform</p>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {menu.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href || pathname?.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150',
                    active
                      ? 'bg-primary-50 text-primary-700 font-semibold'
                      : 'text-warm-600 hover:bg-warm-100 hover:text-warm-900',
                  )}
                >
                  {/* Left accent bar saat active */}
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
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Saldo Token */}
      {typeof tokenBalance === 'number' && (
        <div className="px-3 pb-3">
          <Link
            href="/billing"
            onClick={onNavigate}
            className="block rounded-lg border border-primary-200 bg-primary-50 p-3 transition-colors hover:bg-primary-100"
          >
            <p className="text-[11px] font-medium uppercase tracking-wider text-primary-700">
              Saldo Token
            </p>
            <p className="mt-1 font-display text-xl font-bold text-primary-600 tabular-nums">
              {formatNumber(tokenBalance)}
            </p>
            <p className="mt-0.5 text-[11px] text-primary-700/70">
              Tap untuk top-up
            </p>
          </Link>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-warm-200 px-4 py-3">
        <p className="text-[11px] text-warm-400">v0.1.0 — beta</p>
      </div>
    </aside>
  )
}
