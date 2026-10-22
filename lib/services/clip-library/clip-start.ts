// Mulai generate klip dari route (POST /clips & /clips/idle-motion) — bagian
// sinkron yang cepat (< 2 dtk) sebelum pipeline jalan di `after()`:
//   1. Validasi script vs durasi baseline
//   2. Sapu klip macet milik host (supaya guard tidak tertipu baris mati)
//   3. Dalam transaksi + advisory lock per host:
//      a. Anti klik-ganda — klip in-flight dengan script/preset sama →
//         kembalikan klip itu (alreadyRunning, tanpa biaya baru); klip READY
//         sama → tolak 409 kecuali user mengonfirmasi (allowDuplicate).
//      b. Precheck saldo untuk SELURUH biaya klip (TTS + lipsync + embed),
//         sambil menyisihkan biaya klip lain milik user yang masih diproses.
//         Dulu cuma TTS yang dicek di muka; lipsync dipotong 3–5 menit
//         kemudian dan diam-diam gagal kalau saldo kurang → klip gratis.
//   4. Buat baris klip → caller menjadwalkan job.

import type { LiveClipStatus } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { computeMediaCharge } from '@/lib/services/media-charge'

import {
  IDLE_MOTION_TAG,
  IN_FLIGHT_CLIP_STATUSES,
  isClipInFlight,
  normalizeClipScript,
} from './clip-job-rules'
import { sweepStalledClips } from './clip-stale-sweep'
import {
  assertClipScript,
  buildClipDraftData,
  type GenerateClipInput,
  getBaselineDurationSec,
} from './generate-clip'
import type { IdleMotionPreset } from './idle-motions'

// Error yang pesannya ditulis untuk user — route meneruskan status & kode.
export class ClipStartError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
    this.name = 'ClipStartError'
  }
}

export interface ClipStartResult {
  clipId: string
  status: LiveClipStatus
  alreadyRunning: boolean
}

const fmt = (n: number) => n.toLocaleString('id-ID')

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

// Biaya token 1 klip — dihitung di luar transaksi (baca config) supaya lock
// tetap singkat.
async function clipCostTokens(
  parts: Array<{ featureKey: string; units: number }>,
): Promise<number> {
  const charges = await Promise.all(parts.map((p) => computeMediaCharge(p)))
  return charges.reduce((sum, c) => sum + c.tokensCharged, 0)
}

// Saldo harus cukup untuk klip ini + klip lain milik user yang masih diproses
// (biayanya belum terpotong penuh — lipsync & embed baru dipotong di akhir).
// Biaya klip lain diestimasi = biaya klip ini (konservatif: TTS mereka bisa
// jadi sudah terpotong). Dihitung per USER, lintas host.
async function assertBalanceWithReservation(
  tx: Tx,
  userId: string,
  perClipTokens: number,
): Promise<void> {
  const [inFlight, balanceRow] = await Promise.all([
    tx.liveClip.count({
      where: {
        userId,
        source: 'GENERATED',
        status: { in: [...IN_FLIGHT_CLIP_STATUSES] },
      },
    }),
    tx.tokenBalance.findUnique({ where: { userId }, select: { balance: true } }),
  ])
  const balance = balanceRow?.balance ?? 0
  const required = perClipTokens * (inFlight + 1)
  if (balance >= required) return
  throw new ClipStartError(
    inFlight > 0
      ? `Saldo token belum cukup: ${inFlight} klip lain masih diproses dan biayanya belum terpotong penuh. Total butuh ±${fmt(required)} token, saldo kamu ${fmt(balance)} token. Tunggu klip selesai atau top-up dulu.`
      : `Saldo token tidak cukup untuk 1 klip. Butuh ±${fmt(required)} token, saldo kamu ${fmt(balance)} token. Top-up dulu lalu coba lagi.`,
    402,
    'INSUFFICIENT_TOKEN',
  )
}

