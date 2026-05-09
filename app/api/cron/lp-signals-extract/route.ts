// GET /api/cron/lp-signals-extract?secret=<CRON_SECRET>
// Daily cron — recompute signals untuk SEMUA LP milik POWER user.
// Schedule rekomendasi: 1× sehari, jam 03:00 WIB (jam sepi).
//
// Kalau gagal di tengah, sisanya di-skip dengan log error — bukan throw.
// Cron job lain tetap jalan (cron-job.org / similar service).
import { NextResponse } from 'next/server'

import {
  extractSignalsForLp,
  persistSignals,
} from '@/lib/services/lp-chat-signals'
import { prisma } from '@/lib/prisma'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function authOk(url: URL): boolean {
  if (!CRON_SECRET) {
    console.warn('[lp-signals-extract] CRON_SECRET kosong — endpoint terbuka.')
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
  // Hanya proses LP milik user POWER plan — chat signals fitur eksklusif POWER.
  const lps = await prisma.landingPage.findMany({
    where: {
      isPublished: true,
      user: { lpQuota: { tier: 'POWER' } },
    },
    select: { id: true },
  })

  let success = 0
  let failed = 0
  const errors: Array<{ lpId: string; error: string }> = []

  for (const lp of lps) {
    try {
      // Compute 30d window (default — paling representative).
      const result = await extractSignalsForLp(lp.id, 30)
      await persistSignals(result, 30)
      success++
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      errors.push({ lpId: lp.id, error: msg })
      console.error(`[lp-signals-extract] LP ${lp.id} gagal:`, err)
    }
  }

  return NextResponse.json({
    success: true,
    durationMs: Date.now() - startedAt,
    processed: lps.length,
    successCount: success,
    failedCount: failed,
    errors: errors.slice(0, 20),
  })
}

export const POST = GET // accept POST juga supaya cron service yg pakai POST tetap jalan
