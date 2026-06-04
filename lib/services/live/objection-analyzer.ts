// Fase 3 — analyze transcript LiveSession → tag objection (multi-tag).
// Pakai Claude Haiku (cepat, murah). Output structured JSON di antara
// marker untuk parse reliable.
//
// Idempotent: cek LiveSession.objectionsAnalyzedAt sebelum re-analyze.

import Anthropic from '@anthropic-ai/sdk'

import { prisma } from '@/lib/prisma'
import { executeAiWithCharge } from '@/lib/services/ai-generation-log'

import { getLiveApiKey } from './provider-keys'
import { buildTranscript } from './tangkap'

const FEATURE_KEY = 'LIVE_OBJECTION_ANALYZE'
const MODEL = 'claude-haiku-4-5'
const MAX_OUTPUT = 1500
const MIN_TURNS_TO_ANALYZE = 2 // skip session dgn <2 user msg

const TAXONOMY = [
  { key: 'HARGA_MAHAL', label: 'Harga terlalu mahal / mau diskon' },
  { key: 'RAGU_KUALITAS', label: 'Ragu kualitas produk / takut rusak' },
  { key: 'TAKUT_PENIPUAN', label: 'Takut tertipu / penjual tidak terpercaya' },
  { key: 'BUTUH_IZIN', label: 'Butuh tanya pasangan / bos / ortu dulu' },
  { key: 'NANTI_DULU', label: 'Belum buru-buru — tunggu gajian / promo' },
  { key: 'KURANG_PAHAM', label: 'Belum paham cara pakai / manfaat / spec' },
  { key: 'BANDING_KOMPETITOR', label: 'Bandingkan dengan brand / produk lain' },
  { key: 'TIDAK_BUTUH', label: 'Belum merasa butuh sekarang' },
  { key: 'MASALAH_TEKNIS', label: 'Pengiriman / pembayaran / akses bermasalah' },
  { key: 'TIDAK_COCOK', label: 'Spec / varian / ukuran tidak sesuai' },
  { key: 'LAINNYA', label: 'Objection yg tidak masuk 10 kategori di atas' },
] as const

const SYSTEM_PROMPT = `Kamu adalah expert sales analyst Indonesia. Tugasmu menganalisa transkrip percakapan customer-AI di live shopping dan menandai semua "objection" (alasan customer ragu/tidak jadi order) yang muncul.

TAKSONOMI (gunakan PERSIS key uppercase ini di output):
${TAXONOMY.map((t) => `- ${t.key} → ${t.label}`).join('\n')}

ATURAN:
1. Cuma tag SAAT customer ber-ekspresi objection nyata di pesan mereka. Bukan ramalan atau asumsi.
2. Multi-tag boleh. Maks 5 tag per session.
3. Untuk tiap tag: kasih evidence = quote pesan customer (max 200 char).
4. confidence: 0.5 = ada hint, 0.8 = jelas, 1.0 = customer eksplisit nolak/keberatan.
5. aiNotes (opsional): saran 1 kalimat rebuttal — apa yg seharusnya dijawab AI.
6. Kalau TIDAK ADA objection sama sekali (cust antusias closing) → return tags: [].

OUTPUT WAJIB JSON murni (tidak ada markdown ata text di luar) di antara marker:
<<<OBJECTIONS>>>
{"tags":[{"category":"HARGA_MAHAL","confidence":0.8,"evidence":"...","aiNotes":"..."}]}
<<<END>>>`

const BEGIN = '<<<OBJECTIONS>>>'
const END = '<<<END>>>'

interface ParsedTag {
  category: string
  confidence: number
  evidence: string
  aiNotes?: string
}

function parseTags(raw: string): ParsedTag[] {
  const begin = raw.indexOf(BEGIN)
  const end = raw.indexOf(END, begin)
  if (begin === -1 || end === -1) {
    throw new Error('Marker output tidak ditemukan')
  }
  const json = raw.slice(begin + BEGIN.length, end).trim()
  const parsed = JSON.parse(json) as { tags?: ParsedTag[] }
  return parsed.tags ?? []
}

const VALID_KEYS = new Set<string>(TAXONOMY.map((t) => t.key))

