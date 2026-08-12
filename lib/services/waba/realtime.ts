// Relay event realtime inbox dari Next.js ke Socket.io server yang di-host
// wa-service (POST /emit). Frontend (InboxView/ChatView) tidak berubah —
// tetap subscribe room session:<id> yang sama.
//
// Kontrak payload HARUS identik dengan lib/socket-client.ts
// (InboxMessagePayload / InboxStatusPayload).

const BASE = process.env.WA_SERVICE_URL || 'http://localhost:3001'
const SECRET = process.env.WA_SERVICE_SECRET || ''

export interface RelayInboxMessage {
  sessionId: string
  contactId: string
  phoneNumber: string
  name: string | null
  message: {
    id: string | null
    content: string
    role: 'USER' | 'AI' | 'AGENT' | 'HUMAN'
    status: 'SENT' | 'FAILED'
    source: string | null
    createdAt: string
  }
}

export interface RelayInboxStatus {
  sessionId: string
  externalMsgId: string
  status: 'FAILED'
}

/**
 * Kirim event ke room session di Socket.io wa-service. NEVER throw dan tidak
 * menahan pipeline — realtime adalah nice-to-have; kalau wa-service down,
 * inbox tetap konsisten lewat refresh/refetch.
 */
export async function relayEmit(
  event: 'inbox:message',
  payload: RelayInboxMessage,
): Promise<void>
export async function relayEmit(
  event: 'inbox:status',
  payload: RelayInboxStatus,
): Promise<void>
export async function relayEmit(
  event: 'inbox:message' | 'inbox:status',
  payload: RelayInboxMessage | RelayInboxStatus,
): Promise<void> {
  try {
    await fetch(`${BASE}/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SECRET ? { 'x-service-secret': SECRET } : {}),
      },
      body: JSON.stringify({ sessionId: payload.sessionId, event, payload }),
      cache: 'no-store',
      signal: AbortSignal.timeout(3_000),
    })
  } catch (err) {
    console.warn('[waba/realtime] relay emit gagal (diabaikan):', (err as Error).message)
  }
}
