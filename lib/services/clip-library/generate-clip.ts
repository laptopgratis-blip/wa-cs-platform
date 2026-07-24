// Clip generate orchestrator — pipeline lengkap script → audio → lipsync → save.
//
// Flow (per klip):
//   1. Create LiveClip record status=DRAFT
//   2. status → GENERATING_AUDIO: ElevenLabs TTS → /uploads/clips-audio/<id>.mp3
//   3. status → GENERATING_VIDEO: build adaptive Kling prompt + submit lipsync
//   4. Poll Kling sampai COMPLETED → download MP4 → /uploads/clips/<id>.mp4
//   5. status → PROCESSING_EMBEDDING: OpenAI embed text → save embedding
//   6. status → READY
//
// Async pattern: submit returns clip ID immediately, status=GENERATING_*.
// Background poller (Sprint 5 - cron) advances state. Untuk MVP: synchronous
// poll inline (max 90 detik per klip).
//
// Cost (Sprint 5 - media-charge integration deferred):
//   ElevenLabs: ~Rp 100-300 per klip (script 50-200 char)
//   Kling lipsync (pro): ~Rp 1500-2500 per klip
//   OpenAI embedding: ~$0.00002 (negligible)

import { readFile } from 'node:fs/promises'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import type { ClipCategory, LiveClipStatus, ClipSource } from '@prisma/client'

import type { AudioGenResult } from '@/lib/services/host-gen/clip-types'

import { prisma } from '@/lib/prisma'
import { getAdaptivePromptForHost } from '@/lib/services/host-gen/adaptive-kling-prompt'
import {
  pollKlingLipsync,
  submitKlingLipsync,
} from '@/lib/services/host-gen/kling'
import { isTransientKlingTaskFailure } from '@/lib/services/host-gen/kling-retry'
import { computeMediaCharge, executeMediaSync } from '@/lib/services/media-charge'
import { transcodeVideoToWeb } from '@/lib/services/media/transcode'

import {
  generateClipAudio,
  listElevenLabsVoices,
  maxSafeCharsForDuration,
} from './audio-gen'
import { EMBED_MODEL, embedText } from './embed'

const CLIPS_DIR = path.join(process.cwd(), 'public', 'uploads', 'clips')
const CLIPS_URL_PREFIX = '/uploads/clips'

const POLL_INTERVAL_MS = 5_000
const POLL_TIMEOUT_MS = 300_000 // 5 menit max per lipsync (Kling sering 2-4 menit)
// Retry inline dibatasi 1 resubmit (lebih ketat dari MAX global 2) — pipeline
// ini ditunggu synchronous oleh POST /clips; tiap resubmit bisa menambah wall
// time sampai ~5 menit poll. 1 resubmit sudah menutup mayoritas transient.
const MAX_INLINE_LIPSYNC_RETRIES = 1

export interface GenerateClipInput {
  hostTemplateId: string
  userId: string
  script: string
  category: ClipCategory
  productId?: string | null
  tags?: string[]
  // Voice override per klip (default: HostTemplate.voiceId atau system default).
  voiceId?: string
  // Source Kling video reference — DISARANKAN pakai sourceVideoId dari recent
  // image2video task. Fallback: sourceVideoUrl absolute public URL.
  sourceVideoId?: string
  sourceVideoUrl?: string
  // Optional extra hint untuk adaptive prompt.
  ownerExtra?: string
}

export interface GenerateClipResult {
  clipId: string
  status: LiveClipStatus
  videoUrl?: string | null
  audioUrl?: string | null
  errorMessage?: string | null
  durationMs?: number | null
}

