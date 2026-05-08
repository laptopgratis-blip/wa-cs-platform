// POST /api/integrations/bank-mutation/scrape — trigger manual scrape user.
// Forward ke bank-scraper service dengan integrationId milik user yang login.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { prisma } from '@/lib/prisma'
import { triggerScrape } from '@/lib/services/bank-scraper'

// Rate limit sederhana — minimal 30 detik antara manual trigger.
const MANUAL_COOLDOWN_MS = 30_000

export async function POST() {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }

  try {
    const integration = await prisma.bankMutationIntegration.findUnique({
      where: { userId: session.user.id },
    })
    if (!integration) {
      return jsonError('Integration belum di-setup', 404)
    }
    if (!integration.isBetaConsented) {
      return jsonError('Disclaimer beta belum disetujui', 400)
    }
    if (integration.isAdminBlocked) {
      return jsonError(
        'Integration di-block oleh admin. Hubungi support.',
        403,
      )
    }
    if (
      integration.lastScrapedAt &&
      Date.now() - integration.lastScrapedAt.getTime() < MANUAL_COOLDOWN_MS
    ) {
      const wait = Math.ceil(
        (MANUAL_COOLDOWN_MS -
          (Date.now() - integration.lastScrapedAt.getTime())) /
          1000,
      )
      return jsonError(`Tunggu ${wait} detik sebelum sync lagi`, 429)
    }

    const result = await triggerScrape(integration.id, 'MANUAL')
    if (!result.ok) {
      return jsonError(
        `Gagal trigger scraper: ${result.error || result.status}`,
        502,
      )
    }
    return jsonOk({ scheduled: true })
  } catch (err) {
    console.error('[POST /api/integrations/bank-mutation/scrape]', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
