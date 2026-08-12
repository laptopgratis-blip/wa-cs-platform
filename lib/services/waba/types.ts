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
