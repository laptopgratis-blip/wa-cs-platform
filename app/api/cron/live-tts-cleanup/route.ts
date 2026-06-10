// POST or GET /api/cron/live-tts-cleanup
//
// Hapus file cache TTS live room (public/uploads/live-tts/) yang lebih tua
// dari 14 hari. File adalah cache by content-hash — kalau teks yang sama
// dibutuhkan lagi setelah dihapus, TTS di-generate ulang (biaya kecil).
// Tanpa cleanup, folder tumbuh ~10 MB/jam per room aktif (739 MB per
// 2026-06-10) dan lama-lama memakan disk VPS.
//
// Setup eksternal: crontab host via hulao-cron-call.sh live-tts-cleanup,
// frequency: daily.
import { readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'

import { NextResponse } from 'next/server'

import { requireCronAuth } from '@/lib/cron-auth'

const TTS_DIR = path.join(process.cwd(), 'public', 'uploads', 'live-tts')
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

async function handle(req: Request) {
  const authErr = requireCronAuth(req)
  if (authErr) return authErr

  const cutoff = Date.now() - MAX_AGE_MS
  let deleted = 0
  let freedBytes = 0
  let kept = 0

  let names: string[]
  try {
    names = await readdir(TTS_DIR)
  } catch {
    // Folder belum ada (belum pernah ada sesi live) — bukan error.
    return NextResponse.json({
      success: true,
      data: { deleted: 0, kept: 0, freedBytes: 0 },
    })
  }

  for (const name of names) {
    if (!name.endsWith('.mp3')) continue
    const abs = path.join(TTS_DIR, name)
    try {
      const s = await stat(abs)
      if (s.mtimeMs < cutoff) {
        await unlink(abs)
        deleted++
        freedBytes += s.size
      } else {
        kept++
      }
    } catch {
      // File hilang di tengah iterasi (race dgn generate) — abaikan.
    }
  }

  return NextResponse.json({
    success: true,
    data: { deleted, kept, freedBytes },
  })
}

export async function POST(req: Request) {
  return handle(req)
}

export async function GET(req: Request) {
  return handle(req)
}
