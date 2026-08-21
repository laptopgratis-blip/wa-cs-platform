// Kunci API publik milik SELLER — dipakai memanggil /api/v1/*.
//
// JANGAN tertukar dengan `model ApiKey` (kunci provider AI milik PLATFORM,
// dipakai lib/anthropic.ts). Yang ini milik user, dibuat sendiri dari
// /pengembang/api.
//
// Keputusan desain:
// - Simpan SHA-256 satu arah, bukan enkripsi: kalau DB bocor, hash tidak bisa
//   dipakai memanggil API. Konsekuensinya kunci penuh hanya bisa dilihat
//   SEKALI (respons POST) — itu memang yang diinginkan.
// - Tanpa salt/bcrypt: entropinya 256-bit dari CSPRNG (bukan password
//   manusia), jadi rainbow table tidak relevan; sebaliknya salt memaksa scan
//   seluruh tabel tiap request, sedangkan hash tanpa salt bisa di-index unik
//   → lookup O(1).
// - Cabut = soft (revokedAt), supaya jejak audit & lastUsedAt tetap ada.

import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { prisma } from '@/lib/prisma'

export const KEY_PREFIX_LIVE = 'hl_live_'
export const MAX_ACTIVE_KEYS_PER_USER = 5

// 32 byte → 43 char base64url. Total panjang kunci = 8 + 43 = 51.
const SECRET_BYTES = 32
const SECRET_LENGTH = 43
const FULL_KEY_LENGTH = KEY_PREFIX_LIVE.length + SECRET_LENGTH

// lastUsedAt di-update maksimal sekali per interval ini (lihat touchApiKeyUsage).
const TOUCH_INTERVAL_MS = 5 * 60 * 1000

export interface SellerApiKeyView {
  id: string
  name: string
  maskedKey: string
  createdAt: Date
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  scopes: string[]
  isActive: boolean
}

export type VerifyFailReason = 'malformed' | 'not_found' | 'revoked' | 'expired'

export type VerifyResult =
  | { ok: true; keyId: string; userId: string; name: string; scopes: string[] }
  | { ok: false; reason: VerifyFailReason }

/** SHA-256 hex dari kunci penuh. Deterministik — dipakai lookup by @unique. */
export function hashApiKey(fullKey: string): string {
  return createHash('sha256').update(fullKey, 'utf8').digest('hex')
}

function maskKey(keyPrefix: string, lastFour: string): string {
  return `${keyPrefix}${'•'.repeat(8)}${lastFour}`
}

function toView(row: {
  id: string
  name: string
  keyPrefix: string
  lastFour: string
  scopes: string[]
  createdAt: Date
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
}): SellerApiKeyView {
  const expired = row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()
  return {
    id: row.id,
    name: row.name,
    maskedKey: maskKey(row.keyPrefix, row.lastFour),
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    scopes: row.scopes,
    isActive: row.revokedAt === null && !expired,
  }
}

const VIEW_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  lastFour: true,
  scopes: true,
  createdAt: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
} as const

/**
 * Buat kunci baru. `plainKey` HANYA dikembalikan di sini dan tidak pernah bisa
 * dibaca lagi — jangan pernah di-log.
 */
