// Orkestrasi GenerationJob lifecycle:
//   1. enqueueImageJob() — sync Gemini call, deduct token, simpan path
//   2. enqueueVideoJob() — submit Fal.ai, return request_id; charge baru di
//      settleVideoCharge saat cron poll selesai
//   3. pollAndFinalizePendingVideos() — dipanggil cron tiap menit
//
// Pattern serial dalam 1 user, tapi job lain user paralel — di MVP gak ada
// concurrency limit. Pas Skala besar tambah lock di GenerationJob.
import { HostTemplateStatus, GenerationJobStatus } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  assertVideoBudgetOk,
  executeMediaSync,
  settleVideoCharge,
} from '@/lib/services/media-charge'

import {
  downloadKlingVideo,
  fetchKlingResult,
  pollKlingStatus,
  submitKlingVideo,
  DEFAULT_KLING_MODEL,
} from './kling'
import { fileToBase64, generateHostImage } from './gemini-image'

export const HOST_IMAGE_FEATURE_KEY = 'HOST_IMAGE_GEMINI_NANO'
export const HOST_VIDEO_FEATURE_KEY = 'HOST_VIDEO_KLING_V3'

// ── KLIP LIVE AUTO-PREP (NATIVE_LIBRARY host setelah image ready) ──────
// Fire-and-forget background prep:
//   1. Vision analyze image (Claude Vision ~8dtk)
//   2. Generate baseline silent loop video (Kling image2video ~60-90dtk async)
//      Hasilnya: HostTemplate.videoLoopUrl + GenerationJob.providerTaskId yang
//      dipakai sebagai sourceVideoId untuk semua klip lipsync nanti.
// Quality wrapper — fixed rules netral, dipakai semua varian.
// Tidak mention pose tangan spesifik biar gak konflik sama motion script.
const BASELINE_QUALITY_WRAPPER = `Silent video, no audio, no lip-sync, mouth stays closed with soft natural smile (NO speech motion, NO mouth opening).

CAMERA: completely static, no pan, no zoom, no cut.

VISUAL HOOK STABILITY: hat/hijab/glasses/accessories stay attached and follow head movement naturally (not floating, not falling off).

BACKGROUND: motion elements (workers, conveyor, traffic, fabric drape — whatever was in source image) continue their loop. Static elements stay static.

LOOP: host returns to roughly starting pose by final frame so clip loops smoothly.

QUALITY: photorealistic, alive, expressive face. ABSOLUTELY AVOID stiff/robotic/statue poses, blank face, dead eyes.`

