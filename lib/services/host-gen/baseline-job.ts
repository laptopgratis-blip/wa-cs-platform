// Generate baseline silent-loop sebagai background job (2026-11-11).
//
// Alur: route POST /baselines/generate →
//   1. startBaselineGeneration — validasi, cek gangguan akun Kling, precheck
//      saldo untuk SEMUA baseline, anti klik-ganda (advisory lock per host),
//      buat baris HostScene GENERATING. Cepat (< 1 dtk).
//   2. runBaselineSubmitJob — submit tiap scene ke Kling berurutan; scene yang
//      gagal ditandai FAILED dengan pesan aman untuk seller. TIDAK pernah throw
//      (dijalankan di `after()`).
//   3. sweepStalledBaselineSubmits — dipanggil lazy dari prep-status: scene
//      yang submit-nya mati di tengah jalan (restart/deploy) ditutup FAILED.
// Aturan murni + alasan desain: ./baseline-job-rules.ts.

import { prisma } from '@/lib/prisma'
import { InsufficientBalanceError } from '@/lib/services/ai-generation-log'
import { assertVideoBudgetOk } from '@/lib/services/media-charge'

import {
  BASELINE_SCENE_DESCRIPTION_PREFIX,
  BASELINE_SECONDS,
  BASELINE_SUBMIT_GENERIC_MSG,
  BASELINE_SUBMIT_INTERRUPTED_MSG,
  BASELINE_SUBMIT_STALE_MS,
  type BaselineFailureKind,
  type BaselineSubmitOutcome,
} from './baseline-job-rules'
import { KLING_QUEUE_FULL_MSG } from './kling'
import {
  getKlingAccountOutage,
  KLING_ACCOUNT_UNAVAILABLE_MSG,
  KlingAccountError,
} from './kling-retry'
import {
  buildBaselineJobs,
  enqueueVideoJob,
  HOST_VIDEO_FEATURE_KEY,
  type BaselineJobSpec,
  type CustomBaselineInput,
} from './queue'

export class BaselineStartError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'BaselineStartError'
    this.status = status
  }
}

export interface StartedBaselines {
  hostTemplateId: string
  userId: string
  imageUrl: string
  publicBaseUrl: string
  scenes: Array<{ sceneId: string; job: BaselineJobSpec }>
}

function resolvePublicBaseUrl(): string {
  return (
    process.env.PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    'http://localhost:3000'
  )
}

export async function startBaselineGeneration(input: {
  hostTemplateId: string
  userId: string
  variantKeys?: Array<'A' | 'B' | 'C'>
  customBaselines?: CustomBaselineInput[]
}): Promise<StartedBaselines> {
  // Akun Kling baru saja ketahuan bermasalah → tolak di depan, sebelum ada
  // baris atau biaya (seller tidak perlu menunggu kegagalan yang pasti).
  if (getKlingAccountOutage(Date.now())) {
    throw new BaselineStartError(KLING_ACCOUNT_UNAVAILABLE_MSG, 503)
  }

  const host = await prisma.hostTemplate.findUnique({
    where: { id: input.hostTemplateId },
    select: { sourceImageUrl: true },
  })
  if (!host?.sourceImageUrl) {
    throw new BaselineStartError('Source image belum ada', 400)
  }

  const jobs = buildBaselineJobs(input)
  if (jobs.length === 0) {
    throw new BaselineStartError(
      'Isi minimal 1 baseline (nama + motion script ≥10 karakter)',
      400,
    )
  }

  // Precheck saldo untuk SEMUA baseline sekaligus — dulu dicek per baseline
  // sehingga batch bisa terkirim setengah lalu sisanya gagal diam-diam.
  // Token baru dipotong saat video jadi (settleVideoChargeIdempotent).
  try {
    await assertVideoBudgetOk({
      featureKey: HOST_VIDEO_FEATURE_KEY,
      userId: input.userId,
      seconds: BASELINE_SECONDS * jobs.length,
    })
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      throw new BaselineStartError(
        `Saldo token kurang. Butuh ±${e.tokensRequired} token untuk ${jobs.length} baseline.`,
        402,
      )
    }
    throw e
  }

  const scenes = await prisma.$transaction(async (tx) => {
    // Serialisasi per host: dua klik beruntun tidak boleh sama-sama lolos
    // cek in-flight lalu membuat batch dobel.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('baseline_generate'), hashtext(${input.hostTemplateId}))`
    const inFlight = await tx.hostScene.count({
      where: {
        hostTemplateId: input.hostTemplateId,
        status: 'GENERATING',
        generationJobId: null,
        description: { startsWith: BASELINE_SCENE_DESCRIPTION_PREFIX },
        createdAt: { gt: new Date(Date.now() - BASELINE_SUBMIT_STALE_MS) },
      },
    })
    if (inFlight > 0) {
      throw new BaselineStartError(
        'Baseline sebelumnya masih dikirim ke Kling — tunggu sampai selesai, tidak perlu klik ulang.',
        409,
      )
    }
    const created: StartedBaselines['scenes'] = []
    for (const job of jobs) {
      const scene = await tx.hostScene.create({
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
          // GENERATING + generationJobId null = "sedang dikirim ke Kling".
          status: 'GENERATING',
          videoSeconds: BASELINE_SECONDS,
        },
        select: { id: true },
      })
      created.push({ sceneId: scene.id, job })
    }
    return created
  })

  const publicBaseUrl = resolvePublicBaseUrl()
  const imageUrl = host.sourceImageUrl.startsWith('http')
    ? host.sourceImageUrl
    : `${publicBaseUrl.replace(/\/$/, '')}${host.sourceImageUrl}`

  return {
    hostTemplateId: input.hostTemplateId,
    userId: input.userId,
    imageUrl,
    publicBaseUrl,
    scenes,
  }
}

