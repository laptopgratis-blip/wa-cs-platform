// Router event webhook Meta: pecah entry[].changes[] lalu arahkan per
// phone_number_id (value.metadata) ke handler pesan masuk / status.
// Dipanggil dari app/api/webhooks/meta/route.ts SETELAH signature valid.

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
    // TODO(Fase 5): lib/services/waba/inbound — simpan + pipeline AI.
    console.log(
      `[waba/webhook-router] ${value.messages.length} pesan masuk untuk phone_number_id=${phoneNumberId}:`,
      value.messages.map((m) => ({ id: m.id, from: m.from, type: m.type })),
    )
  }

  if (value.statuses && value.statuses.length > 0) {
    // TODO(Fase 5): lib/services/waba/statuses — update Message.status by wamid.
    console.log(
      `[waba/webhook-router] ${value.statuses.length} status update untuk phone_number_id=${phoneNumberId}:`,
      value.statuses.map((s) => ({ id: s.id, status: s.status })),
    )
  }
}
