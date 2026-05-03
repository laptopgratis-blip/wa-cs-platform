// Singleton socket.io client untuk komunikasi dengan wa-service.
// Auto-connect saat pertama dipanggil; tetap satu instance per browser tab.
import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (socket) return socket
  const url = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001'
  socket = io(url, {
    transports: ['websocket', 'polling'],
    autoConnect: true,
    withCredentials: true,
  })
  return socket
}

// Tipe payload event dari wa-service. Sengaja diduplikasi di sini supaya
// frontend tidak perlu import dari folder wa-service/.
export type WaStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'WAITING_QR'
  | 'CONNECTED'
  | 'PAUSED'
  | 'ERROR'

export interface QrEventPayload {
  sessionId: string
  qr: string
  qrDataUrl: string
}

export interface StatusEventPayload {
  sessionId: string
  status: WaStatus
  phoneNumber?: string | null
  displayName?: string | null
  reason?: string | null
}

export interface ConnectedEventPayload {
  sessionId: string
  phoneNumber: string
  displayName: string | null
}

export interface DisconnectedEventPayload {
  sessionId: string
  reason: string | null
}
