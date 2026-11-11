// POST /api/host-templates/[id]/baselines/generate
// Trigger generate baseline videos. User HARUS konfirm dulu karena cost
// ~$1.5 per baseline.
//
// Body (salah satu):
//   { customBaselines: [{ name, category, motionScript }] } — hasil edit composer
//   { variantKeys: ['A','B','C'] } — legacy preset hardcoded
//
// BACKGROUND JOB (2026-11-11): dulu route ini menunggu submit Kling sampai
// selesai. Saat Kling membalas 429 (antrian penuh — atau, pada insiden ini,
// saldo akun Kling habis yang dulu ikut dianggap antrian), submit di-retry
// 150 dtk per baseline → Cloudflare memutus di 100 dtk (524 HTML) → seller
// melihat "Unexpected token '<'…" lalu klik ulang. Sekarang:
// startBaselineGeneration (validasi + precheck saldo + anti klik-ganda + buat
// scene) → submit jalan di `after()` → route menunggu maks BASELINE_SYNC_WAIT_MS:
//   200 { pending:false, submitted, failed, sceneIds, message } — submit selesai
//   202 { pending:true, submitted:null, failed:null, sceneIds, message } — masih dikirim
//   4xx/5xx { error } — gagal semua / ditolak di depan (402 saldo, 409 masih
//   dikirim, 503 layanan video tidak tersedia)

import { after, type NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import {
  BaselineStartError,
  runBaselineSubmitJob,
  startBaselineGeneration,
} from '@/lib/services/host-gen/baseline-job'
import {
  BASELINE_SYNC_WAIT_MS,
  summarizeBaselineSubmit,
  type BaselineSubmitOutcome,
} from '@/lib/services/host-gen/baseline-job-rules'

// Route sendiri selesai ≤ BASELINE_SYNC_WAIT_MS; di platform yang menegakkan
// maxDuration, callback `after()` ikut dibatasi nilai ini. Server Node
// self-hosted (hulao) tidak menegakkannya — sisa scene yang macet disapu
// prep-status setelah BASELINE_SUBMIT_STALE_MS.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const schema = z
  .object({
    // Legacy: pakai preset hardcoded A/B/C.
    variantKeys: z
      .array(z.enum(['A', 'B', 'C']))
      .min(1)
      .max(3)
      .optional(),
    // Custom: motion script hasil edit di composer (any number).
    customBaselines: z
      .array(
        z.object({
          name: z.string().trim().min(1, 'Nama baseline wajib').max(120),
          category: z.enum(['idle', 'greeting', 'product']),
          motionScript: z
            .string()
            .trim()
            .min(10, 'Motion script minimal 10 karakter')
            .max(4000),
        }),
      )
      .min(1)
      .max(8)
      .optional(),
  })
  .refine(
    (d) =>
      (d.variantKeys && d.variantKeys.length > 0) ||
      (d.customBaselines && d.customBaselines.length > 0),
    { message: 'Pilih variant preset atau isi minimal 1 baseline custom' },
  )

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const { id } = await params

  const host = await prisma.hostTemplate.findUnique({
    where: { id },
    select: { userId: true, mode: true, sourceImageUrl: true },
  })
  if (!host) return jsonError('Host tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && host.userId !== session.user.id) {
    return jsonError('Tidak punya akses', 403)
  }
  if (host.mode !== 'NATIVE_LIBRARY') {
    return jsonError('Host bukan mode Klip Live', 400)
  }
  if (!host.sourceImageUrl) {
    return jsonError('Source image belum ada', 400)
  }

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body invalid', 400)
  }

  try {
    const started = await startBaselineGeneration({
      hostTemplateId: id,
      userId: host.userId,
      variantKeys: parsed.data.variantKeys,
      customBaselines: parsed.data.customBaselines,
    })
    const sceneIds = started.scenes.map((s) => s.sceneId)

    // Job mulai SEKARANG; `after()` menjaga prosesnya tetap hidup kalau
    // respons terkirim duluan. runBaselineSubmitJob tidak pernah throw.
    const job = runBaselineSubmitJob(started)
    after(() => job)

    const outcomes = await waitAtMost(job, BASELINE_SYNC_WAIT_MS)
    if (!outcomes) {
      return jsonOk(
        {
          pending: true,
          submitted: null,
          failed: null,
          sceneIds,
          message:
            'Baseline sedang dikirim ke Kling (antrian sedang ramai). Status muncul otomatis di halaman ini — tidak perlu klik ulang.',
        },
        202,
      )
    }
    const summary = summarizeBaselineSubmit(outcomes)
    if (summary.submitted === 0) {
      return jsonError(summary.message, summary.httpStatus)
    }
    return jsonOk({
      pending: false,
      submitted: summary.submitted,
      failed: summary.failed,
      sceneIds,
      message: summary.message,
    })
  } catch (e) {
    if (e instanceof BaselineStartError) {
      return jsonError(e.message, e.status)
    }
    console.error(
      `[POST /api/host-templates/${id}/baselines/generate] gagal memulai:`,
      e,
    )
    return jsonError(
      'Gagal memulai generate baseline. Coba lagi sebentar lagi.',
      500,
    )
  }
}

// Tunggu `job` maksimal `ms`; null kalau belum selesai (job tetap berjalan).
async function waitAtMost(
  job: Promise<BaselineSubmitOutcome[]>,
  ms: number,
): Promise<BaselineSubmitOutcome[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms)
  })
  try {
    return await Promise.race([job, timeout])
  } finally {
    clearTimeout(timer)
  }
}
