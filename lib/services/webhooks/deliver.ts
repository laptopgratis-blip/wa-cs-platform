// Pengirim satu delivery webhook: tanda tangan HMAC → POST https → catat
// hasil + jadwal retry. Never-throw ke pemanggil (kegagalan = state di DB).
//
// Tanda tangan (gaya Stripe): header
//   X-Hulao-Signature: t=<unix detik>,v1=<hex hmac_sha256(secret, `${t}.${body}`)>
// Penerima memverifikasi dengan menghitung ulang HMAC atas string `t.body`
// memakai secret whsec_ miliknya, lalu membandingkan waktu-konstan.
import { createHmac } from 'crypto'
import https from 'https'
import http from 'http'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { WEBHOOK_AUTO_DISABLE_STREAK } from '@/lib/validations/webhook-endpoint'
import { guardedLookup } from './url-guard'

const TIMEOUT_MS = 10_000
// Maks 6 percobaan: langsung, lalu ±1m, 5m, 30m, 2j, 8j.
const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 28_800_000]
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1
// Respons penerima tidak kami butuhkan — baca maksimal segini untuk log.
const MAX_RESPONSE_BYTES = 1024

export function signPayload(secret: string, body: string, tsSec: number): string {
  const mac = createHmac('sha256', secret).update(`${tsSec}.${body}`, 'utf8').digest('hex')
  return `t=${tsSec},v1=${mac}`
}

interface PostResult {
  ok: boolean
  httpStatus: number | null
  error: string | null
}

function postJson(url: URL, body: string, headers: Record<string, string>): Promise<PostResult> {
  return new Promise((resolve) => {
    // http hanya hidup saat WEBHOOK_ALLOW_PRIVATE_URL=1 (dev) — url-guard
    // menolak skema http di lingkungan normal jauh sebelum sampai sini.
    const mod = url.protocol === 'http:' ? http : https
    const req = mod.request(
      url,
      {
        method: 'POST',
        // Validasi alamat TEPAT saat koneksi dibuat (anti DNS-rebinding).
        lookup: guardedLookup,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'Hulao-Webhook/1.0',
          ...headers,
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0
        let seen = 0
        res.on('data', (chunk: Buffer) => {
          seen += chunk.length
          if (seen > MAX_RESPONSE_BYTES) res.destroy()
        })
        res.on('end', () => {
          // Redirect TIDAK diikuti (bisa dipakai melompat ke alamat internal
          // setelah lolos guard) — dihitung gagal.
          if (status >= 200 && status < 300) resolve({ ok: true, httpStatus: status, error: null })
          else resolve({ ok: false, httpStatus: status, error: `HTTP ${status}` })
        })
        res.on('error', () => {
          if (status >= 200 && status < 300) resolve({ ok: true, httpStatus: status, error: null })
          else resolve({ ok: false, httpStatus: status || null, error: `HTTP ${status || '?'}` })
        })
      },
    )
    req.on('timeout', () => {
      req.destroy(new Error('timeout'))
    })
    req.on('error', (err) => {
      resolve({ ok: false, httpStatus: null, error: (err as Error).message.slice(0, 250) })
    })
    req.end(body)
  })
}

export interface DeliverOutcome {
  ok: boolean
  httpStatus: number | null
  error: string | null
}

/**
 * Kirim (atau kirim-ulang) satu WebhookDelivery. Aman dipanggil dobel:
 * klaim atomik status → hanya satu pemanggil yang benar-benar mengirim.
 */
export async function deliverOne(deliveryId: string): Promise<DeliverOutcome | null> {
  // Klaim: PENDING/FAILED → attempt naik. Kalah race → null.
  const claimed = await prisma.webhookDelivery.updateMany({
    where: { id: deliveryId, status: { in: ['PENDING', 'FAILED'] } },
    data: { attempt: { increment: 1 }, nextRetryAt: null },
  })
  if (claimed.count === 0) return null

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      endpoint: {
        select: { id: true, url: true, secretEnc: true, isActive: true, failStreak: true },
      },
    },
  })
  if (!delivery) return null

  if (!delivery.endpoint.isActive) {
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: 'DEAD', error: 'Endpoint nonaktif' },
    })
    return { ok: false, httpStatus: null, error: 'Endpoint nonaktif' }
  }

  let outcome: PostResult
  try {
    const url = new URL(delivery.endpoint.url)
    const secret = decrypt(delivery.endpoint.secretEnc)
    const body = JSON.stringify(delivery.payload)
    const ts = Math.floor(Date.now() / 1000)
    outcome = await postJson(url, body, {
      'X-Hulao-Signature': signPayload(secret, body, ts),
      'X-Hulao-Event': delivery.eventType,
      'X-Hulao-Delivery': delivery.id,
    })
  } catch (err) {
    outcome = { ok: false, httpStatus: null, error: (err as Error).message.slice(0, 250) }
  }

  const now = new Date()
  if (outcome.ok) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: 'SUCCESS', httpStatus: outcome.httpStatus, error: null, deliveredAt: now },
      }),
      prisma.webhookEndpoint.update({
        where: { id: delivery.endpoint.id },
        data: { lastSuccessAt: now, failStreak: 0, lastError: null },
      }),
    ])
    return { ok: true, httpStatus: outcome.httpStatus, error: null }
  }

  const exhausted = delivery.attempt >= MAX_ATTEMPTS
  const nextRetryAt = exhausted
    ? null
    : new Date(Date.now() + RETRY_DELAYS_MS[Math.min(delivery.attempt - 1, RETRY_DELAYS_MS.length - 1)])
  const newStreak = delivery.endpoint.failStreak + 1
  const autoDisable = newStreak >= WEBHOOK_AUTO_DISABLE_STREAK

  await prisma.$transaction([
    prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        status: exhausted ? 'DEAD' : 'FAILED',
        httpStatus: outcome.httpStatus,
        error: outcome.error,
        nextRetryAt,
      },
    }),
    prisma.webhookEndpoint.update({
      where: { id: delivery.endpoint.id },
      data: {
        lastFailureAt: now,
        lastError: outcome.error,
        failStreak: { increment: 1 },
        ...(autoDisable ? { isActive: false, autoDisabledAt: now } : {}),
      },
    }),
  ])
  return { ok: false, httpStatus: outcome.httpStatus, error: outcome.error }
}