async function pollUntilDone(
  klingRequestId: string,
): Promise<{ videoUrl: string; durationSeconds: number }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const r = await pollKlingLipsync({ requestId: klingRequestId })
    if (r.status === 'COMPLETED' && r.videoUrl) {
      return { videoUrl: r.videoUrl, durationSeconds: r.durationSeconds ?? 0 }
    }
    if (r.status === 'FAILED') {
      throw new Error(`Kling lipsync failed: ${r.rawError ?? '?'}`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  throw new Error(`Kling lipsync timeout (>${POLL_TIMEOUT_MS / 1000}s)`)
}

async function downloadClipMp4(
  videoUrl: string,
  clipId: string,
): Promise<{ videoPath: string; bytes: number }> {
  const res = await fetch(videoUrl)
  if (!res.ok) throw new Error(`Download lipsync MP4 gagal HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await mkdir(CLIPS_DIR, { recursive: true })
  const filename = `${clipId}.mp4`
  const absPath = path.join(CLIPS_DIR, filename)
  await writeFile(absPath, buf)
  // Kompres ke bitrate web (≈5x lebih kecil, audio dipertahankan) supaya live
  // room mulus saat ganti klip di HP. Aman: gagal → file asli tetap dipakai.
  let bytes = buf.length
  try {
    const r = await transcodeVideoToWeb(absPath)
    if (r.afterBytes) bytes = r.afterBytes
  } catch {
    /* jangan gagalkan pipeline gara-gara transcode */
  }
  return { videoPath: `${CLIPS_URL_PREFIX}/${filename}`, bytes }
}

// Main pipeline. Synchronous flow — caller wait until READY atau FAILED.
// Update status DB di tiap step supaya UI bisa show progress.
export async function generateClip(
  input: GenerateClipInput,
): Promise<GenerateClipResult> {
  const script = input.script.trim()
  if (!script) throw new Error('Script kosong')
  if (script.length > 2500) throw new Error('Script max 2500 char per klip')

  // Validasi panjang script vs durasi baseline video host.
  // Cari baseline video duration (default 5dtk kalau gak ada).
  const baselineJob = await prisma.generationJob.findFirst({
    where: {
      hostTemplateId: input.hostTemplateId,
      type: 'HOST_VIDEO',
      status: 'DONE',
    },
    orderBy: { finishedAt: 'desc' },
    select: { inputPayload: true },
  })
  const baselineDurationSec =
    ((baselineJob?.inputPayload as { duration?: number } | null)?.duration ?? 5)
  const baselineDurationMs = baselineDurationSec * 1000
  const maxChars = maxSafeCharsForDuration(baselineDurationMs)
  if (script.length > maxChars) {
    throw new Error(
      `Script ${script.length} char terlalu panjang untuk video ${baselineDurationSec}dtk (max aman ${maxChars} char). Persingkat atau buat klip baru dengan baseline lebih panjang.`,
    )
  }

  // Step 1: create LiveClip DRAFT
  const clip = await prisma.liveClip.create({
    data: {
      hostTemplateId: input.hostTemplateId,
      userId: input.userId,
      scriptOriginal: script,
      transcript: script,
      category: input.category,
      tags: input.tags ?? [],
      productId: input.productId ?? null,
      source: 'GENERATED' as ClipSource,
      status: 'DRAFT' as LiveClipStatus,
    },
    select: { id: true },
  })
  const clipId = clip.id

  const fail = async (err: Error) => {
    await prisma.liveClip.update({
      where: { id: clipId },
      data: {
        status: 'FAILED' as LiveClipStatus,
        errorMessage: err.message.slice(0, 1000),
      },
    })
    return {
      clipId,
      status: 'FAILED' as LiveClipStatus,
      errorMessage: err.message,
    }
  }

  // Step 2: TTS audio — billed via KLIP_LIVE_TTS_ELEVENLABS per character.
  let audioResult: AudioGenResult
  try {
    await prisma.liveClip.update({
      where: { id: clipId },
      data: { status: 'GENERATING_AUDIO' as LiveClipStatus },
    })
    const ttsResult = await executeMediaSync({
      featureKey: 'KLIP_LIVE_TTS_ELEVENLABS',
      userId: input.userId,
      ctx: {
        referencePrefix: `klip_tts:${clipId}`,
        description: `Klip Live TTS — ${script.length} char`,
        subjectType: 'LIVE_CLIP',
        subjectId: clipId,
        units: script.length, // character count
        mediaCall: () =>
          generateClipAudio({
            text: script,
            voiceId: input.voiceId ?? '',
            clipIdHint: clipId,
          }),
      },
    })
    audioResult = ttsResult.result
    // Snapshot suara yang benar-benar dipakai — nama di-resolve best-effort
    // (kalau lookup ElevenLabs gagal, id tetap tersimpan; jangan gagalkan
    // pipeline hanya karena label display).
    let voiceName: string | null = null
    try {
      const voices = await listElevenLabsVoices()
      voiceName =
        voices.find((v) => v.voice_id === audioResult.voiceId)?.name ?? null
    } catch {
      /* label saja — abaikan */
    }
    await prisma.liveClip.update({
      where: { id: clipId },
      data: {
        audioUrl: audioResult.audioUrl,
        durationMs: audioResult.durationMs,
        voiceId: audioResult.voiceId,
        voiceName,
      },
    })
  } catch (e) {
    return fail(new Error(`Audio gen: ${(e as Error).message}`))
  }

  // Step 3: build adaptive Kling prompt + rakit input lipsync (sekali saja —
  // input yang sama dipakai ulang kalau submit di-retry di Step 4).
  let submitInput: Parameters<typeof submitKlingLipsync>[0]
  // Fallback source kalau sourceVideoId ditolak Kling code 1201 — Kling
  // menghapus video image2video lama (±30 hari), template lama pasti kena.
  let fallbackVideoUrl: string | null = null
  try {
    await prisma.liveClip.update({
      where: { id: clipId },
      data: { status: 'GENERATING_VIDEO' as LiveClipStatus },
    })
    const motionPrompt = await getAdaptivePromptForHost(
      input.hostTemplateId,
      {
        category: input.category as any,
        targetDurationMs: audioResult.durationMs,
      },
      input.ownerExtra,
    )

    // Audio source untuk Kling: prioritas public URL (ringan), fallback base64.
    // - Production (VPS): PUBLIC_BASE_URL ke domain publik → Kling fetch MP3 cepat.
    // - Dev (localhost) atau tidak ada PUBLIC_BASE_URL: kirim base64 inline.
    const publicBase =
      process.env.PUBLIC_BASE_URL?.trim() ||
      process.env.NEXTAUTH_URL?.trim() ||
      ''
    const isLocalBase =
      !publicBase ||
      publicBase.includes('localhost') ||
      publicBase.includes('127.') ||
      publicBase.includes('://192.168.') ||
      publicBase.includes('://10.')

    // Lipsync source: prioritas sourceVideoId (Kling-internal videos[0].id,
    // BUKAN task_id) → sourceVideoUrl (https Kling CDN 30-day valid URL).
    // Audio: URL kalau public base ada, base64 fallback untuk dev localhost.
    const toAbsoluteUrl = (u: string) =>
      u.startsWith('http') ? u : `${publicBase.replace(/\/$/, '')}${u}`
    submitInput = {
      prompt: motionPrompt,
    }
    if (input.sourceVideoId) {
      submitInput.sourceVideoId = input.sourceVideoId
    } else if (input.sourceVideoUrl) {
      submitInput.sourceVideoUrl = toAbsoluteUrl(input.sourceVideoUrl)
    } else {
      throw new Error('Generate-clip: butuh sourceVideoId atau sourceVideoUrl (resolve dari baseline)')
    }

    // Siapkan fallback URL: input.sourceVideoUrl atau salinan lokal baseline
    // (HostTemplate.videoLoopUrl). Relative path butuh public base yang bisa
    // di-fetch Kling — di dev localhost fallback dimatikan.
    const hostRow = await prisma.hostTemplate.findUnique({
      where: { id: input.hostTemplateId },
      select: { videoLoopUrl: true },
    })
    const rawFallback = input.sourceVideoUrl ?? hostRow?.videoLoopUrl ?? null
    fallbackVideoUrl =
      rawFallback && (rawFallback.startsWith('http') || !isLocalBase)
        ? toAbsoluteUrl(rawFallback)
        : null

    if (isLocalBase) {
      // Audio base64 — read dari disk, encode (MP3 ~100KB)
      const absAudioPath = path.join(
        process.cwd(),
        'public',
        audioResult.audioUrl.replace(/^\//, ''),
      )
      submitInput.audioBase64 = (await readFile(absAudioPath)).toString('base64')
    } else {
      submitInput.audioUrl = `${publicBase.replace(/\/$/, '')}${audioResult.audioUrl}`
    }

  } catch (e) {
    return fail(new Error(`Kling submit: ${(e as Error).message}`))
  }

  // Step 4: submit + poll dengan bounded auto-retry, lalu download + billing
  // Kling lipsync per detik output. Yang jalan SEKALI (di luar loop): TTS
  // (step 2, sudah di-charge — audio yang sama dipakai ulang), billing
  // lipsync, download, transcode, embedding.
  let videoPath: string
  try {
    let polled: { videoUrl: string; durationSeconds: number }
    let attempt = 0
    let triedUrlFallback = false
    for (;;) {
      let submitResult: Awaited<ReturnType<typeof submitKlingLipsync>>
      try {
        submitResult = await submitKlingLipsync(submitInput)
      } catch (submitErr) {
        const submitMsg = (submitErr as Error).message
        // Kling code 1201 "From video not found by id" = video image2video
        // sudah dihapus Kling (±30 hari). Ganti source ke salinan lokal
        // baseline (public URL) lalu resubmit — sekali saja.
        const isExpiredVideoId =
          submitMsg.includes('From video not found') ||
          submitMsg.includes('"code":1201')
        if (
          !triedUrlFallback &&
          isExpiredVideoId &&
          submitInput.sourceVideoId &&
          fallbackVideoUrl
        ) {
          triedUrlFallback = true
          console.warn(
            `[generate-clip ${clipId}] sourceVideoId kedaluwarsa di Kling — fallback ke baseline lokal ${fallbackVideoUrl}`,
          )
          submitInput = {
            ...submitInput,
            sourceVideoId: undefined,
            sourceVideoUrl: fallbackVideoUrl,
          }
          continue
        }
        throw submitErr
      }
      // klingJobId di-update tiap attempt supaya DB selalu menunjuk task
      // Kling yang sedang hidup.
      await prisma.liveClip.update({
        where: { id: clipId },
        data: { klingJobId: submitResult.requestId },
      })
      try {
        polled = await pollUntilDone(submitResult.requestId)
        break
      } catch (pollErr) {
        const msg = (pollErr as Error).message
        // Retry HANYA untuk task-level failure dari Kling ("Kling lipsync
        // failed: <task_status_msg>") yang transient. Local poll timeout
        // (>300s) TIDAK di-retry — task mungkin masih jalan di server Kling,
        // resubmit berarti dobel task + dobel biaya.
        const taskErr = msg.startsWith('Kling lipsync failed: ')
          ? msg.slice('Kling lipsync failed: '.length)
          : null
        if (
          taskErr &&
          isTransientKlingTaskFailure(taskErr) &&
          attempt < MAX_INLINE_LIPSYNC_RETRIES
        ) {
          attempt++
          console.warn(
            `[generate-clip ${clipId}] lipsync gagal transient ("${taskErr.slice(0, 80)}") — auto-retry ke-${attempt}`,
          )
          continue
        }
        throw attempt > 0
          ? new Error(`${msg} (sudah dicoba ${attempt + 1}× otomatis)`)
          : pollErr
      }
    }
    const downloaded = await downloadClipMp4(polled.videoUrl, clipId)
    videoPath = downloaded.videoPath
    const seconds = Math.max(1, Math.round(polled.durationSeconds || 0))
    // Bill Kling lipsync — compute & deduct (kalau saldo kurang setelah video
    // sudah jadi, tetap charge biar fair; user dapat klip).
    try {
      const charge = await computeMediaCharge({
        featureKey: 'KLIP_LIVE_LIPSYNC',
        units: seconds,
      })
      const { deductTokenAtomic, logGeneration } = await import('@/lib/services/ai-generation-log')
      await deductTokenAtomic({
        userId: input.userId,
        tokensCharged: charge.tokensCharged,
        description: `Klip Live Kling lipsync — ${seconds}dtk`,
        reference: `klip_lipsync:${clipId}`,
      })
      // Catat juga ke AiGenerationLog — tanpa ini biaya lipsync tidak
      // terlihat di analitik profitabilitas admin (hanya ada TokenTransaction).
      await logGeneration({
        featureKey: 'KLIP_LIVE_LIPSYNC',
        userId: input.userId,
        subjectType: 'LIVE_CLIP',
        subjectId: clipId,
        charge,
      })
    } catch (e) {
      console.warn(`[generate-clip ${clipId}] billing lipsync gagal (klip tetap save):`, (e as Error).message)
    }
    await prisma.liveClip.update({
      where: { id: clipId },
      data: {
        videoUrl: videoPath,
        durationMs: Math.round((polled.durationSeconds || 0) * 1000) || audioResult.durationMs,
      },
    })
  } catch (e) {
    return fail(new Error(`Kling poll/download: ${(e as Error).message}`))
  }

  // Step 5: embedding (Sprint 4) — embed transcript untuk matching layer.
  // Embed gagal bukan blocker untuk READY status; bisa retry via endpoint.
  await prisma.liveClip.update({
    where: { id: clipId },
    data: { status: 'PROCESSING_EMBEDDING' as LiveClipStatus },
  })
  try {
    const vec = await embedText(script)
    await prisma.liveClip.update({
      where: { id: clipId },
      data: {
        embedding: vec,
        embeddingModel: EMBED_MODEL,
        status: 'READY' as LiveClipStatus,
      },
    })
    // Billing embedding — negligible cost tapi tetap tracked.
    try {
      // Estimasi token ~script.length / 4 (rough char-to-token ratio Indo).
      const estimatedTokens = Math.max(10, Math.ceil(script.length / 4))
      const charge = await computeMediaCharge({
        featureKey: 'KLIP_LIVE_EMBED',
        units: estimatedTokens,
      })
      const { deductTokenAtomic: deduct2, logGeneration: log2 } = await import('@/lib/services/ai-generation-log')
      await deduct2({
        userId: input.userId,
        tokensCharged: charge.tokensCharged,
        description: `Klip Live embed transcript`,
        reference: `klip_embed:${clipId}`,
      })
      // Catat ke AiGenerationLog — konsisten dengan lipsync di atas.
      await log2({
        featureKey: 'KLIP_LIVE_EMBED',
        userId: input.userId,
        subjectType: 'LIVE_CLIP',
        subjectId: clipId,
        charge,
      })
    } catch (be) {
      console.warn(`[generate-clip ${clipId}] embed billing skip:`, (be as Error).message)
    }
  } catch (e) {
    console.warn(`[generate-clip ${clipId}] embed gagal (lanjut READY tanpa embed):`, (e as Error).message)
    await prisma.liveClip.update({
      where: { id: clipId },
      data: { status: 'READY' as LiveClipStatus },
    })
  }

  return {
    clipId,
    status: 'READY' as LiveClipStatus,
    videoUrl: videoPath,
    audioUrl: audioResult.audioUrl,
    durationMs: audioResult.durationMs,
  }
}
