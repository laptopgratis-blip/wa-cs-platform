// GET /api/cron/lp-score-recompute?secret=<CRON_SECRET>
// Daily cron — recompute score untuk SEMUA LP milik POWER user yang published.
// Schedule rekomendasi: 1× sehari, jam 04:00 WIB (sehabis lp-signals-extract).
import { NextResponse } from 'next/server'

import { computeLpScore, persistScore } from '@/lib/services/lp-score'
import { prisma } from '@/lib/prisma'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function authOk(url: URL): boolean {
  if (!CRON_SECRET) {
    console.warn('[lp-score-recompute] CRON_SECRET kosong — endpoint terbuka.')
    return true
  }
  return url.searchParams.get('secret') === CRON_SECRET
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (!authOk(url)) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 })
  }

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
