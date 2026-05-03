// Tipe-tipe yang dibagi pakai antara WaManager, server, dan socket events.
// Status disamakan dengan enum WaStatus di Prisma supaya konsisten end-to-end.

export type WaStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'WAITING_QR'
  | 'CONNECTED'
  | 'PAUSED'
  | 'ERROR'

export interface SessionState {
  sessionId: string
  status: WaStatus
  phoneNumber: string | null
  displayName: string | null
  qr: string | null // raw QR string dari Baileys (frontend yang render gambar)
  qrDataUrl: string | null // versi data-URL siap pasang ke <img>
  lastError: string | null
  updatedAt: string
}

// ── Payload event Socket.io (server → client) ───────────────────────────────
export interface QrEvent {
  sessionId: string
  qr: string
  qrDataUrl: string
}

export interface StatusEvent {
  sessionId: string
  status: WaStatus
  phoneNumber?: string | null
  displayName?: string | null
  reason?: string | null
}

export interface ConnectedEvent {
  sessionId: string
  phoneNumber: string
  displayName: string | null
}

export interface DisconnectedEvent {
  sessionId: string
  reason: string | null
}

// ── Body request HTTP (Next.js → wa-service) ────────────────────────────────
export interface ConnectRequest {
  sessionId: string
}

export interface DisconnectRequest {
  sessionId: string
  // Kalau true: hapus juga credentials dari disk (logout total).
  wipe?: boolean
}
