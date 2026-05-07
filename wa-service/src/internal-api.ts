// Wrapper untuk semua call wa-service → Next.js (/api/internal/*).
// Selalu kirim header `x-service-secret` supaya endpoint mau respons.
//
// PENTING: env diakses lewat fungsi (lazy) — bukan const di top-level. Kalau
// di-evaluate saat module load, dotenv di index.ts belum jalan (urutan import
// ESM resolve dulu sebelum top-level code), jadi SECRET akan kosong.

function nextJsBase(): string {
  return process.env.NEXTJS_URL || 'http://localhost:3000'
}
function serviceSecret(): string {
  return process.env.WA_SERVICE_SECRET || ''
}

export type MessageRole = 'USER' | 'AI' | 'HUMAN' | 'AGENT'

// Asal pesan — bedakan CS reply via web vs langsung dari WA HP, vs balasan
// AI (untuk konsistensi schema). Null = legacy/customer message.
export type MessageSource = 'WA_DIRECT' | 'WEB_DASHBOARD' | 'AI'

export interface InternalSoulConfig {
  sessionId: string
  userId: string
  soul: {
    id: string
    name: string
    language: string
    systemPrompt: string
  } | null
  model: {
    id: string
    modelId: string
    provider: 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'
    costPerMessage: number
    inputPricePer1M: number // USD per 1M token
    outputPricePer1M: number
    isActive: boolean
  } | null
  // Snapshot pricing settings supaya wa-service bisa hitung profit per pesan
  // tanpa hop tambahan (lihat ai-handler.ts).
  pricing: {
    usdRate: number
    pricePerToken: number
  }
}

export interface InternalMessageHistoryItem {
  role: MessageRole
  content: string
  createdAt: string
}

export interface InternalSaveMessageResult {
  messageId: string
  contactId: string
  contact?: { aiPaused: boolean; isResolved: boolean }
  history: InternalMessageHistoryItem[]
}

export interface InternalTokenBalance {
  userId: string
  balance: number
  totalUsed: number
  totalPurchased: number
}

export interface InternalKnowledgeMatch {
  // List entry yang match keyword di pesan customer.
  items: Array<{
    id: string
    title: string
    contentType: string
    textContent: string | null
    fileUrl: string | null
    linkUrl: string | null
    caption: string | null
  }>
  // Blok teks siap append ke system prompt — dibangun server-side.
  promptBlock: string
}

export interface InternalFlowResult {
  // true = wa-service kirim `reply` lalu SKIP AI generation.
  // false = lanjut ke AI normal.
  handled: boolean
  reply?: string
  // Kalau ada, wa-service kirim notifikasi ke admin via session WA yang sama.
  notifyAdmin?: { phoneNumber: string; message: string }
  meta?: {
    flowId?: string
    flowName?: string
    sessionId?: string
    status?: 'started' | 'continued' | 'completed' | 'abandoned' | 'cancelled'
  }
}

interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    // Baca env tiap call (lazy) — pastikan dotenv sudah jalan saat ini.
    const base = nextJsBase()
    const secret = serviceSecret()
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(secret ? { 'x-service-secret': secret } : {}),
        ...init.headers,
      },
    })
    const json = (await res.json().catch(() => null)) as ApiResponse<T> | null
    if (!json) {
      return { success: false, error: `Next.js: respons tidak valid (${res.status})` }
    }
    return json
  } catch (err) {
    return {
      success: false,
      error: `Next.js tidak bisa dihubungi: ${(err as Error).message}`,
    }
  }
}