// Advisory lock per host: dua klik / tab paralel diproses berurutan, jadi
// cek-duplikat-lalu-create tidak bisa sama-sama lolos. Lepas saat commit.
async function lockHost(tx: Tx, hostTemplateId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('klip_generate'), hashtext(${hostTemplateId}))`
}

const DUPLICATE_READY_MESSAGE =
  'Klip dengan isi yang sama sudah ada di library dan siap tayang. Yakin mau buat lagi? (biaya terpotong lagi)'

export async function startGeneratedClip(
  input: GenerateClipInput & { allowDuplicate?: boolean },
): Promise<ClipStartResult & { script: string }> {
  const baselineSec = await getBaselineDurationSec(input.hostTemplateId)
  let script: string
  try {
    script = assertClipScript(input.script, baselineSec)
  } catch (e) {
    throw new ClipStartError((e as Error).message, 400, 'INVALID_SCRIPT')
  }

  await sweepStalledClips({ hostTemplateId: input.hostTemplateId })
  const perClipTokens = await clipCostTokens([
    { featureKey: 'KLIP_LIVE_TTS_ELEVENLABS', units: script.length },
    { featureKey: 'KLIP_LIVE_LIPSYNC', units: baselineSec },
    {
      featureKey: 'KLIP_LIVE_EMBED',
      units: Math.max(10, Math.ceil(script.length / 4)),
    },
  ])

  const key = normalizeClipScript(script)
  const result = await prisma.$transaction(async (tx) => {
    await lockHost(tx, input.hostTemplateId)
    const siblings = await tx.liveClip.findMany({
      where: {
        hostTemplateId: input.hostTemplateId,
        category: input.category,
        source: 'GENERATED',
        status: { not: 'FAILED' },
      },
      select: { id: true, status: true, transcript: true },
      orderBy: { createdAt: 'desc' },
    })
    const same = siblings.filter((c) => normalizeClipScript(c.transcript) === key)
    const running = same.find((c) => isClipInFlight(c.status))
    if (running) {
      return { clipId: running.id, status: running.status, alreadyRunning: true }
    }
    if (same.length > 0 && !input.allowDuplicate) {
      throw new ClipStartError(DUPLICATE_READY_MESSAGE, 409, 'DUPLICATE_CLIP')
    }
    await assertBalanceWithReservation(tx, input.userId, perClipTokens)
    const created = await tx.liveClip.create({
      data: buildClipDraftData(input, script),
      select: { id: true, status: true },
    })
    return { clipId: created.id, status: created.status, alreadyRunning: false }
  })
  return { ...result, script }
}

export async function startIdleClip(input: {
  hostTemplateId: string
  userId: string
  motion: IdleMotionPreset
  allowDuplicate?: boolean
}): Promise<ClipStartResult> {
  const { hostTemplateId, motion } = input
  await sweepStalledClips({ hostTemplateId })
  const perClipTokens = await clipCostTokens([
    { featureKey: 'KLIP_LIVE_LIPSYNC', units: motion.durationSec },
  ])

  return prisma.$transaction(async (tx) => {
    await lockHost(tx, hostTemplateId)
    const same = await tx.liveClip.findMany({
      where: {
        hostTemplateId,
        category: 'IDLE',
        status: { not: 'FAILED' },
        tags: { hasEvery: [IDLE_MOTION_TAG, motion.id] },
      },
      select: { id: true, status: true },
      orderBy: { createdAt: 'desc' },
    })
    const running = same.find((c) => isClipInFlight(c.status))
    if (running) {
      return { clipId: running.id, status: running.status, alreadyRunning: true }
    }
    if (same.length > 0 && !input.allowDuplicate) {
      throw new ClipStartError(DUPLICATE_READY_MESSAGE, 409, 'DUPLICATE_CLIP')
    }
    await assertBalanceWithReservation(tx, input.userId, perClipTokens)
    const created = await tx.liveClip.create({
      data: {
        hostTemplateId,
        userId: input.userId,
        scriptOriginal: motion.label,
        transcript: motion.label, // utk display saja
        summary: `Idle motion: ${motion.label}`,
        category: 'IDLE',
        tags: [IDLE_MOTION_TAG, motion.category, motion.id],
        source: 'GENERATED',
        status: 'GENERATING_VIDEO',
      },
      select: { id: true, status: true },
    })
    return { clipId: created.id, status: created.status, alreadyRunning: false }
  })
}
