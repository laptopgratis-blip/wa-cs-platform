// Pixel-fire orchestrator — fire server-side pixel event untuk satu order.
// Loop semua pixel yang user enable di OrderForm, decrypt access token,
// dispatch ke sender per platform, log ke PixelEventLog.
//
// Best-effort & idempotent:
//   - Skip kalau eventId+pixelId sudah pernah succeeded (dedup)
//   - Skip kalau pixel tidak active / belum server-side
//   - Tidak throw — gagal fire JANGAN gagalkan caller
//
// Trigger points:
//   - submit endpoint (COD → Purchase, TRANSFER → Lead)
//   - PATCH /api/orders/[id] saat paymentStatus = PAID (Purchase untuk TRANSFER)
//   - cron retry untuk failed events (Phase 4)
import type { Prisma } from '@prisma/client'

import { decrypt } from '@/lib/crypto'
import { sendGoogleAdsEvent } from '@/lib/pixel-senders/google-ads'
import { sendMetaEvent } from '@/lib/pixel-senders/meta'
import { sendTikTokEvent } from '@/lib/pixel-senders/tiktok'
import { prisma } from '@/lib/prisma'

export type PixelEventName =
  | 'Purchase'
  | 'Lead'
  | 'AddPaymentInfo'
  | 'InitiateCheckout'
  | 'ViewContent'
  | 'AddToCart'

// Trigger origin untuk Purchase event — supaya pixel-fire bisa filter pixel
// yang opt-in di trigger spesifik (lihat PixelIntegration.triggerOn*). Kalau
// undefined, semua pixel aktif di-fire (legacy behavior untuk eventName lain).
export type PurchaseTrigger =
  | 'BUYER_PROOF_UPLOAD'
  | 'ADMIN_PROOF_UPLOAD'
  | 'ADMIN_MARK_PAID'

interface FireParams {
  orderId: string
  eventName: PixelEventName
  source?: 'BROWSER' | 'SERVER'
  // Hanya relevan saat eventName === 'Purchase'. Kalau diisi, pixel difilter
  // dengan flag triggerOn* yang sesuai.
  trigger?: PurchaseTrigger
}

// Stable eventId per (eventName, orderId) — match dengan browser side
// kalau browser fire event yg sama. Untuk Lead/Purchase yg server-only,
// browser tidak fire dengan format ini jadi tidak bentrok.
function buildEventId(eventName: string, orderId: string): string {
  return `${eventName}_${orderId}`
}

function buildCustomData(items: Prisma.JsonValue, totalRp: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr = Array.isArray(items) ? (items as any[]) : []
  return {
    currency: 'IDR',
    value: totalRp,
    content_type: 'product',
    content_ids: arr.map((i) => i.productId).filter(Boolean),
    contents: arr.map((i) => ({
      id: i.productId,
      quantity: i.qty,
      item_price: i.price,
    })),
    num_items: arr.reduce((sum, i) => sum + (i.qty ?? 0), 0),
  }
}

