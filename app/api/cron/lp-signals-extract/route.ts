// GET /api/cron/lp-signals-extract?secret=<CRON_SECRET>
// Daily cron — recompute signals untuk SEMUA LP milik POWER user.
// Schedule rekomendasi: 1× sehari, jam 03:00 WIB (jam sepi).
//
// Kalau gagal di tengah, sisanya di-skip dengan log error — bukan throw.
// Cron job lain tetap jalan (cron-job.org / similar service).
import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'
import {
  extractSignalsForLp,
  persistSignals,
} from '@/lib/services/lp-chat-signals'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  // Auth terpusat di lib/cron-auth.ts — fail-closed kalau CRON_SECRET kosong
  // (dulu fail-open di sini).
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

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
