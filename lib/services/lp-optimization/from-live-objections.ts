// Bridge: LiveObjection → LpOptimization suggestion.
//
// Tujuan: kalau LP punya LpLiveEmbed aktif, tarik objection-objection yg
// muncul di LiveSession yg datang dari LP itu (via gate-capture). Aggregate
// per kategori → suggest perbaikan LP yg targeted ke objection terbanyak.
//
// Beda dari runOptimization (lib/services/lp-optimize.ts):
// - Tidak panggil AI — pure aggregation + rule-based suggestion mapping.
// - Cost 0 token (hemat). Owner approve → baru optional run AI untuk
//   generate rewrittenHtml via existing apply flow.
// - Dipakai sebagai "trigger insight" — owner lihat ada pattern, lalu
//   decide mau jalanin AI optimization full atau tidak.
//
// Trigger: bisa di-call manual (button "Analisa pertanyaan live") atau
// cron daily.

import { prisma } from '@/lib/prisma'

type ObjectionCategory =
  | 'HARGA_MAHAL'
  | 'RAGU_KUALITAS'
  | 'TAKUT_PENIPUAN'
  | 'BUTUH_IZIN'
  | 'NANTI_DULU'
  | 'KURANG_PAHAM'
  | 'BANDING_KOMPETITOR'
  | 'TIDAK_BUTUH'
  | 'MASALAH_TEKNIS'
  | 'TIDAK_COCOK'
  | 'LAINNYA'

// Mapping kategori objection → focus area LP yg paling relevan +
// suggestion template (rationale dinamis sesuai count).
const CATEGORY_TO_LP_FIX: Record<
  ObjectionCategory,
  { focusArea: string; titleTemplate: (count: number) => string; rationale: string; impact: string }
