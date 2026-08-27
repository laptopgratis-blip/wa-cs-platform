// Tipe-tipe yang dipakai bersama oleh komponen Inbox.
import type { MessageRole, MessageStatus, PipelineStage } from '@prisma/client'

export type InboxFilter = 'all' | 'ai' | 'attention' | 'resolved'

// BAILEYS = nomor hasil scan QR (tanpa aturan window Meta, tanpa template).
// CLOUD_API = nomor WhatsApp Business resmi Meta (window 24 jam + template).
export type WaProvider = 'BAILEYS' | 'CLOUD_API'

/**
 * Satu NOMOR WhatsApp milik user — opsi filter di daftar percakapan.
 *
 * Dikunci ke nomor, bukan ke id sesi: satu nomor yang di-pair ulang punya
 * banyak baris WhatsappSession, dan user berpikir dalam satuan nomor.
 */
export interface SenderOption {
  phoneNumber: string
  displayName: string | null
  provider: WaProvider
  /** false = nomor lama yang masih menyimpan percakapan. */
  isConnected: boolean
}

// Asal pesan AGENT/AI: WA_DIRECT (CS balas langsung dari WA HP), WEB_DASHBOARD
// (CS balas dari inbox web), AI (otomatis), WA_HISTORY (import riwayat).
// Trek 2B (Cloud API): TEMPLATE (CS kirim template), BROADCAST, FOLLOWUP,
// SYSTEM (OTP/notif platform). null = legacy/customer.
export type MessageSource =
  | 'WA_DIRECT'
  | 'WEB_DASHBOARD'
  | 'AI'
  | 'WA_HISTORY'
  | 'TEMPLATE'
  | 'BROADCAST'
  | 'FOLLOWUP'
  | 'SYSTEM'

export interface InboxConversation {
  id: string
  phoneNumber: string
  name: string | null
  avatar: string | null
  tags: string[]
  pipelineStage: PipelineStage
  aiPaused: boolean
  isResolved: boolean
  lastMessageAt: string | null
  // Nomor WhatsApp KITA yang memegang percakapan ini. Penting saat akun punya
  // >1 nomor: satu nomor pelanggan yang chat ke dua nomor kita menghasilkan
  // DUA Contact terpisah, yang tanpa penanda ini terlihat seperti duplikat.
  waSession: {
    id: string
    displayName: string | null
    phoneNumber: string | null
    provider: WaProvider
  } | null
  lastMessage: {
    content: string
    role: MessageRole
    source: MessageSource | null
    createdAt: string
  } | null
}

export interface InboxCounts {
  all: number
  ai: number
  attention: number
  resolved: number
}

export interface ChatMessage {
  id: string
  content: string
  role: MessageRole
  status: MessageStatus
  // Asal pesan untuk role AGENT/AI. Null untuk customer / pesan lama.
  source: MessageSource | null
  // ID pesan di sisi WhatsApp. Dipakai untuk match update status realtime
  // (event 'inbox:status' membawa externalMsgId). Opsional: route messages
  // mungkin belum mengembalikannya — kalau undefined, update status di-skip.
  externalMsgId?: string | null
  createdAt: string
  // Profitability fields — null untuk pesan customer / pre-feature, dan
  // hanya di-populate kalau session.role === 'ADMIN'.
  apiInputTokens?: number | null
  apiOutputTokens?: number | null
  apiCostRp?: number | null
  tokensCharged?: number | null
  revenueRp?: number | null
  profitRp?: number | null
  modelName?: string | null
}

export interface ChatContact {
  id: string
  phoneNumber: string
  name: string | null
  avatar: string | null
  tags: string[]
  notes: string | null
  pipelineStage: PipelineStage
  aiPaused: boolean
  isResolved: boolean
  waSession: {
    id: string
    displayName: string | null
    status: string
    provider: WaProvider
    phoneNumber: string | null
  } | null
}
