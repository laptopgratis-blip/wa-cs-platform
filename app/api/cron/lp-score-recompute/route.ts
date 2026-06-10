// GET /api/cron/lp-score-recompute?secret=<CRON_SECRET>
// Daily cron — recompute score untuk SEMUA LP milik POWER user yang published.
// Schedule rekomendasi: 1× sehari, jam 04:00 WIB (sehabis lp-signals-extract).
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import { computeLpScore, persistScore } from '@/lib/services/lp-score'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  // Auth terpusat di lib/cron-auth.ts — fail-closed kalau CRON_SECRET kosong
  // (dulu fail-open di sini).
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const startedAt = Date.now()
  const lps = await prisma.landingPage.findMany({
    where: {
      isPublished: true,
      user: { lpQuota: { tier: 'POWER' } },
    },
    select: { id: true },
  })

  let success = 0
  let failed = 0
  for (const lp of lps) {
    try {
      const result = await computeLpScore(lp.id)
      await persistScore(lp.id, result, 'cron')
      success++
    } catch (err) {
      failed++
      console.error(`[lp-score-recompute] LP ${lp.id} gagal:`, err)
    }
  }

  return NextResponse.json({
    success: true,
    durationMs: Date.now() - startedAt,
    processed: lps.length,
    successCount: success,
    failedCount: failed,
  })
}

export const POST = GET
