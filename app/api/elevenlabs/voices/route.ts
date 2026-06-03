// GET /api/elevenlabs/voices — list voices yang ELEVENLABS key punya akses.
// Dipakai wizard Klip Live untuk dropdown voice selection.
//
// Auth: requireSession (apapun role bisa lihat — voice list publik dari ElevenLabs).

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { listElevenLabsVoices } from '@/lib/services/clip-library/audio-gen'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  try {
    const voices = await listElevenLabsVoices()
    return jsonOk({
      voices: voices.map((v) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category,
        labels: v.labels ?? {},
        preview_url: v.preview_url ?? null,
      })),
    })
  } catch (e) {
    return jsonError((e as Error).message, 500)
  }
}
