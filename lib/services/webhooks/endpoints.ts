// CRUD endpoint webhook milik seller. Secret HMAC dibuat di sini
// (whsec_..., 192-bit CSPRNG), disimpan terenkripsi, dan plaintext hanya
// keluar dari createWebhookEndpoint / rotateWebhookSecret — sekali tampil.
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import {
  MAX_WEBHOOK_ENDPOINTS_PER_USER,
  type WebhookEventType,
} from '@/lib/validations/webhook-endpoint'
import { assertSafeWebhookUrl, WebhookUrlError } from './url-guard'
import { buildEnvelope, type WebhookEnvelope } from './dispatch'
import { deliverOne } from './deliver'

export interface WebhookEndpointView {
  id: string
  url: string
  description: string | null
  events: string[]
  isActive: boolean
  autoDisabledAt: Date | null
  lastSuccessAt: Date | null
  lastFailureAt: Date | null
  lastError: string | null
  createdAt: Date
}

const VIEW_SELECT = {
  id: true,
  url: true,
  description: true,
  events: true,
  isActive: true,
  autoDisabledAt: true,
  lastSuccessAt: true,
  lastFailureAt: true,
  lastError: true,
  createdAt: true,
} as const

/** Penanda internal: kuota endpoint penuh (dilempar dari dalam transaksi). */
class EndpointQuotaError extends Error {}

function newSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`
}

export async function listWebhookEndpoints(
  userId: string,
): Promise<WebhookEndpointView[]> {
  return prisma.webhookEndpoint.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: VIEW_SELECT,
  })
}

export async function createWebhookEndpoint(input: {
  userId: string
  url: string
  description?: string
  events: WebhookEventType[]
}): Promise<
  | { ok: true; secret: string; endpoint: WebhookEndpointView }
  | { ok: false; error: string }
> {
  try {
    await assertSafeWebhookUrl(input.url)
  } catch (err) {
    if (err instanceof WebhookUrlError) return { ok: false, error: err.message }
    return { ok: false, error: 'Gagal memeriksa URL. Coba lagi.' }
  }

  const secret = newSecret()
  try {
    const row = await prisma.$transaction(async (tx) => {
      // Kuota ditegakkan atomik — pelajaran dari SellerApiKey: count+create
      // tanpa lock tembus saat request paralel.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('webhook_endpoint'), hashtext(${input.userId}))`
      const count = await tx.webhookEndpoint.count({
        where: { userId: input.userId },
      })
      if (count >= MAX_WEBHOOK_ENDPOINTS_PER_USER)
        throw new EndpointQuotaError()
      return tx.webhookEndpoint.create({
        data: {
          userId: input.userId,
          url: input.url,
          description: input.description?.trim() || null,
          secretEnc: encrypt(secret),
          events: input.events,
        },
        select: VIEW_SELECT,
      })
    })
    return { ok: true, secret, endpoint: row }
  } catch (err) {
    if (err instanceof EndpointQuotaError) {
      return {
        ok: false,
        error: `Maksimal ${MAX_WEBHOOK_ENDPOINTS_PER_USER} endpoint. Hapus salah satu endpoint lama dulu.`,
      }
    }
    console.error('[webhooks/endpoints] gagal membuat endpoint:', err)
    return { ok: false, error: 'Gagal membuat endpoint. Coba lagi.' }
  }
}

export async function updateWebhookEndpoint(input: {
  userId: string
  endpointId: string
  url?: string
  description?: string
  events?: WebhookEventType[]
  isActive?: boolean
}): Promise<
  | { ok: true; endpoint: WebhookEndpointView }
  | { ok: false; error: string; notFound?: boolean }
