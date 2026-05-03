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

export type MessageRole = 'USER' | 'AI' | 'HUMAN'

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
    isActive: boolean
  } | null
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
  }) {
    return request<InternalSaveMessageResult>('/api/internal/messages', {
      method: 'POST',
      body: JSON.stringify(input),
    })
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
}
