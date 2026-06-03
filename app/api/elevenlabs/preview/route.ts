// POST /api/elevenlabs/preview — quick TTS sample untuk preview voice
// sebelum commit ke generate clip full. Murah (~Rp 50-100).
//
// Body: { voiceId, text }
// Returns: { audioUrl } — MP3 di /uploads/clips-audio/<temp-id>.mp3
//
// Auto-delete file setelah 1 jam (cron — todo). Untuk MVP, biarkan saja.

import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { generateClipAudio } from '@/lib/services/clip-library/audio-gen'

const schema = z.object({
  voiceId: z.string().trim().min(8).max(80),
  text: z.string().trim().min(1).max(300),
})

export async function POST(req: Request) {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body invalid', 400)
  }

  try {
    const result = await generateClipAudio({
      text: parsed.data.text,
      voiceId: parsed.data.voiceId,
    })
    return jsonOk({ audioUrl: result.audioUrl, durationMs: result.durationMs })
  } catch (e) {
    return jsonError((e as Error).message, 500)
  }
}
