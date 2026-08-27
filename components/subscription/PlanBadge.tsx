'use client'

// Plan badge di header — tampilkan tier user (FREE/STARTER/POPULAR/POWER).
// Kalau plan akan expire <7 hari, badge berwarna kuning + tooltip warning.
// Klik → arahkan ke /billing/subscription.
import { AlertTriangle, Crown, Sparkles, Zap } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { TONES, type Tone } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface BadgeData {
  tier: string
  daysRemaining: number | null
  isLifetime: boolean
}

// Tier berbayar = tone brand (orange); FREE = neutral. Warna dari registry
// ui-tones, bukan palet ad-hoc per tier.
const TIER_CFG: Record<string, { icon: typeof Sparkles; tone: Tone }> = {
  FREE: { icon: Sparkles, tone: 'neutral' },
  STARTER: { icon: Zap, tone: 'brand' },
  POPULAR: { icon: Crown, tone: 'brand' },
  POWER: { icon: Crown, tone: 'brand' },
}

export function PlanBadge() {
  const [data, setData] = useState<BadgeData | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/subscription/current')
        const json = (await res.json()) as {
          success: boolean
          data?: {
            subscription: {
              isLifetime: boolean
              daysRemaining: number
              plan: { tier: string }
            } | null
          }
        }
        if (!json.success) return
        if (!json.data?.subscription) {
          setData({ tier: 'FREE', daysRemaining: null, isLifetime: false })
          return
        }
        setData({
          tier: json.data.subscription.plan.tier,
          daysRemaining: json.data.subscription.daysRemaining,
          isLifetime: json.data.subscription.isLifetime,
        })
      } catch {
        /* swallow */
      }
    })()
  }, [])

  if (!data) return null
  const cfg = TIER_CFG[data.tier] ?? TIER_CFG.FREE!
  const Icon = cfg.icon
  const expiringSoon =
    data.daysRemaining !== null &&
    data.daysRemaining > 0 &&
    data.daysRemaining <= 7 &&
    !data.isLifetime
  const tooltipMsg = expiringSoon
    ? `Plan ${data.tier} akan berakhir dalam ${data.daysRemaining} hari. Klik untuk perpanjang.`
    : data.isLifetime
      ? `Plan ${data.tier} (lifetime)`
      : data.daysRemaining !== null
        ? `Plan ${data.tier} aktif (${data.daysRemaining} hari tersisa)`
        : `Plan ${data.tier}`

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href="/billing/subscription"
            className={cn(
              'flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80',
              expiringSoon
                ? cn(TONES.warning.bg, TONES.warning.text, 'ring-2 ring-amber-300')
                : cn(TONES[cfg.tone].bg, TONES[cfg.tone].text),
            )}
          >
            <Icon className="size-3" />
            {data.tier}
            {expiringSoon && <AlertTriangle className="size-3" />}
          </Link>
        </TooltipTrigger>
        <TooltipContent>{tooltipMsg}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