export async function createSellerApiKey(input: {
  userId: string
  name: string
  expiresInDays?: number | null
}): Promise<{ ok: true; plainKey: string; key: SellerApiKeyView } | { ok: false; error: string }> {
  const name = input.name.trim()
  if (name.length < 2 || name.length > 60) {
    return { ok: false, error: 'Nama kunci harus 2–60 karakter' }
  }

  // Batas ditegakkan di service, bukan cuma di UI — request langsung ke API
  // tetap harus tertahan.
  const active = await prisma.sellerApiKey.count({
    where: { userId: input.userId, revokedAt: null },
  })
  if (active >= MAX_ACTIVE_KEYS_PER_USER) {
    return {
      ok: false,
      error: `Maksimal ${MAX_ACTIVE_KEYS_PER_USER} kunci aktif. Cabut salah satu kunci lama dulu.`,
    }
  }

  const secret = randomBytes(SECRET_BYTES).toString('base64url')
  const plainKey = `${KEY_PREFIX_LIVE}${secret}`
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null

  try {
    const row = await prisma.sellerApiKey.create({
      data: {
        userId: input.userId,
        name,
        keyHash: hashApiKey(plainKey),
        keyPrefix: plainKey.slice(0, 16),
        lastFour: plainKey.slice(-4),
        scopes: ['read'],
        expiresAt,
      },
      select: VIEW_SELECT,
    })
    return { ok: true, plainKey, key: toView(row) }
  } catch (err) {
    // Sengaja tidak menyertakan pesan asli ke pemanggil — err Prisma bisa
    // memuat potongan data baris.
    console.error('[seller-api-keys] gagal membuat kunci:', err)
    return { ok: false, error: 'Gagal membuat kunci API. Coba lagi.' }
  }
}

export async function listSellerApiKeys(userId: string): Promise<SellerApiKeyView[]> {
  const rows = await prisma.sellerApiKey.findMany({
    where: { userId },
    orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    select: VIEW_SELECT,
  })
  return rows.map(toView)
}

/** Cabut kunci (soft). false = kunci bukan milik user / sudah dicabut. */
export async function revokeSellerApiKey(input: {
  userId: string
  keyId: string
}): Promise<boolean> {
  const res = await prisma.sellerApiKey.updateMany({
    where: { id: input.keyId, userId: input.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return res.count > 0
}

/**
 * Verifikasi kunci mentah dari header Authorization. Guard bentuk dulu supaya
 * string sampah tidak menyentuh DB.
 */
export async function verifySellerApiKey(plainKey: string): Promise<VerifyResult> {
  if (
    typeof plainKey !== 'string' ||
    plainKey.length !== FULL_KEY_LENGTH ||
    !plainKey.startsWith(KEY_PREFIX_LIVE)
  ) {
    return { ok: false, reason: 'malformed' }
  }

  const keyHash = hashApiKey(plainKey)
  const row = await prisma.sellerApiKey.findUnique({
    where: { keyHash },
    select: { id: true, userId: true, name: true, scopes: true, keyHash: true, revokedAt: true, expiresAt: true },
  })
  if (!row) return { ok: false, reason: 'not_found' }

  // Perbandingan waktu-konstan. Praktis berlebihan (lookup sudah by index
  // unik, bukan loop), tapi murah dan menutup asumsi soal timing di driver.
  const a = Buffer.from(keyHash, 'hex')
  const b = Buffer.from(row.keyHash, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'not_found' }
  }

  if (row.revokedAt !== null) return { ok: false, reason: 'revoked' }
  if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: 'expired' }
  }

  return { ok: true, keyId: row.id, userId: row.userId, name: row.name, scopes: row.scopes }
}

// Throttle lapis-1: ingatan per proses supaya request beruntun tidak menyentuh
// DB sama sekali. Lapis-2 ada di query (guard lastUsedAt) untuk kasus
// multi-instance / restart.
const touchedAt = new Map<string, number>()

/**
 * Tandai kunci baru saja dipakai. Fire-and-forget — kegagalan update tidak
 * boleh menggagalkan request API. Maksimal 1 UPDATE per 5 menit per kunci.
 */
export function touchApiKeyUsage(keyId: string): void {
  const now = Date.now()
  const last = touchedAt.get(keyId)
  if (last !== undefined && now - last < TOUCH_INTERVAL_MS) return

  if (touchedAt.size > 500) touchedAt.clear()
  touchedAt.set(keyId, now)

  const cutoff = new Date(now - TOUCH_INTERVAL_MS)
  prisma.sellerApiKey
    .updateMany({
      where: {
        id: keyId,
        OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }],
      },
      data: { lastUsedAt: new Date(now) },
    })
    .catch((err) => console.error('[seller-api-keys] gagal update lastUsedAt:', err))
}
