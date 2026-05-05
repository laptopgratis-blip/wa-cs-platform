'use client'

// Sidebar khusus admin panel — light theme.
// Background putih dengan logo merah biar konteks admin jelas dibedakan.
//
// Menu dibatasi sesuai role:
// - FINANCE hanya melihat menu Finance.
// - ADMIN melihat semua menu (termasuk Bank Accounts & Finance).
import {
  ArrowLeft,
  BarChart3,
  Box,
  Building2,
  Calculator,
  Cpu,
  DollarSign,
  Globe,
  Key,
  LineChart,
  Settings,
  Shield,
  Sliders,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { AlertsBell } from '@/components/admin/AlertsBell'
import { cn } from '@/lib/utils'

type Role = 'USER' | 'ADMIN' | 'FINANCE'

interface MenuItem {
  href: string
  label: string
  icon: typeof BarChart3
  // Role yang boleh melihat menu ini.
  roles: Role[]
}

const menu: MenuItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: BarChart3, roles: ['ADMIN'] },
  { href: '/admin/models', label: 'AI Models', icon: Cpu, roles: ['ADMIN'] },
  { href: '/admin/ai-pricing', label: 'Pricing Database', icon: DollarSign, roles: ['ADMIN'] },
  { href: '/admin/api-keys', label: 'API Keys', icon: Key, roles: ['ADMIN'] },
  { href: '/admin/soul-settings', label: 'Soul Settings', icon: Sparkles, roles: ['ADMIN'] },
  { href: '/admin/packages', label: 'Token Packages', icon: Box, roles: ['ADMIN'] },
  { href: '/admin/lp-packages', label: 'Paket LP', icon: Globe, roles: ['ADMIN'] },
  { href: '/admin/pricing-calculator', label: 'Pricing Calculator', icon: Calculator, roles: ['ADMIN'] },
  { href: '/admin/pricing-settings', label: 'Pricing Settings', icon: Sliders, roles: ['ADMIN'] },
  { href: '/admin/profitability', label: 'Profitability', icon: LineChart, roles: ['ADMIN'] },
  { href: '/admin/bank-accounts', label: 'Rekening Bank', icon: Building2, roles: ['ADMIN'] },
  { href: '/admin/finance', label: 'Finance', icon: Wallet, roles: ['ADMIN', 'FINANCE'] },
  { href: '/admin/lp-upgrades', label: 'Upgrade LP', icon: TrendingUp, roles: ['ADMIN', 'FINANCE'] },
  { href: '/admin/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
  { href: '/admin/settings', label: 'Pengaturan', icon: Settings, roles: ['ADMIN'] },
]

export function AdminSidebar({
  className,
  role = 'ADMIN',
}: {
  className?: string
  role?: Role
}) {
  const pathname = usePathname()
  const visible = menu.filter((m) => m.roles.includes(role))
  return (
    <aside
      className={cn(
        'flex h-full w-60 flex-col border-r border-warm-200 bg-card text-warm-700',
        className,
      )}
    >
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
        <ul className="space-y-1">
          {visible.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href + '/')
            return (
              <li key={href}>
                <Link
                  href={href}
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
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="border-t border-warm-200 px-3 py-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-warm-500 transition-colors hover:bg-warm-100 hover:text-warm-900"
        >
          <ArrowLeft className="size-3.5" />
          Kembali ke User Dashboard
        </Link>
      </div>
    </aside>
  )
}
