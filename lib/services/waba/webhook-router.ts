// Router event webhook Meta: pecah entry[].changes[] lalu arahkan per
// phone_number_id (value.metadata) ke handler pesan masuk / status / echo,
// atau per WABA (entry.id) untuk event template (App-level).
// Dipanggil dari app/api/webhooks/meta/route.ts SETELAH signature valid.

import { handleInboundMessages } from './inbound'
import { handleAccountUpdate } from './account-update'
import { handleMessageEchoes } from './echoes'
import { handleHistory } from './history-import'
import { handleStateSync } from './state-sync'
import { handleStatuses } from './statuses'
import {
  handleTemplateCategoryUpdate,
  handleTemplateQualityUpdate,
  handleTemplateStatusUpdate,
} from './template-webhooks'
import { handleUserPreferences } from './user-preferences'
import type {
  WabaChangeValue,
  WabaTemplateCategoryValue,
  WabaTemplateQualityValue,
  WabaTemplateStatusValue,
  WabaUserPreferencesValue,
  WabaWebhookPayload,
} from './types'

// CATATAN ARSITEKTUR (dok Meta "Webhooks Overrides"): account_update,
// account_review_update, account_alerts, dan semua template webhook TIDAK
// mendukung override_callback_uri — selalu dikirim ke callback level-App.
// Meta App hulao (2223348661837058) terpisah dari platform lain, jadi event
// ini sampai; polling sync di cron waba-token-refresh = jaring pengaman.

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
        await routeChange(entry.id, change.field, change.value)
      } catch (err) {
        console.error(`[waba/webhook-router] change ${change.field} gagal diproses:`, err)
      }
    }
  }
}

async function routeChange(wabaId: string, field: string, value: WabaChangeValue): Promise<void> {
  switch (field) {
    case 'messages':
      return processChangeValue(value)
    case 'smb_message_echoes':
      // Coexistence: pesan yang DIKIRIM owner dari aplikasi WA Business di
      // HP — dicatat sebagai balasan CS supaya inbox web utuh.
      return handleMessageEchoes(value)
    case 'account_update':
      return handleAccountUpdate(wabaId, value)
    case 'history':
      // Coexistence: chunk riwayat chat dari WA Business App → import.
      return handleHistory(value)
    case 'smb_app_state_sync':
      // Coexistence: daftar kontak dari WA Business App → import.
      return handleStateSync(value)
    case 'message_template_status_update':
      return handleTemplateStatusUpdate(wabaId, value as unknown as WabaTemplateStatusValue)
    case 'message_template_quality_update':
      return handleTemplateQualityUpdate(wabaId, value as unknown as WabaTemplateQualityValue)
    case 'template_category_update':
      return handleTemplateCategoryUpdate(wabaId, value as unknown as WabaTemplateCategoryValue)
    case 'user_preferences':
      return handleUserPreferences(value as unknown as WabaUserPreferencesValue)
    default:
      console.log(`[waba/webhook-router] field ${field} tidak ditangani — dilewati`)
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
