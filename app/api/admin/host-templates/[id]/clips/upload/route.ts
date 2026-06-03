// POST /api/admin/host-templates/[id]/clips/upload — ADMIN ONLY.
// Admin upload MP4 clip (rekaman live asli) → Whisper transcribe → Claude suggest →
// LiveClip baru dengan source=UPLOADED status=READY.
//
// Body: multipart/form-data { file: MP4, category?: override-suggest, isEvergreen?, isDefaultIdle? }
// Returns: { clipId, transcript, suggestedCategory, suggestedTags, suggestedSummary }
//
// Cost: ~$0.006/menit Whisper + ~$0.001 Claude suggester = total <$0.05/clip.
// User-side TIDAK ada upload — wajib generate via Klip Live wizard (Sprint 2).

import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireAdmin } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { suggestClipMetadata } from '@/lib/services/clip-library/clip-suggester'
import { EMBED_MODEL, embedText } from '@/lib/services/clip-library/embed'
import { transcribeAudio } from '@/lib/services/clip-library/whisper'

const MAX_BYTES = 50 * 1024 * 1024 // 50MB
const ALLOWED = ['video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/wav']
const CLIPS_DIR = path.join(process.cwd(), 'public', 'uploads', 'clips')

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
    select: { id: true, userId: true, mode: true, status: true },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (host.mode !== 'NATIVE_LIBRARY') {
    return jsonError(
      'Host bukan mode Klip Live. Upload klip cuma untuk host NATIVE_LIBRARY.',
      400,
    )
  }

  const form = await req.formData().catch(() => null)
  if (!form) return jsonError('Form invalid', 400)
  const file = form.get('file')
  if (!(file instanceof File)) return jsonError('File tidak ditemukan', 400)
  if (file.size > MAX_BYTES) {
    return jsonError(`Ukuran maksimal ${MAX_BYTES / 1024 / 1024} MB`, 400)
  }
  if (!ALLOWED.includes(file.type)) {
    return jsonError('Format harus MP4/MOV/WebM atau MP3/WAV', 400)
  }

  // Override flags optional
  const categoryOverride = String(form.get('category') ?? '').trim() || null
  const isEvergreen = form.get('isEvergreen') === 'true'
  const isDefaultIdle = form.get('isDefaultIdle') === 'true'

  const buf = Buffer.from(await file.arrayBuffer())

  // Save MP4 to /uploads/clips/<id>.mp4
  await mkdir(CLIPS_DIR, { recursive: true })
  // Pakai prisma cuid generation untuk konsistensi penamaan
  const clipId = randomBytes(12).toString('hex') // tmp untuk filename, lalu pakai DB id
  const fileExt = file.type.includes('audio') ? '.mp3' : '.mp4'
  const filename = `${clipId}${fileExt}`
  await writeFile(path.join(CLIPS_DIR, filename), buf)
  const videoUrl = `/uploads/clips/${filename}`

  // Whisper transcribe
  let transcript: string
  let language: string | undefined
  try {
    const wr = await transcribeAudio(buf, filename, { language: 'id' })
    transcript = wr.text
    language = wr.language
  } catch (e) {
    return jsonError(`Whisper transcribe gagal: ${(e as Error).message}`, 500)
  }

  // Claude suggest category + tags + summary
  let suggested
  try {
    suggested = await suggestClipMetadata(transcript)
  } catch (e) {
    // Suggester gagal bukan blocker — bisa lanjut tanpa, owner edit manual.
    suggested = { category: 'GENERAL', summary: transcript.slice(0, 80), tags: [] }
    console.warn('[clip-upload] suggester failed (lanjut):', (e as Error).message)
  }

  // Override kalau admin set category eksplisit di form
  const finalCategory = categoryOverride || suggested.category

  // Embed transcript (best-effort — kalau gagal, clip tetap READY tanpa embed)
  let embedding: number[] | null = null
  try {
    embedding = await embedText(transcript)
  } catch (e) {
    console.warn('[clip-upload] embed gagal (lanjut tanpa embed):', (e as Error).message)
  }

  // Create LiveClip record
  const clip = await prisma.liveClip.create({
    data: {
      hostTemplateId,
      userId: host.userId,
      scriptOriginal: transcript,
      transcript,
      summary: suggested.summary,
      // @ts-expect-error — Prisma enum cast string
      category: finalCategory,
      tags: suggested.tags ?? [],
      source: 'UPLOADED',
      status: 'READY',
      videoUrl,
      // durationMs unknown sampai analyze MP4 metadata — defer ke nanti
      durationMs: null,
      isEvergreen,
      isDefaultIdle,
      // @ts-expect-error JSON column accepts number[]
      embedding: embedding ?? undefined,
      embeddingModel: embedding ? EMBED_MODEL : null,
    },
    select: { id: true },
  })

  return jsonOk({
    clipId: clip.id,
    transcript,
    language: language ?? null,
    suggestedCategory: suggested.category,
    finalCategory,
    suggestedSummary: suggested.summary,
    suggestedTags: suggested.tags,
    videoUrl,
  })
}
