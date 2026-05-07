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
import { cn } from '@/lib/utils'

interface BadgeData {
  tier: string
  daysRemaining: number | null
  isLifetime: boolean
}

const TIER_CFG: Record<string, { icon: typeof Sparkles; class: string }> = {
  FREE: { icon: Sparkles, class: 'bg-warm-100 text-warm-700' },
  STARTER: { icon: Zap, class: 'bg-blue-100 text-blue-700' },
  POPULAR: { icon: Crown, class: 'bg-amber-100 text-amber-700' },
  POWER: { icon: Crown, class: 'bg-purple-100 text-purple-700' },
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
                ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-300'
                : cfg.class,
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