> {
  if (input.url !== undefined) {
    try {
      await assertSafeWebhookUrl(input.url)
    } catch (err) {
      if (err instanceof WebhookUrlError)
        return { ok: false, error: err.message }
      return { ok: false, error: 'Gagal memeriksa URL. Coba lagi.' }
    }
  }

  // updateMany dengan filter userId — endpoint orang lain tidak akan tersentuh.
  const res = await prisma.webhookEndpoint.updateMany({
    where: { id: input.endpointId, userId: input.userId },
    data: {
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim() || null }
        : {}),
      ...(input.events !== undefined ? { events: input.events } : {}),
      ...(input.isActive !== undefined
        ? {
            isActive: input.isActive,
            // Aktifkan lagi = beri kesempatan bersih: reset streak & jejak auto-disable.
            ...(input.isActive
              ? { failStreak: 0, autoDisabledAt: null, lastError: null }
              : {}),
          }
        : {}),
    },
  })
  if (res.count === 0)
    return { ok: false, error: 'Endpoint tidak ditemukan', notFound: true }

  // Dinonaktifkan manual → matikan (DEAD) sisa delivery yang menggantung.
  // Tanpa ini, delivery FAILED-nya luput dari cron (yang menyaring endpoint
  // nonaktif) sehingga tampak "masih akan di-retry" selamanya sampai purge.
  if (input.isActive === false) {
    await prisma.webhookDelivery.updateMany({
      where: {
        endpointId: input.endpointId,
        status: { in: ['PENDING', 'FAILED'] },
      },
      data: { status: 'DEAD', error: 'Endpoint dinonaktifkan' },
    })
  }

  const endpoint = await prisma.webhookEndpoint.findUniqueOrThrow({
    where: { id: input.endpointId },
    select: VIEW_SELECT,
  })
  return { ok: true, endpoint }
}

export async function deleteWebhookEndpoint(input: {
  userId: string
  endpointId: string
}): Promise<boolean> {
  const res = await prisma.webhookEndpoint.deleteMany({
    where: { id: input.endpointId, userId: input.userId },
  })
  return res.count > 0
}

/** Ganti secret. Integrasi lama langsung gagal verifikasi — itu tujuannya. */
export async function rotateWebhookSecret(input: {
  userId: string
  endpointId: string
}): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  const secret = newSecret()
  const res = await prisma.webhookEndpoint.updateMany({
    where: { id: input.endpointId, userId: input.userId },
    data: { secretEnc: encrypt(secret) },
  })
  if (res.count === 0) return { ok: false, error: 'Endpoint tidak ditemukan' }
  return { ok: true, secret }
}

/**
 * Kirim event `ping` sinkron ke satu endpoint (tombol "Kirim uji") dan
 * kembalikan hasilnya untuk ditampilkan langsung di UI.
 */
export async function sendTestEvent(input: {
  userId: string
  endpointId: string
}): Promise<
  | { ok: boolean; httpStatus: number | null; error: string | null }
  | { ok: false; error: string; notFound: true }
> {
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id: input.endpointId, userId: input.userId },
    select: { id: true, isActive: true },
  })
  if (!endpoint)
    return { ok: false, error: 'Endpoint tidak ditemukan', notFound: true }

  const envelope: WebhookEnvelope = buildEnvelope('ping', {
    message:
      'Uji koneksi dari Hulao — kalau kamu membaca ini, endpoint-mu bekerja.',
  })
  const row = await prisma.webhookDelivery.create({
    data: {
      endpointId: endpoint.id,
      eventType: 'ping',
      payload: envelope as unknown as object,
    },
    select: { id: true },
  })
  const outcome = await deliverOne(row.id)
  if (!outcome)
    return { ok: false, httpStatus: null, error: 'Delivery sedang diproses' }
  return outcome
}

/** Dipakai halaman riwayat delivery per endpoint. */
export async function listDeliveries(input: {
  userId: string
  endpointId: string
  take?: number
}) {
  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: { id: input.endpointId, userId: input.userId },
    select: { id: true },
  })
  if (!endpoint) return null
  return prisma.webhookDelivery.findMany({
    where: { endpointId: endpoint.id },
    orderBy: { createdAt: 'desc' },
    take: input.take ?? 20,
    select: {
      id: true,
      eventType: true,
      status: true,
      attempt: true,
      httpStatus: true,
      error: true,
      nextRetryAt: true,
      deliveredAt: true,
      createdAt: true,
    },
  })
}
