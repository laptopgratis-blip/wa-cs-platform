// GET /api/clip-library/idle-motions — daftar 30 IDLE motion preset untuk
// dropdown UI. Tidak butuh hostId (preset library global).

import type { NextResponse } from 'next/server'

import { jsonOk, requireSession } from '@/lib/api'
import { IDLE_MOTIONS, IDLE_MOTION_CATEGORIES } from '@/lib/services/clip-library/idle-motions'

export async function GET() {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  return jsonOk({
    motions: IDLE_MOTIONS.map((m) => ({
      id: m.id,
      label: m.label,
      category: m.category,
      emoji: m.emoji,
      durationSec: m.durationSec,
    })),
    categories: IDLE_MOTION_CATEGORIES,
  })
}