export const internalApi = {
  getSoul(sessionId: string) {
    return request<InternalSoulConfig>(
      `/api/internal/soul/${encodeURIComponent(sessionId)}`,
    )
  },

  saveMessage(input: {
    sessionId: string
    phoneNumber: string
    pushName?: string | null
    content: string
    role: MessageRole
    tokensUsed?: number
    withHistory?: boolean
    // Asal pesan untuk role AGENT/AI. Null untuk pesan customer / pre-feature.
    source?: MessageSource
    // ID pesan dari Baileys (msg.key.id) — dipakai untuk dedup saat event
    // messages.upsert masuk untuk pesan yang baru kita kirim sendiri.
    externalMsgId?: string | null
    // Profitability tracking (di-set untuk pesan AI). Boleh kosong → field
    // di DB null untuk pesan customer / pre-feature.
    apiInputTokens?: number
    apiOutputTokens?: number
    apiCostRp?: number
    tokensCharged?: number
    revenueRp?: number
    profitRp?: number
  }) {
    return request<InternalSaveMessageResult>('/api/internal/messages', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  // Cek apakah message dengan externalMsgId tertentu sudah disimpan untuk
  // sessionId ini. Dipakai handleIncomingMessage saat fromMe=true untuk dedup
  // pesan yang sudah di-save lewat /api/inbox/[contactId]/send.
  checkMessageExists(input: { externalMsgId: string; sessionId: string }) {
    return request<{ exists: boolean }>(
      '/api/internal/messages/check-exists',
      { method: 'POST', body: JSON.stringify(input) },
    )
  },

  // Cek status takeover (aiPaused) sebuah kontak. Return null kalau kontak
  // belum ada — caller skip processing supaya tidak auto-create kontak hanya
  // dari pesan outgoing pertama (mis. broadcast).
  getContactStatus(input: { sessionId: string; phoneNumber: string }) {
    return request<{ aiPaused: boolean; contactId: string } | null>(
      '/api/internal/contacts/status',
      { method: 'POST', body: JSON.stringify(input) },
    )
  },

  checkTokens(userId: string) {
    return request<InternalTokenBalance>(
      `/api/internal/tokens/check/${encodeURIComponent(userId)}`,
    )
  },

  useTokens(input: {
    userId: string
    amount: number
    description?: string
    reference?: string
  }) {
    return request<{ userId: string; balance: number; used: number }>(
      '/api/internal/tokens/use',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    )
  },

  reportBroadcastProgress(
    broadcastId: string,
    input: {
      totalSent?: number
      totalFailed?: number
      status?: 'SENDING' | 'COMPLETED' | 'CANCELLED' | 'FAILED'
      completedAt?: string
    },
  ) {
    return request<{ id: string }>(
      `/api/internal/broadcasts/${encodeURIComponent(broadcastId)}/progress`,
      { method: 'POST', body: JSON.stringify(input) },
    )
  },

  // Process pesan customer melalui flow engine (sales flow).
  // Kalau handled=true, wa-service tanggung jawab kirim reply + notifyAdmin
  // (kalau ada) lewat Baileys.
  processFlow(input: {
    sessionId: string
    contactId: string
    message: string
  }) {
    return request<InternalFlowResult>('/api/internal/flow/process', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },

  // Cari entry knowledge yang match keyword pesan customer untuk satu session.
  // Side-effect di Next.js: increment triggerCount + lastTriggeredAt.
  getKnowledge(sessionId: string, message: string) {
    return request<InternalKnowledgeMatch>(
      `/api/internal/knowledge/${encodeURIComponent(sessionId)}`,
      {
        method: 'POST',
        body: JSON.stringify({ message }),
      },
    )
  },

  // Persist status WA session ke DB. Dipanggil setiap kali updateState
  // di wa-manager — supaya UI dashboard / API public selalu lihat status terbaru.
  updateSessionStatus(
    sessionId: string,
    input: {
      status:
        | 'DISCONNECTED'
        | 'CONNECTING'
        | 'WAITING_QR'
        | 'CONNECTED'
        | 'PAUSED'
        | 'ERROR'
      phoneNumber?: string | null
      displayName?: string | null
    },
  ) {
    return request<{ id: string; status: string }>(
      `/api/internal/whatsapp/${encodeURIComponent(sessionId)}/status`,
      { method: 'POST', body: JSON.stringify(input) },
    )
  },
}
