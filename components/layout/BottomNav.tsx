'use client'

// Bottom navigation bar untuk mobile (md:hidden). 5 icon: 4 link utama
// + 1 hamburger trigger drawer. Fixed di bawah, dengan safe-area-inset
// untuk iPhone notch.
import { Menu } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { BOTTOM_NAV_ITEMS } from '@/lib/navigation'
import { cn } from '@/lib/utils'

interface BottomNavProps {
  onOpenDrawer: () => void
}

export function BottomNav({ onOpenDrawer }: BottomNavProps) {
  const pathname = usePathname()

  function isActive(href: string): boolean {
    if (!pathname) return false
    return pathname === href || pathname.startsWith(href + '/')
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-warm-200 bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Bottom navigation"
    >
      <ul className="flex h-16 items-stretch">
        {BOTTOM_NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          if (!href) return null
          const active = isActive(href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  'flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors',
                  active
                    ? 'font-semibold text-primary-600'
                    : 'text-warm-500',
                )}
              >
                <Icon
                  className={cn(
                    'size-5',
                    active ? 'text-primary-600' : 'text-warm-500',
                  )}
                />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={onOpenDrawer}
            className="flex h-full w-full min-h-11 flex-col items-center justify-center gap-0.5 text-[11px] text-warm-500 transition-colors hover:text-warm-700"
            aria-label="Buka menu"
          >
            <Menu className="size-5" />
            <span>Menu</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
