// POST /api/whatsapp/waba/signup
// Mulai Embedded Signup (jalur FB JS SDK): buat state anti-CSRF dan kirim
// konfigurasi yang dibutuhkan client untuk FB.init + FB.login. App ID &
// Config ID Embedded Signup bukan rahasia (dipakai di browser), tapi diambil
// dari server supaya satu sumber kebenaran (env) tanpa NEXT_PUBLIC_*.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { getMetaConfig } from '@/lib/services/waba/config'
import { createSignupState } from '@/lib/services/waba/oauth'

export async function POST() {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  try {
    const cfg = getMetaConfig()
    if (!cfg.configId) {
      return jsonError(
        'META_CONFIG_ID kosong — buat konfigurasi Embedded Signup di Meta App dashboard',
        503,
      )
    }
    const state = createSignupState(session.user.id)
    return jsonOk({
      appId: cfg.appId,
      configId: cfg.configId,
      graphVersion: cfg.graphVersion,
      state,
    })
  } catch (err) {
    console.error('[POST /api/whatsapp/waba/signup] gagal:', err)
    return jsonError(
      (err as Error).message || 'Konfigurasi Meta belum lengkap di server',
      503,
    )
  }
}
