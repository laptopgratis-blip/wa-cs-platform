'use client'

// Wrapper untuk komponen mobile nav: bottom bar + drawer dengan state
// terbuka/tertutup yang shared. Pakai 1 instance per layout supaya state
// drawer konsisten antara trigger di topbar & bottom bar.
import { useState } from 'react'

import { BottomNav } from '@/components/layout/BottomNav'
import { MobileDrawer } from '@/components/layout/MobileDrawer'
import type { Role } from '@/lib/navigation'

interface MobileNavProps {
  user: {
    name?: string | null
    email?: string | null
    image?: string | null
    role: Role
  }
  tokenBalance?: number | null
}

export function MobileNav({ user, tokenBalance }: MobileNavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  return (
    <>
      <BottomNav onOpenDrawer={() => setDrawerOpen(true)} />
      <MobileDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        user={user}
        tokenBalance={tokenBalance}
      />
    </>
  )
}
