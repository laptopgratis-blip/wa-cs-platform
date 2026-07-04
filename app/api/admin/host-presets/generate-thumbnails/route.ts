// Thumbnail preset Klip Live (admin only).
//
// GET  → status { total, done, missing[] } — file dicek benar-benar ada di disk.
// POST → generate batch kecil (default 3, max 5) thumbnail yang belum ada.
//        Client (PresetThumbnailsCard) loop sampai remaining=0 — 1 gambar
//        Gemini ±10-20 dtk, jadi batch kecil supaya tidak kena proxy timeout.
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import {
  generatePresetThumbnail,
  getPresetThumbnailStatus,
} from '@/lib/services/host-gen/preset-thumbnails'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }
  try {
    const status = await getPresetThumbnailStatus()
    return jsonOk(status)
  } catch (err) {
    console.error('[GET /api/admin/host-presets/generate-thumbnails] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }

  let limit = 3
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: number }
    if (typeof body.limit === 'number' && Number.isFinite(body.limit)) {
      limit = Math.min(5, Math.max(1, Math.floor(body.limit)))
    }
  } catch {
    /* body kosong → pakai default */
  }

  try {
    const status = await getPresetThumbnailStatus()
    const batch = status.missing.slice(0, limit)

    const generated: Array<{ kind: string; slug: string; thumbnailUrl: string }> = []
    const failed: Array<{ kind: string; slug: string; error: string }> = []

    // Sequential (bukan parallel) — hindari burst rate-limit Gemini.
    for (const item of batch) {
      try {
        const res = await generatePresetThumbnail(item.kind, item.id)
        generated.push(res)
      } catch (err) {
        console.error(
          `[preset-thumbnails] gagal generate ${item.kind}:${item.slug}:`,
          err,
        )
        failed.push({
          kind: item.kind,
          slug: item.slug,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return jsonOk({
      generated,
      failed,
      remaining: status.missing.length - generated.length,
      total: status.total,
    })
  } catch (err) {
    console.error('[POST /api/admin/host-presets/generate-thumbnails] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}
