// POST /api/integrations/pixels/[id]/test
// Kirim event PageView test ke platform sesuai integrasi. Hasil di-log ke
// PixelEventLog supaya user bisa lihat di /integrations/pixels/logs nanti.
//
// Phase 1: Meta full (CAPI). Google Ads & TikTok stub — return "akan tersedia"
// supaya user paham, tapi nanti di Phase 3 implementasi penuh.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk } from '@/lib/api'
import { decrypt } from '@/lib/crypto'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import { sendMetaEvent } from '@/lib/pixel-senders/meta'
import { prisma } from '@/lib/prisma'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    ;({ session } = await requireOrderSystemAccess())
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params

  const pixel = await prisma.pixelIntegration.findFirst({
    where: { id, userId: session.user.id },
  })
  if (!pixel) return jsonError('Integrasi tidak ditemukan', 404)
  if (!pixel.serverSideEnabled || !pixel.accessToken) {
    return jsonError(
      'Server-side belum aktif atau access token belum di-set. Test event butuh CAPI.',
      400,
    )
  }

  const eventId = `Test_${pixel.id}_${Date.now()}`
  const eventTime = Math.floor(Date.now() / 1000)

  let succeeded = false
  let responseStatus = 0
  let responseBody = ''
  let errorMessage: string | null = null

  try {
    const accessToken = decrypt(pixel.accessToken)

    if (pixel.platform === 'META') {
      const result = await sendMetaEvent({
        pixelId: pixel.pixelId,
        accessToken,
        testEventCode: pixel.testEventCode,
        eventName: 'PageView',
        eventId,
        eventTime,
        userData: {},
        customData: {},
        sourceUrl: 'https://hulao.id/test-event',
      })
      succeeded = result.succeeded
      responseStatus = result.status
      responseBody = result.body
    } else {
      // Google Ads & TikTok — Phase 3.
      errorMessage = `Test event untuk ${pixel.platform} belum tersedia di Phase 1. Setup Browser Pixel dulu, server-side test menyusul.`
    }
  } catch (err) {
    errorMessage = String(err)
  }

  // Log event regardless (sukses atau gagal) untuk audit trail.
  await prisma.pixelEventLog.create({
    data: {
      userId: session.user.id,
      pixelId: pixel.id,
      platform: pixel.platform,
      eventName: 'PageView',
      eventId,
      source: 'SERVER',
      payload: { testEvent: true, testEventCode: pixel.testEventCode },
      responseStatus: responseStatus || null,
      responseBody: responseBody || null,
      errorMessage,
      succeeded,
    },
  })

  if (succeeded) {
    await prisma.pixelIntegration.update({
      where: { id: pixel.id },
      data: { totalEvents: { increment: 1 }, lastEventAt: new Date() },
    })
  }

  return jsonOk({
    succeeded,
    platform: pixel.platform,
    eventId,
    responseStatus,
    responseBody: responseBody || null,
    errorMessage,
    hint: succeeded
      ? 'Cek Meta Events Manager → Test Events untuk lihat eventnya.'
      : errorMessage ?? `Status ${responseStatus} — cek detail di logs.`,
  })
}
