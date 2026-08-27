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
import { consumeRateLimit } from '@/lib/rate-limit-memory'
import { WEBHOOK_AUTO_DISABLE_STREAK } from '@/lib/validations/webhook-endpoint'
import { guardedLookup } from './url-guard'

const TIMEOUT_MS = 10_000
// Maks 6 percobaan: langsung, lalu ±1m, 5m, 30m, 2j, 8j.
const RETRY_DELAYS_MS = [60_000, 300_000, 1_800_000, 7_200_000, 28_800_000]
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1
// Respons penerima tidak kami butuhkan — baca maksimal segini untuk log.
const MAX_RESPONSE_BYTES = 1024
// Klaim in-flight dianggap basi setelah ini (proses mati saat mengirim) →
// boleh diklaim ulang. Lebih lama dari TIMEOUT_MS supaya kirim normal tak
// pernah dianggap basi.
const STALE_CLAIM_MS = 2 * 60 * 1000
// Sirkuit-breaker berbasis VOLUME (independen dari failStreak): batas
// pengiriman per endpoint per menit. Menahan penyalahgunaan "pakai IP platform
// sebagai originator request" walau target selalu balas 2xx. Jauh di atas
// pemakaian wajar (trafik CS satu nomor).
const SEND_LIMIT_PER_MIN = 120

export function signPayload(
  secret: string,
  body: string,
  tsSec: number,
): string {
  const mac = createHmac('sha256', secret)
    .update(`${tsSec}.${body}`, 'utf8')
    .digest('hex')
  return `t=${tsSec},v1=${mac}`
}

interface PostResult {
  ok: boolean
  httpStatus: number | null
  error: string | null
}

function postJson(
  url: URL,
  body: string,
  headers: Record<string, string>,
): Promise<PostResult> {
  return new Promise((resolve) => {
    // Satu pintu resolve — dijaga flag supaya tidak resolve dobel (mis. data
    // melewati cap LALU 'error'/'close' juga terpicu).
    let done = false
    const settle = (r: PostResult) => {
      if (done) return
      done = true
      resolve(r)
    }
    const fromStatus = (status: number): PostResult =>
      status >= 200 && status < 300
        ? { ok: true, httpStatus: status, error: null }
        : {
            ok: false,
            httpStatus: status || null,
            error: `HTTP ${status || '?'}`,
          }

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
          // Body lewat cap → hasilnya sudah ditentukan status; resolve SEKARANG
          // lalu buang sisa stream. JANGAN menunggu 'end': res.destroy() tidak
          // menjamin 'end' terpicu saat body datang per-chunk → promise
          // menggantung selamanya, membekukan seluruh loop pengirim & cron.
          if (seen > MAX_RESPONSE_BYTES) {
            settle(fromStatus(status))
            res.destroy()
          }
        })
        // Redirect TIDAK diikuti (bisa dipakai melompat ke alamat internal
        // setelah lolos guard) — dihitung berdasarkan status saja.
        res.on('end', () => settle(fromStatus(status)))
        res.on('close', () => settle(fromStatus(status)))
        res.on('error', () => settle(fromStatus(status)))
      },
    )
    req.on('timeout', () => {
      req.destroy(new Error('timeout'))
    })
    req.on('error', (err) => {
      settle({
        ok: false,
        httpStatus: null,
        error: (err as Error).message.slice(0, 250),
      })
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
export async function deliverOne(
  deliveryId: string,
): Promise<DeliverOutcome | null> {
  // Throttle volume per endpoint SEBELUM klaim, supaya penundaan tidak
  // membakar jatah attempt. Butuh endpointId → baca ringan dulu.
  const pre = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    select: { endpointId: true, status: true },
  })
  if (!pre || (pre.status !== 'PENDING' && pre.status !== 'FAILED')) return null

  const quota = consumeRateLimit({
    key: `whsend:${pre.endpointId}`,
    limit: SEND_LIMIT_PER_MIN,
    windowMs: 60_000,
  })
  if (!quota.allowed) {
    // Tunda tanpa menaikkan attempt / failStreak — endpoint sehat tidak boleh
    // dinonaktifkan hanya karena volume tinggi. Cron mengambilnya lagi nanti.
    await prisma.webhookDelivery.updateMany({
      where: { id: deliveryId, status: { in: ['PENDING', 'FAILED'] } },
      data: {
        status: 'FAILED',
        nextRetryAt: new Date(quota.resetAtMs),
        error: 'Ditunda: batas laju pengiriman endpoint',
        claimedAt: null,
      },
    })
    return { ok: false, httpStatus: null, error: 'throttled' }
  }

  // Klaim EKSKLUSIF: hanya baris yang belum diklaim (atau klaimnya basi) yang
  // lolos — dua deliverOne paralel tidak bisa sama-sama mengirim & menaikkan
  // attempt. claimedAt=now menandai in-flight.
  const claimed = await prisma.webhookDelivery.updateMany({
    where: {
      id: deliveryId,
      status: { in: ['PENDING', 'FAILED'] },
      OR: [
        { claimedAt: null },
        { claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
      ],
    },
    data: {
      attempt: { increment: 1 },
      claimedAt: new Date(),
      nextRetryAt: null,
    },
  })
  if (claimed.count === 0) return null

  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: deliveryId },
    include: {
      endpoint: {
        select: {
          id: true,
          url: true,
          secretEnc: true,
          isActive: true,
          failStreak: true,
        },
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
    outcome = {
      ok: false,
      httpStatus: null,
      error: (err as Error).message.slice(0, 250),
    }
  }

  const now = new Date()
  if (outcome.ok) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'SUCCESS',
          httpStatus: outcome.httpStatus,
          error: null,
          deliveredAt: now,
        },
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
    : new Date(
        Date.now() +
          RETRY_DELAYS_MS[
            Math.min(delivery.attempt - 1, RETRY_DELAYS_MS.length - 1)
          ],
      )
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
        // Lepas klaim: setelah nextRetryAt lewat, baris ini bebas diklaim
        // ulang tanpa harus menunggu jendela basi.
        claimedAt: null,
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
    // Auto-nonaktif: matikan (DEAD) sisa delivery endpoint ini supaya tidak
    // menggantung sebagai FAILED selamanya (cron menyaring endpoint nonaktif).
    ...(autoDisable
      ? [
          prisma.webhookDelivery.updateMany({
            where: {
              endpointId: delivery.endpoint.id,
              status: { in: ['PENDING', 'FAILED'] },
              id: { not: deliveryId },
            },
            data: {
              status: 'DEAD',
              error: 'Endpoint dinonaktifkan otomatis (gagal beruntun)',
            },
          }),
        ]
      : []),
  ])
  return { ok: false, httpStatus: outcome.httpStatus, error: outcome.error }
}
