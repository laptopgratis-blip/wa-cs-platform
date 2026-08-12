// POST /api/whatsapp/waba/signup
// Mulai Embedded Signup: buat state anti-CSRF + URL dialog OAuth Meta.
// Frontend membuka URL ini di popup.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { buildSignupUrl, createSignupState } from '@/lib/services/waba/oauth'

export async function POST() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  try {
    const state = createSignupState(session.user.id)
    const url = buildSignupUrl(state)
    return jsonOk({ url })
  } catch (err) {
    console.error('[POST /api/whatsapp/waba/signup] gagal:', err)
    return jsonError(
      (err as Error).message || 'Konfigurasi Meta belum lengkap di server',
      503,
    )
  }
}
