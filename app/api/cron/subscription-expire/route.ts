// POST /api/cron/subscription-expire — daily 00:30 WIB.
// Set status EXPIRED untuk subscription yg endDate sudah lewat,
// auto-downgrade user ke FREE (lihat lib/services/subscription.expireSubscription).
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { prisma } from '@/lib/prisma'
import { expireSubscription } from '@/lib/services/subscription'

export async function POST(req: Request) {
  // Auth terpusat di lib/cron-auth.ts (Bearer / x-cron-secret / ?secret=).
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const now = new Date()
  const expired = await prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      isLifetime: false,
      endDate: { lt: now },
    },
    select: { id: true },
  })

  let count = 0
  const errors: string[] = []
  for (const s of expired) {
    try {
      await expireSubscription(s.id)
      count++
    } catch (err) {
      errors.push(`${s.id}: ${(err as Error).message}`)
      console.error('[cron expire] gagal expire', s.id, err)
    }
  }

  return NextResponse.json({
    success: true,
    data: { expired: count, errors },
  })
}
