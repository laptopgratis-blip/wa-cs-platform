// Generate 2 extra IDLE clips utk Nisa biar rotation kerja.
// Pakai motion preset berbeda — pilih yang category 'subtle' dan 'playful'
// supaya beda visual dari clip IDLE existing (yang kemungkinan 'subtle').

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import path from 'node:path'

import { prisma } from '../lib/prisma'
import { getIdleMotionById } from '../lib/services/clip-library/idle-motions'
import {
  downloadKlingVideo,
  pollKlingStatus,
  submitKlingVideo,
} from '../lib/services/host-gen/kling'

const POLL_INTERVAL_MS = 5000
const POLL_TIMEOUT_MS = 300_000

async function generateOne(input: {
  hostTemplateId: string
  userId: string
  imageUrl: string
  motionId: string
}) {
  const motion = getIdleMotionById(input.motionId)
  if (!motion) throw new Error(`Motion ${input.motionId} not found`)
  console.log(`[gen ${motion.id}] start: ${motion.emoji} ${motion.label}`)

  const clip = await prisma.liveClip.create({
    data: {
      hostTemplateId: input.hostTemplateId,
      userId: input.userId,
      scriptOriginal: motion.label,
      transcript: motion.label,
      summary: `Idle motion: ${motion.emoji} ${motion.label}`,
      category: 'IDLE',
      tags: ['idle-motion', motion.category, motion.id],
      source: 'GENERATED',
      status: 'GENERATING_VIDEO',
    },
    select: { id: true },
  })

  const submission = await submitKlingVideo({
    imageUrl: input.imageUrl,
    prompt: motion.prompt,
    duration: motion.durationSec,
    mode: 'pro',
  })
  await prisma.liveClip.update({
    where: { id: clip.id },
    data: { klingJobId: submission.requestId },
  })

  const deadline = Date.now() + POLL_TIMEOUT_MS
  let videoUrl: string | null = null
  let durationSec = motion.durationSec
  while (Date.now() < deadline) {
    const status = await pollKlingStatus({ requestId: submission.requestId })
    if (status.status === 'COMPLETED' && status.videoUrl) {
      videoUrl = status.videoUrl
      durationSec = status.durationSeconds || motion.durationSec
      break
    }
    if (status.status === 'FAILED') {
      throw new Error(`Kling failed: ${status.rawError ?? '?'}`)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  if (!videoUrl) throw new Error('Kling timeout >5 menit')

  const dl = await downloadKlingVideo({ userId: input.userId, videoUrl })
  const clipsDir = path.join(process.cwd(), 'public', 'uploads', 'clips')
  await mkdir(clipsDir, { recursive: true })
  const finalPath = `/uploads/clips/${clip.id}.mp4`
  const absSource = path.join(process.cwd(), 'public', dl.videoPath.replace(/^\//, ''))
  const buf = await readFile(absSource)
  await writeFile(path.join(clipsDir, `${clip.id}.mp4`), buf)

  await prisma.liveClip.update({
    where: { id: clip.id },
    data: {
      status: 'READY',
      videoUrl: finalPath,
      durationMs: Math.round(durationSec * 1000),
    },
  })
  console.log(`[gen ${motion.id}] READY: ${finalPath}`)
  return clip.id
}

async function main() {
  const host = await prisma.hostTemplate.findFirst({
    where: { name: { contains: 'Nisa', mode: 'insensitive' } },
    select: { id: true, userId: true, sourceImageUrl: true },
  })
  if (!host?.sourceImageUrl) throw new Error('Nisa source image missing')

  const publicBase =
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    'http://localhost:3000'
  const imageUrl = host.sourceImageUrl.startsWith('http')
    ? host.sourceImageUrl
    : `${publicBase.replace(/\/$/, '')}${host.sourceImageUrl}`

  // Pilih 2 motion preset berbeda dari yang udah ada — variety visual.
  const motions = ['stretch-arms', 'peekaboo'] // subtle + playful

  // Run paralel — 2 Kling job submit bareng.
  const results = await Promise.allSettled(
    motions.map((m) =>
      generateOne({
        hostTemplateId: host.id,
        userId: host.userId,
        imageUrl,
        motionId: m,
      }),
    ),
  )
  for (const r of results) {
    if (r.status === 'fulfilled') console.log('OK:', r.value)
    else console.error('FAIL:', r.reason)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
