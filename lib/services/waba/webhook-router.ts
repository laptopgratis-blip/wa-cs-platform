// Router event webhook Meta: pecah entry[].changes[] lalu arahkan per
// phone_number_id (value.metadata) ke handler pesan masuk / status / echo.
// Dipanggil dari app/api/webhooks/meta/route.ts SETELAH signature valid.

import { handleInboundMessages } from './inbound'
import { handleAccountUpdate } from './account-update'
import { handleMessageEchoes } from './echoes'
import { handleStatuses } from './statuses'
import type { WabaChangeValue, WabaWebhookPayload } from './types'

// Field coexistence yang sengaja diabaikan (sync kontak/riwayat = increment
// berikutnya). Dicatat supaya tidak dianggap event tak dikenal.
const IGNORED_FIELDS = new Set(['history', 'smb_app_state_sync'])

// CATATAN ARSITEKTUR (dok Meta "Webhooks Overrides"): account_update,
// account_review_update, account_alerts, dan semua template webhook TIDAK
// mendukung override_callback_uri — selalu dikirim ke callback level-App.
// Selama Meta App dipakai bersama platform lain, event ini tidak sampai ke
// hulao. Handler tetap ada supaya langsung berguna begitu App-nya terpisah.

/**
 * Proses satu payload webhook. Error per-change diisolasi — satu change
 * gagal tidak menghentikan change lain (Meta menggabungkan banyak event
 * dalam satu request).
 */
export async function processMetaWebhook(payload: WabaWebhookPayload): Promise<void> {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (!change.value) continue
      try {
        if (change.field === 'messages') {
          await processChangeValue(change.value)
        } else if (change.field === 'smb_message_echoes') {
          // Coexistence: pesan yang DIKIRIM owner dari aplikasi WA Business di
          // HP — dicatat sebagai balasan CS supaya inbox web utuh.
          await handleMessageEchoes(change.value)
        } else if (change.field === 'account_update') {
          await handleAccountUpdate(entry.id, change.value)
        } else if (!IGNORED_FIELDS.has(change.field)) {
          console.log(`[waba/webhook-router] field ${change.field} tidak ditangani — dilewati`)
        }
      } catch (err) {
        console.error(`[waba/webhook-router] change ${change.field} gagal diproses:`, err)
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
