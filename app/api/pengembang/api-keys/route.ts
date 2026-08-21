// GET  /api/pengembang/api-keys — daftar kunci API milik user (tanpa kunci mentah)
// POST /api/pengembang/api-keys — buat kunci baru
//
// Auth = sesi dashboard (bukan Bearer). Ini SATU-SATUNYA tempat kunci mentah
// muncul di respons — jangan pernah console.log body/respons di file ini.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { consumeRateLimit } from '@/lib/rate-limit-memory'
import { createSellerApiKey, listSellerApiKeys } from '@/lib/services/seller-api-keys'
import { sellerApiKeyCreateSchema } from '@/lib/validations/seller-api-key'

export const dynamic = 'force-dynamic'

// Batas PERCOBAAN pembuatan kunci: 15 per jam per user — menghitung yang
// gagal juga (body invalid / sudah 5 kunci aktif). Kalau hanya yang sukses
// dihitung, user yang sudah mentok 5 kunci bisa memukul endpoint ini tanpa
// batas: tiap request tetap menjalankan count() ke DB tapi tak pernah
// menaikkan counter. consumeRateLimit dipakai supaya check+record atomik.
const CREATE_LIMIT = 15
const CREATE_WINDOW_MS = 60 * 60 * 1000

export async function GET() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  try {
    const keys = await listSellerApiKeys(session.user.id)
    return jsonOk({ keys })
  } catch (err) {
    console.error('[api-keys] gagal ambil daftar:', err)
    return jsonError('Gagal memuat daftar kunci API', 500)
  }
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const rate = consumeRateLimit({
    key: `apikey-create:${session.user.id}`,
    limit: CREATE_LIMIT,
    windowMs: CREATE_WINDOW_MS,
  })
  if (!rate.allowed) {
    const menit = Math.max(1, Math.ceil(rate.retryAfterMs / 60_000))
    return jsonError(`Terlalu banyak percobaan membuat kunci. Coba lagi dalam ${menit} menit.`, 429)
  }

  try {
    const body = await req.json().catch(() => null)
    const parsed = sellerApiKeyCreateSchema.safeParse(body)
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
    }

    const res = await createSellerApiKey({
      userId: session.user.id,
      name: parsed.data.name,
      expiresInDays: parsed.data.expiresInDays ?? null,
    })
    if (!res.ok) return jsonError(res.error)

    // plainKey hanya ada di sini, sekali seumur hidup kunci.
    return jsonOk({ plainKey: res.plainKey, key: res.key }, 201)
  } catch (err) {
    console.error('[api-keys] gagal membuat kunci:', err)
    return jsonError('Gagal membuat kunci API', 500)
  }
}
