// POST /api/admin/host-templates/[id]/upload-video — ADMIN ONLY.
// Bypass Kling generate: admin upload MP4 langsung, jadi videoLoopUrl untuk
// TTS Host ATAU bisa juga dipake sebagai source untuk Klip Live (Sprint 3).
//
// Body: multipart/form-data { file: MP4, target?: 'videoLoop' | 'scene' }
//   target=videoLoop (default): set HostTemplate.videoLoopUrl, status READY
//   target=scene: bikin HostScene baru status READY (idle category default)
//
// Pakai mp4 path lokal /uploads/host-videos/<userId>/<id>.mp4 — pattern sama
// dengan Kling download di lib/services/host-gen/kling.ts.

import { randomBytes } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'

const MAX_BYTES = 50 * 1024 * 1024 // 50MB
const ALLOWED = ['video/mp4', 'video/quicktime', 'video/webm']
const HOST_VIDEO_DIR = path.join(process.cwd(), 'public', 'uploads', 'host-videos')

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireAdmin()
  } catch (res) {
    return res as NextResponse
  }

  const { id: hostTemplateId } = await params
  const host = await prisma.hostTemplate.findUnique({
    where: { id: hostTemplateId },
    select: { id: true, userId: true, status: true },
  })
  if (!host) return jsonError('Host template tidak ditemukan', 404)

  const form = await req.formData().catch(() => null)
  if (!form) return jsonError('Form invalid', 400)
  const file = form.get('file')
  if (!(file instanceof File)) return jsonError('File tidak ditemukan', 400)
  if (file.size > MAX_BYTES) {
    return jsonError(`Ukuran maksimal ${MAX_BYTES / 1024 / 1024} MB`, 400)
  }
  if (!ALLOWED.includes(file.type)) {
    return jsonError('Format harus MP4 / WebM / MOV', 400)
  }
  const target = String(form.get('target') ?? 'videoLoop')
  if (target !== 'videoLoop' && target !== 'scene') {
    return jsonError('target invalid (videoLoop | scene)', 400)
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const ownerDir = path.join(HOST_VIDEO_DIR, host.userId)
  await mkdir(ownerDir, { recursive: true })
  const filename = `${randomBytes(8).toString('hex')}.mp4`
  await writeFile(path.join(ownerDir, filename), buf)
  const publicPath = `/uploads/host-videos/${host.userId}/${filename}`

  if (target === 'videoLoop') {
    await prisma.hostTemplate.update({
      where: { id: hostTemplateId },
      data: {
        videoLoopUrl: publicPath,
        status: 'READY',
        errorMessage: null,
      },
    })
    return jsonOk({ target: 'videoLoop', url: publicPath })
  }

  // target === 'scene'
  const sceneName = String(form.get('sceneName') ?? `Upload ${new Date().toISOString().slice(0, 16)}`)
  const category = String(form.get('category') ?? 'idle')
  const scene = await prisma.hostScene.create({
    data: {
      hostTemplateId,
      userId: host.userId,
      name: sceneName,
      promptVideo: '(Admin upload — skip generate)',
      source: 'CUSTOM',
      category,
      videoUrl: publicPath,
      status: 'READY',
      isPrimary: false,
      isEnabled: true,
    },
    select: { id: true, name: true, videoUrl: true },
  })
  return jsonOk({ target: 'scene', scene })
}
