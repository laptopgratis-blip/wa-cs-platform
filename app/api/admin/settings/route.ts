// GET   /api/admin/settings — semua settings (key → value)
// PATCH /api/admin/settings — body { key, value } update satu setting
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { getAllSettings, SETTING_KEYS, setSetting, type SettingKey } from '@/lib/settings'

const validKeys = Object.values(SETTING_KEYS) as [SettingKey, ...SettingKey[]]

const patchSchema = z.object({
  key: z.enum(validKeys),
  value: z.string().trim().max(500),
})

// Validator khusus per key — supaya frontend gak bisa simpan junk.
function validateValue(key: SettingKey, value: string): string | null {
  if (key === 'WA_ADMIN' && value) {
    if (!/^\d{10,15}$/.test(value)) {
      return 'Nomor WA harus 10-15 digit angka, format internasional tanpa + (mis. 6281234567890)'
    }
  }
  if (key === 'SUPPORT_EMAIL' && value) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'Format email tidak valid'
    }
  }
  if (key === 'PLATFORM_NAME' && value && value.length < 2) {
    return 'Nama platform minimal 2 karakter'
  }
  return null
}

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const settings = await getAllSettings()
    return jsonOk(settings)
  } catch (err) {
    console.error('[GET /api/admin/settings] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function PATCH(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  const { key, value } = parsed.data
  const validationError = validateValue(key, value)
  if (validationError) return jsonError(validationError)

  try {
    await setSetting(key, value)
    return jsonOk({ key, value })
  } catch (err) {
    console.error('[PATCH /api/admin/settings] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
