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
  req: Request,
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

  // Real UA + IP dari request supaya Meta bisa match minimal 1 user_data field.
  // Tanpa user_data, Meta reject 400 (subcode 2804050: customer info insufficient).
  const userAgent =
    req.headers.get('user-agent') ?? 'Mozilla/5.0 (Hulao TestEvent)'
  const fwdFor = req.headers.get('x-forwarded-for')
  const clientIp =
    fwdFor?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null

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
        // Dummy hashed email + phone supaya Meta dapat user_data minimal.
        // Email/phone akan di-hash SHA256 oleh sender. UA + IP dari request
        // asli supaya match score-nya valid (bukan dummy yg invariant).
        userData: {
          email: 'test@hulao.id',
          phone: '6281234567890',
          clientUserAgent: userAgent,
          clientIpAddress: clientIp,
        },
        customData: {},
        sourceUrl: 'https://hulao.id/integrations/pixels',
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

  // Parse Meta error response supaya hint user descriptive — bukan "Status 400".
  const isTestMode = pixel.isTestMode
  const testEventCode = pixel.testEventCode
  const buildHint = (): string => {
    if (succeeded) {
      return isTestMode && testEventCode
        ? 'Test event terkirim. Cek Meta Events Manager → Test Events.'
        : 'Test event terkirim. Cek Meta Events Manager → Overview (1-2 menit).'
    }
    if (errorMessage) return errorMessage
    try {
      const parsed = JSON.parse(responseBody) as {
        error?: {
          message?: string
          code?: number
          error_subcode?: number
          error_user_title?: string
          error_user_msg?: string
        }
      }
      const e = parsed.error
      if (e?.error_user_msg) {
        const title = e.error_user_title ?? 'Meta menolak event'
        // Truncate supaya muat di toast — full message tetap di logs.
        const msg = e.error_user_msg.length > 240
          ? e.error_user_msg.slice(0, 240) + '…'
          : e.error_user_msg
        return `${title}. ${msg}`
      }
      if (e?.message) {
        return `Meta: ${e.message}${e.code ? ` (code ${e.code})` : ''}`
      }
    } catch {
      // responseBody bukan JSON — fall through.
    }
    return `Status ${responseStatus || 'unknown'} — cek detail di logs.`
  }
  const hint = buildHint()

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
    hint,
  })
}
