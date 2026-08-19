// Tipe payload webhook WhatsApp Cloud API (field `messages`).
// Referensi: developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples

export interface WabaWebhookPayload {
  object: string
  entry?: WabaEntry[]
}

export interface WabaEntry {
  id: string // WABA ID
  changes?: WabaChange[]
}

export interface WabaChange {
  field: string // 'messages' | 'message_template_status_update' | ...
  value?: WabaChangeValue
}

export interface WabaChangeValue {
  messaging_product?: string
  metadata?: {
    display_phone_number?: string
    phone_number_id?: string
  }
  contacts?: WabaContact[]
  messages?: WabaInboundMessage[]
  statuses?: WabaStatusUpdate[]
  errors?: WabaError[]
  /** Coexistence (smb_message_echoes): pesan yang dikirim owner dari WA Business App. */
  message_echoes?: WabaMessageEcho[]
  /** Coexistence (history): chunk riwayat chat dari WA Business App. */
  history?: WabaHistoryEntry[]
  /** Coexistence (smb_app_state_sync): kontak dari WA Business App. */
  state_sync?: WabaStateSyncItem[]
}

// ── Coexistence: sync riwayat (webhook field `history`) ──
// Satu webhook = satu chunk; chunk_order bisa datang tidak berurutan; progress
// 100 = selesai. phase 0 = hari 0-1, 1 = hari 1-90, 2 = hari 90-180.
export interface WabaHistoryMessage extends WabaInboundMessage {
  to?: string
  /** Status pesan saat itu: DELIVERED | ERROR | PENDING | PLAYED | READ | SENT */
  history_context?: { status?: string }
}

export interface WabaHistoryThread {
  /** wa_id customer (digit murni). */
  id: string
  messages?: WabaHistoryMessage[]
}

export interface WabaHistoryEntry {
  metadata?: { phase?: number; chunk_order?: number; progress?: number }
  threads?: WabaHistoryThread[]
  /** 2593109 = user menolak berbagi riwayat di HP. */
  errors?: WabaError[]
}

// ── Coexistence: sync kontak (webhook field `smb_app_state_sync`) ──
export interface WabaStateSyncItem {
  type?: 'contact' | string
  contact?: { full_name?: string; first_name?: string; phone_number?: string }
  action?: 'add' | 'remove' | string
  metadata?: { timestamp?: string }
}

export interface WabaMessageEcho {
  id: string // wamid
  to?: string // wa_id customer tujuan (digit murni)
  from?: string // nomor bisnis
  timestamp?: string
  type?: string
  text?: { body?: string }
  image?: WabaMedia
  video?: WabaMedia
  document?: WabaMedia & { filename?: string }
  audio?: WabaMedia & { voice?: boolean }
  sticker?: WabaMedia
}

export interface WabaContact {
  wa_id?: string
  profile?: { name?: string }
}

export interface WabaInboundMessage {
  id: string // wamid — kunci dedup
  from?: string // wa_id pengirim (digit murni)
  timestamp?: string // unix detik (string)
  type?: string // text | image | video | audio | document | sticker | location | contacts | interactive | button | reaction | ...
  text?: { body?: string }
  image?: WabaMedia
  video?: WabaMedia
  audio?: WabaMedia & { voice?: boolean }
  document?: WabaMedia & { filename?: string }
  sticker?: WabaMedia
  location?: { latitude?: number; longitude?: number; name?: string; address?: string }
  contacts?: { name?: { formatted_name?: string } }[]
  interactive?: {
    type?: string
    button_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string }
  }
  button?: { text?: string; payload?: string }
  reaction?: { message_id?: string; emoji?: string }
  context?: { from?: string; id?: string }
}

export interface WabaMedia {
  id?: string
  mime_type?: string
  sha256?: string
  caption?: string
}

export interface WabaStatusUpdate {
  id: string // wamid pesan outbound yang berubah status
  status?: 'sent' | 'delivered' | 'read' | 'failed' | string
  timestamp?: string
  recipient_id?: string
  errors?: WabaError[]
}

export interface WabaError {
  code?: number
  title?: string
  message?: string
  error_data?: { details?: string }
}
