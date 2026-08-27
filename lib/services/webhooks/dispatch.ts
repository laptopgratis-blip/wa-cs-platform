// Titik masuk emisi event webhook — dipanggil dari jalur pesan/kontak.
//
// Kontrak untuk pemanggil: SATU baris `emitWebhookEvent(...)` yang
// fire-and-forget dan TIDAK PERNAH throw — jalur bisnis (simpan pesan,
// webhook Meta) tidak boleh gagal atau melambat gara-gara webhook seller.
// Percobaan pertama dikirim langsung; sisanya diambil cron webhook-retry.
import { randomUUID } from 'crypto'
import { prisma } from '@/lib/prisma'
import type { WebhookEventType } from '@/lib/validations/webhook-endpoint'
import { deliverOne } from './deliver'

export interface WebhookEnvelope {
  id: string
  type: WebhookEventType | 'ping'
  createdAt: string
  data: Record<string, unknown>
}

export function buildEnvelope(
  type: WebhookEnvelope['type'],
  data: Record<string, unknown>,
): WebhookEnvelope {
  return {
    id: `evt_${randomUUID()}`,
    type,
    createdAt: new Date().toISOString(),
    data,
  }
}

/**
 * Antrekan event ke semua endpoint aktif milik user yang berlangganan
 * `type`, lalu coba kirim langsung di latar. Fire-and-forget, never-throw.
 */
export function emitWebhookEvent(input: {
  userId: string
  type: WebhookEventType
  data: Record<string, unknown>
}): void {
  void (async () => {
    try {
      const endpoints = await prisma.webhookEndpoint.findMany({
        where: {
          userId: input.userId,
          isActive: true,
          events: { has: input.type },
        },
        select: { id: true },
      })
      if (endpoints.length === 0) return

      const envelope = buildEnvelope(input.type, input.data)
      const rows = await prisma.$transaction(
        endpoints.map((ep) =>
          prisma.webhookDelivery.create({
            data: {
              endpointId: ep.id,
              eventType: input.type,
              payload: envelope as unknown as object,
            },
            select: { id: true },
          }),
        ),
      )

      // Percobaan pertama langsung, PARALEL: satu endpoint yang lambat/timeout
      // tidak boleh menahan pengiriman ke endpoint lain (maks 5 per user).
      await Promise.allSettled(rows.map((row) => deliverOne(row.id)))
    } catch (err) {
      console.error('[webhooks/dispatch] emit gagal:', err)
    }
  })()
}
