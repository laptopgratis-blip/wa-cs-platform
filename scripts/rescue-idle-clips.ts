// Recovery untuk 2 IDLE clip Nisa yang stuck GENERATING_VIDEO setelah script
// timeout. Kling job mungkin masih jalan di background — poll lagi 10 menit.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { prisma } from '../lib/prisma'
import { downloadKlingVideo, pollKlingStatus } from '../lib/services/host-gen/kling'

const POLL_INTERVAL_MS = 8000
const POLL_TIMEOUT_MS = 600_000 // 10 menit

async function rescueOne(clipId: string) {
  const clip = await prisma.liveClip.findUnique({
    where: { id: clipId },
    select: { klingJobId: true, userId: true, scriptOriginal: true },
  })
  if (!clip?.klingJobId) {
    console.log(`[${clipId}] no klingJobId, skip`)
    return
  }
  console.log(`[${clipId}] poll kling job ${clip.klingJobId} (${clip.scriptOriginal})`)
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let videoUrl: string | null = null
  let durationSec = 5
  while (Date.now() < deadline) {
    const status = await pollKlingStatus({ requestId: clip.klingJobId })
    console.log(`[${clipId}] status: ${status.status}`)
    if (status.status === 'COMPLETED' && status.videoUrl) {
      videoUrl = status.videoUrl
      durationSec = status.durationSeconds || 5
      break
    }
    if (status.status === 'FAILED') {
      await prisma.liveClip.update({
        where: { id: clipId },
        data: { status: 'FAILED', errorMessage: status.rawError ?? 'Kling failed' },
      })
      console.log(`[${clipId}] FAILED`)
      return
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  if (!videoUrl) {
    console.log(`[${clipId}] timeout >10 menit`)
    return
  }

  const dl = await downloadKlingVideo({ userId: clip.userId, videoUrl })
  const clipsDir = path.join(process.cwd(), 'public', 'uploads', 'clips')
  await mkdir(clipsDir, { recursive: true })
  const finalPath = `/uploads/clips/${clipId}.mp4`
  const buf = await import('node:fs/promises').then((m) =>
    m.readFile(path.join(process.cwd(), 'public', dl.videoPath.replace(/^\//, ''))),
  )
  await writeFile(path.join(clipsDir, `${clipId}.mp4`), buf)
  await prisma.liveClip.update({
    where: { id: clipId },
    data: {
      status: 'READY',
      videoUrl: finalPath,
      durationMs: Math.round(durationSec * 1000),
    },
  })
  console.log(`[${clipId}] READY: ${finalPath}`)
}

async function main() {
  const stuck = await prisma.liveClip.findMany({
    where: {
      hostTemplate: { name: 'Nisa' },
      category: 'IDLE',
      status: 'GENERATING_VIDEO',
      klingJobId: { not: null },
    },
    select: { id: true },
  })
  console.log(`Found ${stuck.length} stuck idle clips`)
  await Promise.allSettled(stuck.map((c) => rescueOne(c.id)))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
