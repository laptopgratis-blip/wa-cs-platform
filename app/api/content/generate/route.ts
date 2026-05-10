// POST /api/content/generate
// Body: { briefId: string, items: [{ ideaId: string, channel: string }] }
//
// Generate multiple ContentPiece dari selected ideas. Sequential AI call
// untuk avoid rate limit & supaya progress bisa di-track per piece.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import {
  type Channel,
  generatePieceFromIdea,
} from '@/lib/services/content/generate'

const VALID_CHANNELS = [
  'WA_STATUS',
  'IG_STORY',
  'IG_POST',
  'IG_CAROUSEL',
  'IG_REELS',
  'TIKTOK',
] as const

const schema = z.object({
  briefId: z.string(),
  items: z
    .array(
      z.object({
        ideaId: z.string(),
        channel: z.enum(VALID_CHANNELS),
      }),
    )
    .min(1)
    .max(20),
})

export const maxDuration = 280

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')

  const results: {
    ideaId: string
    channel: string
    pieceId?: string
    title?: string
    tokensCharged?: number
    status: string
    error?: string
  }[] = []

  // Sequential — kalau saldo habis di tengah, stop sisanya.
  for (const item of parsed.data.items) {
    try {
      const r = await generatePieceFromIdea({
        userId: session.user.id,
        briefId: parsed.data.briefId,
        ideaId: item.ideaId,
        channel: item.channel as Channel,
      })
      results.push({
        ideaId: item.ideaId,
        channel: item.channel,
        pieceId: r.piece?.id,
        title: r.piece?.title,
        tokensCharged: r.piece?.tokensCharged,
        status: r.status,
        error: r.errorMessage,
      })
      // Stop kalau insufficient balance — sisanya pasti gagal juga.
      if (r.status === 'INSUFFICIENT_BALANCE') {
        // Mark sisanya skipped supaya UI tau.
        const remaining = parsed.data.items.slice(
          parsed.data.items.indexOf(item) + 1,
        )
        for (const skip of remaining) {
          results.push({
            ideaId: skip.ideaId,
            channel: skip.channel,
            status: 'SKIPPED_BALANCE',
          })
        }
        break
      }
    } catch (err) {
      results.push({
        ideaId: item.ideaId,
        channel: item.channel,
        status: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return jsonOk({ results })
}