// Analyze 1 session. Idempotent — kalau objectionsAnalyzedAt sudah ter-set,
// skip kecuali force=true.
export async function analyzeSessionObjections(input: {
  liveSessionId: string
  force?: boolean
}): Promise<{ analyzed: boolean; tagsCount: number; skipped?: string }> {
  const session = await prisma.liveSession.findUnique({
    where: { id: input.liveSessionId },
    select: {
      id: true,
      userId: true,
      objectionsAnalyzedAt: true,
      messageCount: true,
    },
  })
  if (!session) {
    return { analyzed: false, tagsCount: 0, skipped: 'session not found' }
  }
  if (session.objectionsAnalyzedAt && !input.force) {
    return { analyzed: false, tagsCount: 0, skipped: 'already analyzed' }
  }
  if (session.messageCount < MIN_TURNS_TO_ANALYZE) {
    return { analyzed: false, tagsCount: 0, skipped: 'too few messages' }
  }

  const transcript = await buildTranscript(session.id)
  if (transcript.trim().length === 0) {
    return { analyzed: false, tagsCount: 0, skipped: 'empty transcript' }
  }

  const apiKey = await getLiveApiKey('ANTHROPIC')
  const client = new Anthropic({ apiKey })

  const userPrompt =
    `Transkrip live shopping:\n\n${transcript}\n\n` +
    `Analisa transkrip di atas. Tag semua objection customer.`

  const estimateInputTokens = Math.ceil(
    (SYSTEM_PROMPT.length + userPrompt.length) / 3.5,
  )

  const { result } = await executeAiWithCharge({
    featureKey: FEATURE_KEY,
    userId: session.userId,
    ctx: {
      referencePrefix: `live_obj:${session.id}`,
      description: `Objection analyze — session ${session.id}`,
      subjectType: 'LIVE_SESSION',
      subjectId: session.id,
      estimateInputTokens,
      estimateOutputTokens: MAX_OUTPUT,
      aiCall: async () => {
        const res = await client.messages.create({
          model: MODEL,
          max_tokens: MAX_OUTPUT,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        })
        const text = res.content
          .filter(
            (b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text',
          )
          .map((b) => b.text)
          .join('')
        return {
          result: text,
          inputTokens: res.usage.input_tokens,
          outputTokens: res.usage.output_tokens,
        }
      },
    },
  })

  let tags: ParsedTag[]
  try {
    tags = parseTags(result)
  } catch (err) {
    // Mark sebagai analyzed supaya tidak retry loop, log error.
    await prisma.liveSession.update({
      where: { id: session.id },
      data: { objectionsAnalyzedAt: new Date() },
    })
    throw new Error(`Parse objection JSON gagal: ${(err as Error).message}`)
  }

  // Validate + insert. Skip tag dengan category invalid (rename ke LAINNYA).
  const valid = tags
    .slice(0, 5)
    .map((t) => ({
      category: (VALID_KEYS.has(t.category) ? t.category : 'LAINNYA') as
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
        | 'LAINNYA',
      confidence: Math.max(0, Math.min(1, Number(t.confidence) || 0.5)),
      evidence: String(t.evidence ?? '').slice(0, 800),
      aiNotes: t.aiNotes ? String(t.aiNotes).slice(0, 500) : null,
    }))
    .filter((t) => t.evidence.length > 0)

  // Hapus tag existing (kalau force re-analyze) + insert baru.
  await prisma.$transaction(async (tx) => {
    if (input.force) {
      await tx.liveObjection.deleteMany({ where: { liveSessionId: session.id } })
    }
    if (valid.length > 0) {
      await tx.liveObjection.createMany({
        data: valid.map((t) => ({
          liveSessionId: session.id,
          userId: session.userId,
          category: t.category,
          confidence: t.confidence,
          evidence: t.evidence,
          aiNotes: t.aiNotes,
        })),
      })
    }
    await tx.liveSession.update({
      where: { id: session.id },
      data: { objectionsAnalyzedAt: new Date() },
    })
  })

  return { analyzed: true, tagsCount: valid.length }
}

// Batch processor — dipanggil cron. Pick session yg belum analyzed,
// messageCount >= MIN_TURNS, max N per run.
export async function batchAnalyzePendingSessions(input: {
  limit?: number
}): Promise<{ checked: number; analyzed: number; failed: number }> {
  const limit = input.limit ?? 20
  const pending = await prisma.liveSession.findMany({
    where: {
      objectionsAnalyzedAt: null,
      messageCount: { gte: MIN_TURNS_TO_ANALYZE },
    },
    take: limit,
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  })

  let analyzed = 0
  let failed = 0
  for (const s of pending) {
    try {
      const res = await analyzeSessionObjections({ liveSessionId: s.id })
      if (res.analyzed) analyzed++
    } catch (err) {
      console.error('[objection-analyzer] session', s.id, 'gagal:', (err as Error).message)
      failed++
    }
  }
  return { checked: pending.length, analyzed, failed }
}
