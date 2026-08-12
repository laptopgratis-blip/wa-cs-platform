// Router event webhook Meta: pecah entry[].changes[] lalu arahkan per
// phone_number_id (value.metadata) ke handler pesan masuk / status.
// Dipanggil dari app/api/webhooks/meta/route.ts SETELAH signature valid.

import { handleInboundMessages } from './inbound'
import { handleStatuses } from './statuses'
import type { WabaChangeValue, WabaWebhookPayload } from './types'

/**
 * Proses satu payload webhook. Error per-change diisolasi — satu change
 * gagal tidak menghentikan change lain (Meta menggabungkan banyak event
 * dalam satu request).
 */
export async function processMetaWebhook(payload: WabaWebhookPayload): Promise<void> {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== 'messages' || !change.value) continue
      try {
        await processChangeValue(change.value)
      } catch (err) {
        console.error('[waba/webhook-router] change gagal diproses:', err)
      }
    }
  }
}

async function processChangeValue(value: WabaChangeValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id
  if (!phoneNumberId) return

  if (value.messages && value.messages.length > 0) {
    await handleInboundMessages(phoneNumberId, value)
  }

  if (value.statuses && value.statuses.length > 0) {
    await handleStatuses(phoneNumberId, value)
  }
}
