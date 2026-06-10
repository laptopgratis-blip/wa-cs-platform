// Token short-lived untuk autentikasi subscribe Socket.io ke wa-service.
// Format: `${sessionId}.${exp}.${hmac}` — exp = epoch detik, hmac =
// HMAC-SHA256(WA_SERVICE_SECRET, `${sessionId}.${exp}`) dalam hex.
// wa-service memverifikasi dengan secret yang sama (lihat verifySocketToken
// di wa-service/src/index.ts) sebelum mengizinkan join room QR/status.
import { createHmac } from 'node:crypto'

// Masa berlaku token: 10 menit — cukup untuk satu sesi pairing/scan QR.
const TOKEN_TTL_SECONDS = 600

export function createWaSocketToken(sessionId: string): string {
  const secret = process.env.WA_SERVICE_SECRET ?? ''
  if (!secret) {
    // Fail-closed: tanpa secret token tidak bisa diverifikasi wa-service.
    throw new Error('WA_SERVICE_SECRET belum di-set — tidak bisa mint socket token')
  }
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  const payload = `${sessionId}.${exp}`
  const signature = createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${signature}`
}