// 3 baseline variants — motion script SANGAT BERBEDA biar lipsync klip varia.
// PENTING: tiap motion script harus STANDALONE — TIDAK boleh share pose awal
// yang sama (kalau semua mulai dengan "wave" Kling akan generate clip yg mirip).
const BASELINE_VARIANTS: Array<{
  name: string
  category: 'idle' | 'greeting' | 'product'
  motionScript: string
}> = [
  {
    name: 'Baseline A — Welcome Wave',
    category: 'greeting',
    motionScript: `MOTION SCRIPT — WELCOMING HOST (greeting energy):
START POSE (frame 0): host stands centered, both hands relaxed at sides, soft welcoming smile.
SECONDS 0-3: right hand rises and waves warmly side-to-side at face level (3 waves), head tilts gently with each wave.
SECONDS 3-6: hand drops to chest-level, both palms turn upward in inviting gesture, head nods welcomingly.
SECONDS 6-10: both hands sweep outward in wide welcoming gesture, then return to starting pose.
ENERGY: warm, hospitable, "selamat datang kakak" vibe. Smile is the main expression. Medium tempo.`,
  },
  {
    name: 'Baseline B — Explaining Point',
    category: 'product',
    motionScript: `MOTION SCRIPT — EXPLAINER HOST (product demo energy):
START POSE (frame 0): host stands centered, RIGHT HAND already raised at chest level with index finger pointed up (counting "satu"), left hand resting at hip. NO wave gesture.
SECONDS 0-4: right hand counts off fingers slowly — index → index+middle → three fingers, as if explaining 3 product benefits. Head nods enthusiastically with each count.
SECONDS 4-7: right hand pivots to point sideways toward imaginary product display (off-frame right), eyes follow finger, eyebrows raised explaining.
SECONDS 7-10: both hands come together at chest level palms-up emphasis "ini bagus lho", returns to start pose.
ENERGY: explanatory, demonstrative, teacher-vibe. Mouth closed with knowing smile. NO WAVING anywhere. Slower deliberate tempo.`,
  },
  {
    name: 'Baseline C — Energetic Closing',
    category: 'idle',
    motionScript: `MOTION SCRIPT — HYPE HOST (urgency/closing energy):
START POSE (frame 0): host stands in slight athletic stance, BOTH FISTS clenched at chest level (boxer ready pose), wide excited grin. NO wave, NO open palm.
SECONDS 0-3: right fist punches forward toward camera (pointing energy), left fist follows, body bounces slightly with each punch. 3 quick punches.
SECONDS 3-6: both arms shoot UP overhead in fist-pump celebration, body bounces twice, head shakes side-to-side excitedly.
SECONDS 6-10: right hand drops to point repeatedly at camera ("YOU! YES YOU!"), left hand makes urgent "come here" beckoning, returns to athletic stance.
ENERGY: urgent, hyped, flash-sale-closer vibe. Eyebrows MAXIMUM raise, eyes wide. NO WAVING. Fast bouncy tempo with visible body bobs.`,
  },
]

function buildVariantPrompt(motionScript: string): string {
  return `${motionScript}\n\n---\n\n${BASELINE_QUALITY_WRAPPER}`
}

// Step 1: vision-only (cheap ~$0.01, jalan otomatis setelah image ready).
// Output disimpan di HostTemplate.visionAnalysis untuk re-use di adaptive prompt.
export async function autoVisionAnalyzeHost(hostTemplateId: string): Promise<void> {
  try {
    const { analyzeHostImage } = await import('./vision-analyzer')
    await analyzeHostImage(hostTemplateId)
    console.log(`[autoVisionAnalyzeHost ${hostTemplateId}] vision OK`)
  } catch (e) {
    console.warn(`[autoVisionAnalyzeHost ${hostTemplateId}] vision gagal:`, (e as Error).message)
  }
}

// Variant metadata utk preview UI (dipanggil endpoint /baselines/variants).
export interface BaselineVariantPreview {
  key: 'A' | 'B' | 'C'
  name: string
  category: 'idle' | 'greeting' | 'product'
  description: string
  motionScript: string
}
export function listBaselineVariants(): BaselineVariantPreview[] {
  return BASELINE_VARIANTS.map((v, i) => ({
    key: (['A', 'B', 'C'] as const)[i]!,
    name: v.name,
    category: v.category,
    description:
      v.category === 'greeting'
        ? 'Sapa & wave — cocok untuk klip GREETING / WELCOME / SMALL_TALK'
        : v.category === 'product'
        ? 'Pointing & explain — cocok untuk klip PRODUCT_DEMO / FAQ / FEATURES'
        : 'Hype & closing — cocok untuk klip CTA / URGENCY / IDLE bouncy',
    motionScript: v.motionScript,
  }))
}

// Custom baseline dari UI composer — admin edit motion script bebas + bisa
// generate kapan pun, berapa pun. Quality wrapper tetap auto-append.
export interface CustomBaselineInput {
  name: string
  category: 'idle' | 'greeting' | 'product'
  motionScript: string // motion script mentah (TANPA quality wrapper)
}