> = {
  HARGA_MAHAL: {
    focusArea: 'pricing',
    titleTemplate: (n) => `${n} viewer ragu harga — tambah social proof harga`,
    rationale:
      'Customer di live sering muncul keberatan harga mahal. LP belum punya komparasi harga ke kompetitor atau breakdown value-for-money yang jelas. Tambah blok "Kenapa harganya segini?" + bandingkan benefit vs alternatif.',
    impact: 'Bisa reduce price-objection ~30-40% di live + LP.',
  },
  RAGU_KUALITAS: {
    focusArea: 'trust',
    titleTemplate: (n) => `${n} viewer ragu kualitas — perkuat testimoni & garansi`,
    rationale:
      'Banyak customer chat soal kualitas/keaslian. LP perlu testimoni real customer dengan foto + nama lengkap, plus badge "Garansi uang kembali X hari" yang prominent. Hindari testimoni generik.',
    impact: 'Trust-related drop biasanya turun 25-35% kalau testimoni real.',
  },
  TAKUT_PENIPUAN: {
    focusArea: 'trust',
    titleTemplate: (n) => `${n} viewer takut penipuan — tambah signal trust`,
    rationale:
      'Customer skeptis brand baru. Tambah badge legal (NIB, izin BPOM kalau ada), foto tim/kantor, nomor WA dengan nama tim, link sosmed verified, dan kebijakan COD/return yang jelas.',
    impact: 'Bukti legitimasi reduce takut-penipuan ~40-50% buat brand baru.',
  },
  BUTUH_IZIN: {
    focusArea: 'urgency',
    titleTemplate: (n) => `${n} viewer "tanya pasangan dulu" — tambah urgensi`,
    rationale:
      'Customer postpone keputusan ke orang lain. Tambah scarcity asli (stok terbatas/promo deadline) tanpa fake countdown. Plus FAQ "Bisa cancel kalau pasangan gak setuju?" untuk reduce friction.',
    impact: 'Decision-postponement turun moderate (~15-25%) — biasanya butuh follow-up WA.',
  },
  NANTI_DULU: {
    focusArea: 'urgency',
    titleTemplate: (n) => `${n} viewer "nanti aja" — perkuat alasan beli sekarang`,
    rationale:
      'Customer procrastinate. LP butuh alasan kongkrit kenapa harus sekarang: bonus terbatas, harga akan naik, batch terbatas. Hindari false urgency yg langsung kelihatan palsu.',
    impact: 'Conversion immediate naik ~10-20% dengan urgency yg honest.',
  },
  KURANG_PAHAM: {
    focusArea: 'value_prop',
    titleTemplate: (n) => `${n} viewer bingung manfaat — perjelas value prop`,
    rationale:
      'Banyak customer bertanya "ini fungsinya apa" / "beda sama yg lain apa". LP perlu hero dengan 1-line value prop kongkrit (benefit, bukan fitur) + video demo 30dtk + before/after kalau applicable.',
    impact: 'Comprehension naik signifikan, drop-off "gak ngerti" turun ~40%.',
  },
  BANDING_KOMPETITOR: {
    focusArea: 'value_prop',
    titleTemplate: (n) => `${n} viewer bandingkan kompetitor — tambah tabel komparasi`,
    rationale:
      'Customer evaluating alternatif. Tambah tabel komparasi vs 2-3 kompetitor utama (fitur, harga, garansi) — jujur, jangan exaggerate. Bisa juga "Beda dengan brand X adalah…" section.',
    impact: 'Reduce decision-fatigue, naikkan conviction LP ~15-20%.',
  },
  TIDAK_BUTUH: {
    focusArea: 'value_prop',
    titleTemplate: (n) => `${n} viewer "gak butuh" — re-target audience LP`,
    rationale:
      'Banyak yg datang tapi bukan target market. Cek source traffic (iklan/organik) — kemungkinan targeting iklan miss. LP perlu hero yg lebih spesifik filter audience: untuk siapa, untuk masalah apa.',
    impact: 'Bukan masalah LP murni — perlu review targeting Meta Ads/audience juga.',
  },
  MASALAH_TEKNIS: {
    focusArea: 'mobile_ux',
    titleTemplate: (n) => `${n} viewer keluhan teknis — audit performance LP`,
    rationale:
      'Customer lapor lemot/error di LP. Cek image size (compress kalau >500kb), lazy-load gambar bawah fold, hapus script third-party yg tidak perlu. Test di 4G slow + HP low-end.',
    impact: 'Page-load 2dtk → 1dtk biasanya naik conversion 10-15%.',
  },
  TIDAK_COCOK: {
    focusArea: 'cta_clarity',
    titleTemplate: (n) => `${n} viewer "produk gak cocok" — perbaiki targeting LP`,
    rationale:
      'Sama dgn TIDAK_BUTUH — kemungkinan audience LP belum match dengan produk. LP perlu eyeball test: hero 3 detik bisa jawab "ini buat saya?" Bisa juga tambah quiz / size guide / fit checker.',
    impact: 'Targeting fit reduce mismatch ~20%.',
  },
  LAINNYA: {
    focusArea: 'cta_clarity',
    titleTemplate: (n) => `${n} objection lain — review transcript live`,
    rationale:
      'Objection yg gak masuk taksonomi standar. Owner perlu manual review LiveObjection.evidence di dashboard untuk identify pattern + LP fix yg tepat.',
    impact: 'Manual review, impact bervariasi.',
  },
}

interface ProposeInput {
  lpId: string
  daysWindow?: number // default 14 hari
  minObjectionCount?: number // default 2 — abaikan kategori yg cuma muncul 1x
}

interface ProposeResult {
  lpOptimizationId: string | null
  totalSessions: number
  totalObjections: number
  topCategories: Array<{ category: ObjectionCategory; count: number }>
  skipped?: 'no_embed' | 'no_data' | 'duplicate'
}

