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

// Subscribe ke room sebuah WA session di wa-service. wa-service menolak
// subscribe tanpa token HMAC valid (anti QR hijack), jadi ambil dulu token
// short-lived dari server (hanya pemilik session yang bisa mint), baru emit.
// Return { ok:false, error } kalau gagal — caller yang menentukan cara
// menampilkan errornya (toast / state error).
export async function subscribeWaSession(
  ioSocket: Socket,
  sessionId: string,
  // isCancelled: dicek SEBELUM emit — kalau komponen keburu unmount saat
  // fetch token jalan, jangan join room (cleanup sudah emit 'unsubscribe',
  // subscribe telat bikin socket singleton nyangkut di room tanpa listener).
  opts?: { isCancelled?: () => boolean },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/whatsapp/${sessionId}/socket-token`)
    const json = (await res.json().catch(() => null)) as
      | { success: boolean; data?: { token: string }; error?: string }
      | null
    if (!res.ok || !json?.success || !json.data?.token) {
      return {
        ok: false,
        error: json?.error || 'Gagal mengambil token status realtime',
      }
    }
    if (opts?.isCancelled?.()) return { ok: true }
    ioSocket.emit('subscribe', { sessionId, token: json.data.token })
    return { ok: true }
  } catch {
    return { ok: false, error: 'Gagal terhubung ke status realtime' }
  }
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

// Emit oleh wa-service kalau subscribe ditolak (token kosong/invalid/expired).
export interface SubscribeErrorPayload {
  sessionId: string
  error?: string
}