// Step 2: generate baseline videos — MANUAL trigger via /api/.../baselines/generate.
// Sebelumnya auto-spawn di IMAGE_READY → boros kalau motion script salah.
// Sekarang admin preview/edit dulu di UI, baru confirm → call function ini.
//
// Dua mode input:
//   - customBaselines: list {name, category, motionScript} hasil edit di UI
//     (diutamakan). motionScript di-wrap quality wrapper di sini.
//   - variantKeys: legacy — pakai 3 preset hardcoded A/B/C (kalau custom kosong).
export async function generateBaselineVideos(input: {
  hostTemplateId: string
  userId: string
  variantKeys?: Array<'A' | 'B' | 'C'>
  customBaselines?: CustomBaselineInput[]
}): Promise<{ submitted: number; sceneIds: string[] }> {
  const host = await prisma.hostTemplate.findUnique({
    where: { id: input.hostTemplateId },
    select: { sourceImageUrl: true },
  })
  if (!host?.sourceImageUrl) throw new Error('Source image belum ada')

  const publicBase =
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    'http://localhost:3000'
  const imageUrl = host.sourceImageUrl.startsWith('http')
    ? host.sourceImageUrl
    : `${publicBase.replace(/\/$/, '')}${host.sourceImageUrl}`

  // Bangun daftar pekerjaan baseline dari custom (diutamakan) atau preset.
  type BaselineJob = {
    name: string
    category: 'idle' | 'greeting' | 'product'
    fullPrompt: string
    description: string
    markPrimary: boolean
  }
  const jobs: BaselineJob[] = []
  if (input.customBaselines && input.customBaselines.length > 0) {
    for (const cb of input.customBaselines) {
      const motion = cb.motionScript.trim()
      if (!motion) continue
      jobs.push({
        name: (cb.name.trim() || 'Baseline custom').slice(0, 120),
        category: cb.category,
        fullPrompt: buildVariantPrompt(motion),
        description: 'Baseline custom (motion script di-edit di composer)',
        // Poll auto-assign primary ke scene READY pertama kalau belum ada —
        // jadi aman set false di sini, tidak perlu rebut primary.
        markPrimary: false,
      })
    }
  } else {
    const wanted = input.variantKeys ?? ['A', 'B', 'C']
    for (let i = 0; i < BASELINE_VARIANTS.length; i++) {
      const variant = BASELINE_VARIANTS[i]!
      const variantKey = (['A', 'B', 'C'] as const)[i]!
      if (!wanted.includes(variantKey)) continue
      jobs.push({
        name: variant.name,
        category: variant.category,
        fullPrompt: buildVariantPrompt(variant.motionScript),
        description: `Baseline variant ${variantKey} untuk Klip Live lipsync rotation`,
        markPrimary: variantKey === 'A',
      })
    }
  }

  const sceneIds: string[] = []
  let lastError: Error | null = null

  for (const job of jobs) {
    try {
      const baselineScene = await prisma.hostScene.create({
        data: {
          hostTemplateId: input.hostTemplateId,
          userId: input.userId,
          name: job.name,
          description: job.description,
          promptVideo: job.fullPrompt,
          source: 'CUSTOM',
          category: job.category,
          isPrimary: job.markPrimary,
          isEnabled: true,
          status: 'DRAFT',
        },
        select: { id: true },
      })
      await enqueueVideoJob({
        userId: input.userId,
        hostTemplateId: input.hostTemplateId,
        hostSceneId: baselineScene.id,
        imageUrl,
        promptMotion: job.fullPrompt,
        durationSeconds: 10,
        publicBaseUrl: publicBase,
        klingMode: 'pro',
      })
      // Hitung submitted HANYA kalau Kling job benar-benar ter-enqueue.
      sceneIds.push(baselineScene.id)
      console.log(`[generateBaselineVideos] ${job.name} submitted`)
    } catch (e) {
      lastError = e as Error
      console.error(
        `[generateBaselineVideos] ${job.name} gagal:`,
        lastError.message,
      )
    }
  }
  // Kalau SEMUA varian gagal submit, lempar errornya supaya UI tampil error
  // jelas — bukan spinner abadi menunggu baseline yang tak pernah ter-submit.
  if (sceneIds.length === 0 && lastError) throw lastError
  return { submitted: sceneIds.length, sceneIds }
}