export async function firePixelEventForOrder(
  params: FireParams,
): Promise<{ fired: number; succeeded: number; skipped: number }> {
  const stats = { fired: 0, succeeded: 0, skipped: 0 }

  try {
    const order = await prisma.userOrder.findUnique({
      where: { id: params.orderId },
      select: {
        id: true,
        userId: true,
        orderFormId: true,
        items: true,
        totalRp: true,
        customerEmail: true,
        customerPhone: true,
        fbclid: true,
        gclid: true,
        ttclid: true,
        invoiceNumber: true,
      },
    })
    if (!order || !order.orderFormId) return stats

    const form = await prisma.orderForm.findUnique({
      where: { id: order.orderFormId },
      select: { enabledPixelIds: true },
    })
    if (!form || form.enabledPixelIds.length === 0) return stats

    // Filter trigger flag — hanya untuk Purchase + trigger spesified. Pixel
     // yang opt-out di trigger ini di-skip total (tidak masuk loop & tidak
     // create log "skipped"). Eventless query lebih efisien.
    const triggerFilter =
      params.eventName === 'Purchase' && params.trigger
        ? params.trigger === 'BUYER_PROOF_UPLOAD'
          ? { triggerOnBuyerProofUpload: true }
          : params.trigger === 'ADMIN_PROOF_UPLOAD'
            ? { triggerOnAdminProofUpload: true }
            : params.trigger === 'ADMIN_MARK_PAID'
              ? { triggerOnAdminMarkPaid: true }
              : {}
        : {}

    const pixels = await prisma.pixelIntegration.findMany({
      where: {
        id: { in: form.enabledPixelIds },
        userId: order.userId,
        isActive: true,
        serverSideEnabled: true,
        ...triggerFilter,
      },
    })

    const eventId = buildEventId(params.eventName, order.id)
    const customData = buildCustomData(order.items, order.totalRp)
    const sourceUrl = order.invoiceNumber
      ? `https://hulao.id/invoice/${order.invoiceNumber}`
      : null

    for (const pixel of pixels) {
      // Dedup — kalau ada record succeeded untuk eventId+pixelId yang sama,
      // skip. Mencegah double-fire kalau caller invoke 2x.
      const already = await prisma.pixelEventLog.findFirst({
        where: { eventId, pixelId: pixel.id, succeeded: true },
        select: { id: true },
      })
      if (already) {
        stats.skipped++
        continue
      }

      if (!pixel.accessToken) {
        stats.skipped++
        continue
      }

      stats.fired++
      let succeeded = false
      let responseStatus: number | null = null
      let responseBody: string | null = null
      let errorMessage: string | null = null

      try {
        const accessToken = decrypt(pixel.accessToken)

        if (pixel.platform === 'META') {
          const result = await sendMetaEvent({
            pixelId: pixel.pixelId,
            accessToken,
            testEventCode: pixel.isTestMode ? pixel.testEventCode : undefined,
            eventName: params.eventName,
            eventId,
            userData: {
              email: order.customerEmail,
              phone: order.customerPhone,
              fbclid: order.fbclid,
            },
            customData,
            sourceUrl,
          })
          succeeded = result.succeeded
          responseStatus = result.status
          responseBody = result.body
        } else if (pixel.platform === 'TIKTOK') {
          // TikTok pakai naming snake_case berbeda dari Meta — transform dulu.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const items = Array.isArray(order.items) ? (order.items as any[]) : []
          const tiktokProps = {
            currency: 'IDR',
            value: order.totalRp,
            contents: items.map((i) => ({
              content_id: String(i.productId ?? ''),
              quantity: i.qty ?? 1,
              price: i.price ?? 0,
            })),
          }
          const result = await sendTikTokEvent({
            pixelId: pixel.pixelId,
            accessToken,
            eventName: params.eventName,
            eventId,
            userData: {
              email: order.customerEmail,
              phone: order.customerPhone,
              ttclid: order.ttclid,
            },
            properties: tiktokProps,
            sourceUrl,
            isTestMode: pixel.isTestMode,
          })
          succeeded = result.succeeded
          responseStatus = result.status
          responseBody = result.body
        } else if (
          pixel.platform === 'GA4' ||
          pixel.platform === 'GOOGLE_ADS'
        ) {
          // Map conversion label dari pixel ke event spesifik.
          const conversionLabel =
            params.eventName === 'Lead'
              ? pixel.conversionLabelLead
              : params.eventName === 'Purchase'
                ? pixel.conversionLabelPurchase
                : params.eventName === 'InitiateCheckout'
                  ? pixel.conversionLabelInitiateCheckout
                  : null
          const result = await sendGoogleAdsEvent({
            measurementId: pixel.pixelId,
            apiSecret: accessToken,
            conversionLabel,
            eventName: params.eventName,
            eventId,
            userData: {
              email: order.customerEmail,
              phone: order.customerPhone,
              gclid: order.gclid,
            },
            value: order.totalRp,
            currency: 'IDR',
          })
          succeeded = result.succeeded
          responseStatus = result.status
          responseBody = result.body
        } else {
          errorMessage = `Platform ${pixel.platform} belum didukung`
        }
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err)
      }

      // Log unconditionally (sukses & gagal) untuk audit.
      await prisma.pixelEventLog
        .create({
          data: {
            userId: order.userId,
            pixelId: pixel.id,
            orderId: order.id,
            platform: pixel.platform,
            eventName: params.eventName,
            eventId,
            source: params.source ?? 'SERVER',
            payload: customData as Prisma.InputJsonValue,
            responseStatus,
            responseBody: responseBody?.slice(0, 4000) ?? null,
            errorMessage,
            succeeded,
          },
        })
        .catch((err) =>
          console.error('[pixel-fire] log create failed:', err),
        )

      if (succeeded) {
        stats.succeeded++
        await prisma.pixelIntegration
          .update({
            where: { id: pixel.id },
            data: {
              totalEvents: { increment: 1 },
              lastEventAt: new Date(),
            },
          })
          .catch(() => {})
      }
    }

    // Stamp UserOrder kalau ada yang sukses — sesuai eventName.
    if (stats.succeeded > 0) {
      const stampField =
        params.eventName === 'Lead'
          ? { pixelLeadFiredAt: new Date() }
          : params.eventName === 'Purchase'
            ? { pixelPurchaseFiredAt: new Date() }
            : null
      if (stampField) {
        await prisma.userOrder
          .update({ where: { id: order.id }, data: stampField })
          .catch(() => {})
      }
    }
  } catch (err) {
    console.error('[firePixelEventForOrder] gagal:', err)
  }

  return stats
}
