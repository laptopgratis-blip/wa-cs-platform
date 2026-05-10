// POST /api/content/ads/generate
// Body: { briefId?: string|null, items: [{ ideaId, platform: META_ADS|TIKTOK_ADS, format: IMAGE|VIDEO|CAROUSEL }] }
//
// Generate multiple ContentPiece bertipe ADS dari selected ideas. Sequential
// untuk avoid rate limit. Stop kalau saldo habis.
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { generateAdsPieceFromIdea } from '@/lib/services/content/ads-generate'

const PLATFORMS = ['META_ADS', 'TIKTOK_ADS'] as const
const FORMATS = ['IMAGE', 'VIDEO', 'CAROUSEL'] as const

const schema = z.object({
  briefId: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        ideaId: z.string(),
        platform: z.enum(PLATFORMS),
        format: z.enum(FORMATS),
      }),
    )
    .min(1)
    .max(10),
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
    platform: string
    format: string
    pieceId?: string
    title?: string
    tokensCharged?: number
    status: string
    error?: string
  }[] = []

  for (const item of parsed.data.items) {
    try {
      const r = await generateAdsPieceFromIdea({
        userId: session.user.id,
        briefId: parsed.data.briefId ?? null,
        ideaId: item.ideaId,
        platform: item.platform,
        format: item.format,
      })
      results.push({
        ideaId: item.ideaId,
        platform: item.platform,
        format: item.format,
        pieceId: r.piece?.id,
        title: r.piece?.title,
        tokensCharged: r.piece?.tokensCharged,
        status: r.status,
        error: r.errorMessage,
      })
      if (r.status === 'INSUFFICIENT_BALANCE') {
        const remaining = parsed.data.items.slice(
          parsed.data.items.indexOf(item) + 1,
        )
        for (const skip of remaining) {
          results.push({
            ideaId: skip.ideaId,
            platform: skip.platform,
            format: skip.format,
            status: 'SKIPPED_BALANCE',
          })
        }
        break
      }
    } catch (err) {
      results.push({
        ideaId: item.ideaId,
        platform: item.platform,
        format: item.format,
        status: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return jsonOk({ results })
}