// ── IMAGE (sync) ─────────────────────────────────────────────────────────
export async function enqueueAndRunImageJob(input: {
  userId: string
  hostTemplateId: string
  prompt: string
  referenceImageUrls: string[] // path public-relative `/uploads/...`
}): Promise<{ jobId: string; imageUrl: string }> {
  // Update template status → GENERATING_IMAGE.
  await prisma.hostTemplate.update({
    where: { id: input.hostTemplateId },
    data: { status: HostTemplateStatus.GENERATING_IMAGE, errorMessage: null },
  })

  const job = await prisma.generationJob.create({
    data: {
      userId: input.userId,
      hostTemplateId: input.hostTemplateId,
      type: 'HOST_IMAGE',
      provider: 'GOOGLE',
      model: 'gemini-3.1-flash-image-preview',
      inputPayload: {
        prompt: input.prompt,
        referenceImageUrls: input.referenceImageUrls,
      },
      status: GenerationJobStatus.RUNNING,
      startedAt: new Date(),
    },
  })

  try {
    // Convert ref images jadi base64 untuk Gemini.
    const refs = await Promise.all(
      input.referenceImageUrls.map((u) => fileToBase64(u)),
    )
    // Sync call via executeMediaSync — auto-deduct 1 IMAGE unit.
    const { result, charge } = await executeMediaSync({
      featureKey: HOST_IMAGE_FEATURE_KEY,
      userId: input.userId,
      ctx: {
        referencePrefix: `host_img:${input.hostTemplateId}`,
        description: `Host image — ${input.hostTemplateId}`,
        subjectType: 'HOST_TEMPLATE',
        subjectId: input.hostTemplateId,
        units: 1,
        mediaCall: () =>
          generateHostImage({
            userId: input.userId,
            prompt: input.prompt,
            referenceImages: refs,
          }),
      },
    })

    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: GenerationJobStatus.DONE,
        outputUrl: result.imagePath,
        apiCostUsd: charge.apiCostUsd,
        tokensCharged: charge.tokensCharged,
        finishedAt: new Date(),
      },
    })
    await prisma.hostTemplate.update({
      where: { id: input.hostTemplateId },
      data: {
        status: HostTemplateStatus.IMAGE_READY,
        sourceImageUrl: result.imagePath,
      },
    })

    // Auto-prep untuk NATIVE_LIBRARY mode: HANYA vision analyze (cheap, ~$0.01).
    // Baseline video gen TIDAK auto — admin harus confirm dulu di UI clip-library
    // (cost 3× ~$1.5 = ~$4.5 per host, kalau motion salah jadi waste).
    // UI panggil POST /api/host-templates/{id}/baselines/generate setelah konfirm.
    const host = await prisma.hostTemplate.findUnique({
      where: { id: input.hostTemplateId },
      select: { mode: true },
    })
    if (host?.mode === 'NATIVE_LIBRARY') {
      void autoVisionAnalyzeHost(input.hostTemplateId).catch((e) => {
        console.error('[autoVisionAnalyzeHost] gagal:', e)
      })
    }

    return { jobId: job.id, imageUrl: result.imagePath }
  } catch (err) {
    const msg = (err as Error).message
    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: GenerationJobStatus.FAILED,
        errorMessage: msg.slice(0, 1000),
        finishedAt: new Date(),
      },
    })
    await prisma.hostTemplate.update({
      where: { id: input.hostTemplateId },
      data: {
        status: HostTemplateStatus.FAILED,
        errorMessage: msg.slice(0, 1000),
      },
    })
    throw err
  }
}

