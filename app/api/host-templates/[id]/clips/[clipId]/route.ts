// PATCH /api/host-templates/[id]/clips/[clipId] — edit metadata klip
//   (transcript, category, tags, isActive, isEvergreen, isDefaultIdle, summary)
// DELETE /api/host-templates/[id]/clips/[clipId] — delete klip (file di disk
//   TIDAK dihapus untuk audit; cleanup terpisah). Jika klip dipakai (useCount>0)
//   force=true required.
// Klip yang masih diproses job background / cron (isClipBusy) tidak boleh
// dihapus/diedit → 409. Job tetap jalan & memotong token untuk klip yang sudah
// hilang, dan guard anti klik-ganda di clip-start.ts jadi bolong (2026-10-22).

import { unlink } from 'node:fs/promises'
import path from 'node:path'

import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { isClipBusy } from '@/lib/services/clip-library/clip-job-rules'
import { LATE_MARKERS } from '@/lib/services/clip-library/clip-stale-sweep'

const BUSY_MESSAGE =
  'Klip masih diproses — tunggu sampai selesai atau gagal dulu.'

const patchSchema = z.object({
  transcript: z.string().trim().min(1).max(2500).optional(),
  summary: z.string().trim().max(200).optional().nullable(),
  category: z
    .enum([
      'GREETING',
      'PRODUCT_DEMO',
      'PRICE',
      'OBJECTION',
      'CLOSING',
      'IDLE',
      'GENERAL',
    ])
    .optional(),
  tags: z.array(z.string().max(40)).max(10).optional(),
  productId: z.string().cuid().nullable().optional(),
  isActive: z.boolean().optional(),
  isEvergreen: z.boolean().optional(),
  isDefaultIdle: z.boolean().optional(),
  // Manual routing fields
  triggerKeywords: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  matchMode: z.enum(['COSINE', 'KEYWORD_FIRST', 'KEYWORD_ONLY', 'BOOST']).optional(),
  manualConfidence: z.number().min(0).max(1).nullable().optional(),
})

async function loadAuthorize(
  hostTemplateId: string,
  clipId: string,
  userId: string,
  isAdmin: boolean,
) {
  const clip = await prisma.liveClip.findUnique({
    where: { id: clipId },
    select: {
      id: true,
      hostTemplateId: true,
      userId: true,
      videoUrl: true,
      audioUrl: true,
      useCount: true,
      isDefaultIdle: true,
      status: true,
      klingJobId: true,
      errorMessage: true,
      updatedAt: true,
    },
  })
  if (!clip || clip.hostTemplateId !== hostTemplateId) {
    throw new Error('Klip tidak ditemukan')
  }
  if (!isAdmin && clip.userId !== userId) {
    throw new Error('Tidak punya akses')
  }
  return clip
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; clipId: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id, clipId } = await params

  let existing
  try {
    existing = await loadAuthorize(id, clipId, session.user.id, session.user.role === 'ADMIN')
  } catch (e) {
    return jsonError((e as Error).message, 403)
  }

  if (isClipBusy(existing, LATE_MARKERS)) return jsonError(BUSY_MESSAGE, 409)

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body invalid', 400)
  }
  const data = parsed.data

  // isDefaultIdle harus unique per host — kalau set ke true, unset yg lain.
  if (data.isDefaultIdle === true) {
    await prisma.liveClip.updateMany({
      where: {
        hostTemplateId: id,
        id: { not: clipId },
        isDefaultIdle: true,
      },
      data: { isDefaultIdle: false },
    })
  }

  const updated = await prisma.liveClip.update({
    where: { id: clipId },
    data,
    select: {
      id: true,
      transcript: true,
      summary: true,
      category: true,
      tags: true,
      productId: true,
      isActive: true,
      isEvergreen: true,
      isDefaultIdle: true,
      triggerKeywords: true,
      matchMode: true,
      manualConfidence: true,
    },
  })
  return jsonOk({ clip: updated })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; clipId: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id, clipId } = await params

  let existing
  try {
    existing = await loadAuthorize(id, clipId, session.user.id, session.user.role === 'ADMIN')
  } catch (e) {
    return jsonError((e as Error).message, 403)
  }

  if (isClipBusy(existing, LATE_MARKERS)) return jsonError(BUSY_MESSAGE, 409)

  const url = new URL(req.url)
  const force = url.searchParams.get('force') === 'true'

  if (existing.useCount > 0 && !force) {
    return jsonError(
      `Klip ini sudah dipakai ${existing.useCount}x oleh customer. Tambah ?force=true kalau yakin hapus.`,
      409,
    )
  }

  // Hapus file di disk (best-effort, audit log tetap di DB via LiveClipUsage).
  if (existing.videoUrl) {
    try {
      await unlink(path.join(process.cwd(), 'public', existing.videoUrl.replace(/^\//, '')))
    } catch {
      /* ignore — file mungkin sudah tidak ada */
    }
  }
  if (existing.audioUrl) {
    try {
      await unlink(path.join(process.cwd(), 'public', existing.audioUrl.replace(/^\//, '')))
    } catch {
      /* ignore */
    }
  }

  await prisma.liveClip.delete({ where: { id: clipId } })
  return jsonOk({ deleted: clipId })
}
