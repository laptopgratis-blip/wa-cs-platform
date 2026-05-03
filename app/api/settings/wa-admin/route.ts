// GET /api/settings/wa-admin
// Public endpoint — return nomor WA admin saja (untuk frontend generate
// link wa.me konfirmasi transfer). Tidak expose setting lain.
import { NextResponse } from 'next/server'

import { getSetting, SETTING_KEYS } from '@/lib/settings'

export async function GET() {
  try {
    const waAdmin = await getSetting(SETTING_KEYS.WA_ADMIN)
    return NextResponse.json({
      success: true,
      data: {
        // Kosong artinya admin belum set — frontend tampilkan disabled state.
        waAdmin: waAdmin || null,
      },
    })
  } catch (err) {
    console.error('[GET /api/settings/wa-admin] gagal:', err)
    return NextResponse.json(
      { success: false, error: 'Terjadi kesalahan server' },
      { status: 500 },
    )
  }
}