// ── VIDEO (async) ────────────────────────────────────────────────────────
// Submit Kling untuk 1 HostScene. Scene-aware: status update di HostScene
// (bukan HostTemplate, karena 1 host punya banyak scene paralel).
export async function enqueueVideoJob(input: {
  userId: string
  hostTemplateId: string
  hostSceneId: string // wajib — scene-aware sekarang
  imageUrl: string // path public-relative atau absolute URL
  promptMotion: string
  durationSeconds: 5 | 10
  publicBaseUrl: string // mis. http://localhost:3000 — untuk konstruksi absolute URL
  klingMode?: 'std' | 'pro' // pro = motion lebih dramatic, 1.5× cost. Default std.
}): Promise<{ jobId: string; requestId: string }> {
  await assertVideoBudgetOk({
    featureKey: HOST_VIDEO_FEATURE_KEY,
    userId: input.userId,
    seconds: input.durationSeconds,
  })

  await prisma.hostScene.update({
    where: { id: input.hostSceneId },
    data: {
      status: 'GENERATING',
      errorMessage: null,
      videoSeconds: input.durationSeconds,
    },
  })

  // Bangun absolute URL untuk imageUrl — Kling/Fal harus bisa fetch publik.
  // (Untuk localhost dev, kling.ts auto-convert ke base64.)
  const absoluteImageUrl = input.imageUrl.startsWith('http')
    ? input.imageUrl
    : `${input.publicBaseUrl.replace(/\/$/, '')}${input.imageUrl}`

  const submission = await submitKlingVideo({
    imageUrl: absoluteImageUrl,
    prompt: input.promptMotion,
    duration: input.durationSeconds,
    mode: input.klingMode ?? 'std',
  })

  const job = await prisma.generationJob.create({
    data: {
      userId: input.userId,
      hostTemplateId: input.hostTemplateId,
      type: 'HOST_VIDEO',
      provider: 'KLING',
      model: submission.model,
      inputPayload: {
        imageUrl: absoluteImageUrl,
        prompt: input.promptMotion,
        duration: input.durationSeconds,
        hostSceneId: input.hostSceneId,
      },
      providerTaskId: submission.requestId,
      status: GenerationJobStatus.RUNNING,
      startedAt: new Date(),
    },
  })
  await prisma.hostScene.update({
    where: { id: input.hostSceneId },
    data: { generationJobId: job.id },
  })
  return { jobId: job.id, requestId: submission.requestId }
}

