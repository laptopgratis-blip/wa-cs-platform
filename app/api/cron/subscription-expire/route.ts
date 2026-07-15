// POST /api/cron/subscription-expire — daily 00:30 WIB.
// Set status EXPIRED untuk subscription yg endDate sudah lewat, kuota
// di-sync ulang dari sub tersisa (lihat lib/services/subscription.
// expireSubscription). Sejak 2026-07-14 endpoint yang sama juga menyapu
// LmsSubscription (lib/services/lms/lifecycle.ts) — sengaja numpang di
// endpoint ini supaya tidak perlu daftar jadwal cron eksternal baru.
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { prisma } from '@/lib/prisma'
import { expireLmsSubscription } from '@/lib/services/lms/lifecycle'
import { expireSubscription } from '@/lib/services/subscription'

export async function POST(req: Request) {
  // Auth terpusat di lib/cron-auth.ts (Bearer / x-cron-secret / ?secret=).
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const now = new Date()
  // CANCELLED ikut disapu: cancel = akses jalan sampai endDate, setelah itu
  // WAJIB diturunkan juga (dulu hanya ACTIVE → user cancel pegang tier
  // selamanya).
  const expired = await prisma.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'CANCELLED'] },
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

  // Sweep LMS — pola sama (per item try/catch, idempotent via status flip).
  const lmsExpiredRows = await prisma.lmsSubscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'CANCELLED'] },
      endDate: { lt: now },
    },
    select: { id: true },
  })
  let lmsCount = 0
  for (const s of lmsExpiredRows) {
    try {
      await expireLmsSubscription(s.id)
      lmsCount++
    } catch (err) {
      errors.push(`lms:${s.id}: ${(err as Error).message}`)
      console.error('[cron expire] gagal expire LMS', s.id, err)
    }
  }

  return NextResponse.json({
    success: true,
    data: { expired: count, lmsExpired: lmsCount, errors },
  })
}