export async function proposeLpFromLiveObjections(
  input: ProposeInput,
): Promise<ProposeResult> {
  const daysWindow = input.daysWindow ?? 14
  const minObjectionCount = input.minObjectionCount ?? 2
  const since = new Date(Date.now() - daysWindow * 86_400_000)

  // 1. Pastikan LP punya embed aktif.
  const embed = await prisma.lpLiveEmbed.findUnique({
    where: { landingPageId: input.lpId },
    select: { id: true, liveRoomId: true, userId: true },
  })
  if (!embed) {
    return {
      lpOptimizationId: null,
      totalSessions: 0,
      totalObjections: 0,
      topCategories: [],
      skipped: 'no_embed',
    }
  }

  // 2. Find session yg datang dari LP via LpEvent.live_lead_capture.
  // eventValue = `${liveLeadId}|${liveSlug}` — kita decode liveLeadId.
  const lpLeadEvents = await prisma.lpEvent.findMany({
    where: {
      landingPageId: input.lpId,
      eventType: 'live_lead_capture',
      createdAt: { gte: since },
    },
    select: { eventValue: true },
    take: 1000,
  })
  const liveLeadIds = lpLeadEvents
    .map((e) => e.eventValue?.split('|')[0])
    .filter((v): v is string => Boolean(v))

  if (liveLeadIds.length === 0) {
    return {
      lpOptimizationId: null,
      totalSessions: 0,
      totalObjections: 0,
      topCategories: [],
      skipped: 'no_data',
    }
  }

  // 3. Resolve sessionIds dari leads.
  const leads = await prisma.liveLead.findMany({
    where: { id: { in: liveLeadIds } },
    select: { liveSessionId: true },
  })
  const sessionIds = leads.map((l) => l.liveSessionId)

  // 4. Aggregate objections per kategori.
  const objections = await prisma.liveObjection.findMany({
    where: { liveSessionId: { in: sessionIds }, confidence: { gte: 0.5 } },
    select: { category: true },
  })

  const counts = new Map<ObjectionCategory, number>()
  for (const o of objections) {
    counts.set(o.category as ObjectionCategory, (counts.get(o.category as ObjectionCategory) ?? 0) + 1)
  }

  const topCategories = Array.from(counts.entries())
    .filter(([, n]) => n >= minObjectionCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([category, count]) => ({ category, count }))

  if (topCategories.length === 0) {
    return {
      lpOptimizationId: null,
      totalSessions: sessionIds.length,
      totalObjections: objections.length,
      topCategories: [],
      skipped: 'no_data',
    }
  }

  // 5. Dedup: kalau ada LpOptimization rule-based untuk LP ini dalam 24 jam
  // terakhir dengan focusArea yg sama, skip (jangan spam).
  const recentDup = await prisma.lpOptimization.findFirst({
    where: {
      lpId: input.lpId,
      model: 'rule-based-live-bridge',
      createdAt: { gte: new Date(Date.now() - 86_400_000) },
    },
  })
  if (recentDup) {
    return {
      lpOptimizationId: recentDup.id,
      totalSessions: sessionIds.length,
      totalObjections: objections.length,
      topCategories,
      skipped: 'duplicate',
    }
  }

  // 6. Build suggestions + insert LpOptimization (status applied=false).
  const suggestions = topCategories.map(({ category, count }) => {
    const fix = CATEGORY_TO_LP_FIX[category]
    return {
      title: fix.titleTemplate(count),
      rationale: fix.rationale,
      impact: fix.impact,
    }
  })
  const focusAreas = Array.from(
    new Set(topCategories.map(({ category }) => CATEGORY_TO_LP_FIX[category].focusArea)),
  )

  const contextSummary = [
    `Insights dari ${sessionIds.length} session live yg datang via embed LP (${daysWindow} hari).`,
    `Total objection: ${objections.length}.`,
    `Top kategori: ${topCategories.map(({ category, count }) => `${category} (${count})`).join(', ')}.`,
  ].join(' ')

  const created = await prisma.lpOptimization.create({
    data: {
      lpId: input.lpId,
      userId: embed.userId,
      model: 'rule-based-live-bridge',
      inputTokens: 0,
      outputTokens: 0,
      providerCostUsd: 0,
      providerCostRp: 0,
      platformTokensCharged: 0,
      suggestionsJson: suggestions,
      focusAreasJson: focusAreas,
      contextSummary,
      applied: false,
    },
    select: { id: true },
  })

  return {
    lpOptimizationId: created.id,
    totalSessions: sessionIds.length,
    totalObjections: objections.length,
    topCategories,
  }
}
