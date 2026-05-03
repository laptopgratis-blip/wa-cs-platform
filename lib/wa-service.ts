// Helper untuk komunikasi Next.js → wa-service (HTTP).
// Semua API route di app/api/whatsapp/* lewat sini supaya konsisten.

import type { WaStatus } from '@prisma/client'

const BASE = process.env.WA_SERVICE_URL || 'http://localhost:3001'
const SECRET = process.env.WA_SERVICE_SECRET || ''

// Mirror tipe dari wa-service/src/types.ts (status sinkron dengan Prisma).
export interface WaServiceSession {
  sessionId: string
  status: WaStatus
  phoneNumber: string | null
  displayName: string | null
  qr: string | null
  qrDataUrl: string | null
  lastError: string | null
  updatedAt: string
}

interface ServiceResponse<T> {
  success: boolean
  data?: T
  error?: string
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<ServiceResponse<T>> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(SECRET ? { 'x-service-secret': SECRET } : {}),
        ...init.headers,
      },
      // wa-service jalan di jaringan lokal — jangan di-cache.
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => null)) as ServiceResponse<T> | null
    if (!json) {
      return { success: false, error: `wa-service: respons tidak valid (${res.status})` }
    }
    return json
  } catch (err) {
    return {
      success: false,
      error: `wa-service tidak bisa dihubungi: ${(err as Error).message}`,
    }
  }
}

export const waService = {
  connect(sessionId: string) {
    return request<WaServiceSession>('/sessions/connect', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
  },
  disconnect(sessionId: string, wipe = false) {
    return request<WaServiceSession | null>('/sessions/disconnect', {
      method: 'POST',
      body: JSON.stringify({ sessionId, wipe }),
    })
  },
  status(sessionId: string) {
    return request<WaServiceSession>(`/sessions/${encodeURIComponent(sessionId)}`)
  },
  sendMessage(sessionId: string, phoneNumber: string, content: string) {
    return request<{ sessionId: string; phoneNumber: string }>(
      `/sessions/${encodeURIComponent(sessionId)}/send-message`,
      {
        method: 'POST',
        body: JSON.stringify({ phoneNumber, content }),
      },
    )
  },
  startBroadcast(input: {
    sessionId: string
    broadcastId: string
    items: { phoneNumber: string; content: string }[]
  }) {
    return request<{ broadcastId: string; total: number }>(
      `/sessions/${encodeURIComponent(input.sessionId)}/broadcast`,
      {
        method: 'POST',
        body: JSON.stringify({
          broadcastId: input.broadcastId,
          items: input.items,
        }),
      },
    )
  },
  cancelBroadcast(broadcastId: string) {
    return request<{ broadcastId: string; cancelled: boolean }>(
      `/broadcasts/${encodeURIComponent(broadcastId)}/cancel`,
      { method: 'POST' },
    )
  },
}