// Dipanggil cron tiap menit. Iterate semua HOST_VIDEO jobs status RUNNING:
//   - poll status → COMPLETED: download MP4, settle charge, update template
//   - FAILED: tandai job + template error
//   - IN_QUEUE / IN_PROGRESS: skip (poll lagi nanti)
export async function pollAndFinalizePendingVideos(): Promise<{
  checked: number
  completed: number
  failed: number
  stillRunning: number
}> {
  const jobs = await prisma.generationJob.findMany({
    where: {
      type: 'HOST_VIDEO',
      status: GenerationJobStatus.RUNNING,
      providerTaskId: { not: null },
    },
    take: 50,
    orderBy: { startedAt: 'asc' },
  })

  let completed = 0
  let failed = 0
  let stillRunning = 0

  for (const job of jobs) {
    if (!job.providerTaskId) continue
    const sceneId = (job.inputPayload as { hostSceneId?: string } | null)?.hostSceneId ?? null
    try {
      const status = await pollKlingStatus({
        requestId: job.providerTaskId,
        model: job.model,
      })
      if (status.status === 'IN_QUEUE' || status.status === 'IN_PROGRESS') {
        stillRunning++
        continue
      }
      if (status.status === 'FAILED') {
        failed++
        await markVideoJobFailed(job.id, job.hostTemplateId, sceneId, status.rawError ?? 'Kling FAILED')
        continue
      }
      // COMPLETED — fetch result & download.
      // pollKlingStatus return videoUrl saat COMPLETED — no second call needed.
      let videoUrl = status.videoUrl
      let durationSeconds = status.durationSeconds ?? 0
      if (!videoUrl) {
        const result = await fetchKlingResult({
          requestId: job.providerTaskId,
          model: job.model,
        })
        videoUrl = result.videoUrl
        durationSeconds = result.durationSeconds
      }
      const dl = await downloadKlingVideo({
        userId: job.userId,
        videoUrl,
      })
      const seconds = Math.max(1, Math.round(durationSeconds || 0))
      const settle = await settleVideoCharge({
        featureKey: HOST_VIDEO_FEATURE_KEY,
        userId: job.userId,
        seconds,
        referencePrefix: `host_vid:${job.id}`,
        description: `Host scene video — ${sceneId ?? job.id} (${seconds}s)`,
        subjectType: 'HOST_SCENE',
        subjectId: sceneId ?? undefined,
      })
      // Sprint 5+: simpan klingVideoId (videos[0].id) di inputPayload — beda
      // dari providerTaskId. Dipakai sebagai sourceVideoId untuk lipsync.
      const existingPayload = (job.inputPayload as Record<string, unknown> | null) ?? {}
      await prisma.generationJob.update({
        where: { id: job.id },
        data: {
          status: GenerationJobStatus.DONE,
          outputUrl: dl.videoPath,
          apiCostUsd: settle.charge.apiCostUsd,
          tokensCharged: settle.charge.tokensCharged,
          finishedAt: new Date(),
          inputPayload: {
            ...existingPayload,
            klingVideoId: status.videoId ?? null,
            klingVideoUrl: videoUrl, // 30-day public URL
          },
        },
      })

      if (sceneId) {
        await prisma.hostScene.update({
          where: { id: sceneId },
          data: {
            status: 'READY',
            videoUrl: dl.videoPath,
            videoSeconds: seconds || undefined,
          },
        })

        // Cek apakah ada scene primary di host ini. Kalau belum, scene
        // pertama yang READY otomatis jadi primary. Sync ke
        // HostTemplate.videoLoopUrl supaya live room langsung bisa pakai.
        const scene = await prisma.hostScene.findUnique({
          where: { id: sceneId },
          select: { hostTemplateId: true, isPrimary: true },
        })
        if (scene) {
          const anyPrimary = await prisma.hostScene.count({
            where: { hostTemplateId: scene.hostTemplateId, isPrimary: true },
          })
          if (anyPrimary === 0) {
            await prisma.hostScene.update({
              where: { id: sceneId },
              data: { isPrimary: true },
            })
            await prisma.hostTemplate.update({
              where: { id: scene.hostTemplateId },
              data: {
                videoLoopUrl: dl.videoPath,
                videoSeconds: seconds || undefined,
                status: HostTemplateStatus.READY,
              },
            })
          } else if (scene.isPrimary) {
            // Update primary scene re-render → refresh cache di template.
            await prisma.hostTemplate.update({
              where: { id: scene.hostTemplateId },
              data: { videoLoopUrl: dl.videoPath, videoSeconds: seconds || undefined },
            })
          }
        }
      } else if (job.hostTemplateId) {
        // Legacy job tanpa hostSceneId — fallback ke perilaku lama.
        await prisma.hostTemplate.update({
          where: { id: job.hostTemplateId },
          data: {
            status: HostTemplateStatus.READY,
            videoLoopUrl: dl.videoPath,
            videoSeconds: seconds || undefined,
          },
        })
      }
      completed++
    } catch (err) {
      const msg = (err as Error).message
      console.error('[kling-poll] job', job.id, 'gagal:', msg)
      failed++
      await markVideoJobFailed(job.id, job.hostTemplateId, sceneId, msg)
    }
  }

  return { checked: jobs.length, completed, failed, stillRunning }
}

async function markVideoJobFailed(
  jobId: string,
  hostTemplateId: string | null,
  hostSceneId: string | null,
  err: string,
): Promise<void> {
  await prisma.generationJob.update({
    where: { id: jobId },
    data: {
      status: GenerationJobStatus.FAILED,
      errorMessage: err.slice(0, 1000),
      finishedAt: new Date(),
    },
  })
  if (hostSceneId) {
    await prisma.hostScene.update({
      where: { id: hostSceneId },
      data: { status: 'FAILED', errorMessage: err.slice(0, 1000) },
    })
  } else if (hostTemplateId) {
    await prisma.hostTemplate.update({
      where: { id: hostTemplateId },
      data: { status: HostTemplateStatus.FAILED, errorMessage: err.slice(0, 1000) },
    })
  }
}

export { DEFAULT_KLING_MODEL }