function describeFailure(e: unknown): {
  kind: BaselineFailureKind
  message: string
} {
  if (e instanceof KlingAccountError) {
    return { kind: 'account', message: e.message }
  }
  if (e instanceof InsufficientBalanceError) {
    return { kind: 'balance', message: e.message }
  }
  if (e instanceof Error && e.message === KLING_QUEUE_FULL_MSG) {
    return { kind: 'queue', message: e.message }
  }
  // Error lain bisa berisi teks mentah provider/JS — jangan ke seller.
  return { kind: 'other', message: BASELINE_SUBMIT_GENERIC_MSG }
}

async function markSceneFailed(
  sceneId: string,
  message: string,
): Promise<void> {
  await prisma.hostScene.updateMany({
    // Jangan timpa scene yang sudah dapat job (mis. poller sudah jalan).
    where: { id: sceneId, generationJobId: null },
    data: { status: 'FAILED', errorMessage: message.slice(0, 500) },
  })
}

async function submitOne(
  started: StartedBaselines,
  scene: StartedBaselines['scenes'][number],
): Promise<BaselineSubmitOutcome> {
  const { sceneId, job } = scene
  // Akun Kling ketahuan bermasalah di baseline sebelumnya → jangan tembak
  // lagi; hasilnya pasti sama.
  if (getKlingAccountOutage(Date.now())) {
    await markSceneFailed(sceneId, KLING_ACCOUNT_UNAVAILABLE_MSG)
    return {
      sceneId,
      ok: false,
      kind: 'account',
      message: KLING_ACCOUNT_UNAVAILABLE_MSG,
    }
  }
  try {
    await enqueueVideoJob({
      userId: started.userId,
      hostTemplateId: started.hostTemplateId,
      hostSceneId: sceneId,
      imageUrl: started.imageUrl,
      promptMotion: job.fullPrompt,
      durationSeconds: BASELINE_SECONDS,
      publicBaseUrl: started.publicBaseUrl,
      klingMode: 'pro',
    })
    console.log(`[baseline-job] ${job.name} (${sceneId}) submitted`)
    return { sceneId, ok: true }
  } catch (e) {
    const failure = describeFailure(e)
    console.error(
      `[baseline-job] ${job.name} (${sceneId}) gagal [${failure.kind}]:`,
      e instanceof Error ? e.message : e,
    )
    await markSceneFailed(sceneId, failure.message)
    return { sceneId, ok: false, ...failure }
  }
}

// Submit berurutan (bukan paralel) — batas task paralel resource pack Kling
// kecil; paralel justru memicu 429 antrian penuh.
export async function runBaselineSubmitJob(
  started: StartedBaselines,
): Promise<BaselineSubmitOutcome[]> {
  const outcomes: BaselineSubmitOutcome[] = []
  for (const scene of started.scenes) {
    try {
      outcomes.push(await submitOne(started, scene))
    } catch (e) {
      // markSceneFailed sendiri gagal (DB putus) — scene akan disapu
      // sweepStalledBaselineSubmits setelah BASELINE_SUBMIT_STALE_MS.
      console.error(
        `[baseline-job] gagal menutup scene ${scene.sceneId}:`,
        e instanceof Error ? e.message : e,
      )
      outcomes.push({
        sceneId: scene.sceneId,
        ok: false,
        kind: 'other',
        message: BASELINE_SUBMIT_GENERIC_MSG,
      })
    }
  }
  return outcomes
}

// Scene GENERATING tanpa job yang sudah lewat ambang = submit-nya mati
// (restart/deploy di tengah `after()`, atau baris yatim dari versi lama yang
// tidak me-rollback status saat submit gagal). Tutup FAILED supaya panel
// setup berhenti "memproses" dan seller bisa generate ulang.
export async function sweepStalledBaselineSubmits(
  hostTemplateId: string,
): Promise<number> {
  const res = await prisma.hostScene.updateMany({
    where: {
      hostTemplateId,
      status: 'GENERATING',
      generationJobId: null,
      description: { startsWith: BASELINE_SCENE_DESCRIPTION_PREFIX },
      createdAt: { lt: new Date(Date.now() - BASELINE_SUBMIT_STALE_MS) },
    },
    data: { status: 'FAILED', errorMessage: BASELINE_SUBMIT_INTERRUPTED_MSG },
  })
  if (res.count > 0) {
    console.warn(
      `[baseline-job] host ${hostTemplateId}: ${res.count} scene baseline macet ditutup FAILED`,
    )
  }
  return res.count
}
