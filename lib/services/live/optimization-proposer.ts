// Fase 4 brief — AI usul perubahan systemPrompt / greeting / rebuttal
// berdasarkan pattern session won/lost + objection tags.
//
// Strategi:
//   1. Ambil sample session terbaru (max 30): mix won (CLOSED_WON), lost
//      (CLOSED_LOST + DROPPED), dan open dengan ≥3 turn.
//   2. Build context: objection counts + 5 contoh win + 5 contoh lost.
//   3. Sonnet propose 1-3 perubahan kongkrit dengan rationale + evidence.
//   4. Insert LiveOptimizationProposal rows status=PENDING.
//   5. Owner approve → apply ke LiveRoom + snapshot before.

import Anthropic from '@anthropic-ai/sdk'

import { prisma } from '@/lib/prisma'
import { executeAiWithCharge } from '@/lib/services/ai-generation-log'

import { getLiveApiKey } from './provider-keys'
import { buildTranscript } from './tangkap'

const FEATURE_KEY = 'LIVE_OPTIMIZE_PROPOSE'
const MODEL = 'claude-sonnet-4-6'
const MAX_OUTPUT = 4000

const BEGIN = '<<<PROPOSALS>>>'
const END = '<<<END>>>'

interface RawProposal {
  targetAsset: 'SYSTEM_PROMPT' | 'GREETING' | 'REBUTTAL_NOTE'
  title: string
  proposalText: string
  rationale: string
  evidenceSessionIds?: string[]
}

const SYSTEM_PROMPT = `Kamu adalah CRO consultant Indonesia yg analisa live shopping AI host. Tugasmu:
1. Lihat pattern objection + win/lost dari data.
2. Usulkan 1-3 perubahan KONGKRET yg punya theory of change jelas.

3 jenis target perubahan (PILIH SALAH SATU per proposal):
- SYSTEM_PROMPT: ubah persona/aturan host. Ganti seluruh system prompt baru. Contoh: tambah aturan "selalu validasi dulu sebelum kasih solusi" karena banyak customer drop di KURANG_PAHAM.
- GREETING: ubah greeting awal customer. Singkat, max 3 kalimat.
- REBUTTAL_NOTE: free-form catatan tentang rebuttal terbukti closing (owner copy manual ke knowledge / followup). Cocok kalau pattern: 1 jenis rebuttal di kasus WON yg recurring.

ATURAN OUTPUT:
- Maks 3 proposals per run.
- Tiap proposal HARUS punya: title (max 80 char), proposalText (text yg di-apply atau di-copy), rationale (alasan + bukti), evidenceSessionIds (opsional 1-3 session id yang jadi rujukan).
- proposalText untuk SYSTEM_PROMPT = seluruh prompt baru (lengkap, bukan diff).
- proposalText untuk GREETING = greeting baru.
- proposalText untuk REBUTTAL_NOTE = teks notes free-form.
- Bahasa proposalText = Bahasa Indonesia santai (akan dipakai host AI).

OUTPUT WAJIB JSON murni (tidak ada markdown ata text di luar) di antara marker:
${BEGIN}
{"proposals":[{"targetAsset":"SYSTEM_PROMPT","title":"...","proposalText":"...","rationale":"...","evidenceSessionIds":["..."]}]}
${END}`

interface AnalysisContext {
  roomName: string
  currentSystemPrompt: string
  currentGreeting: string | null
  objectionsTop: Array<{ category: string; count: number }>
  wonSessions: Array<{ id: string; transcript: string }>
  lostSessions: Array<{ id: string; transcript: string }>
  openSessions: Array<{ id: string; transcript: string }>
}

function buildUserPrompt(ctx: AnalysisContext): string {
  const sections: string[] = []
  sections.push(`Live Room: "${ctx.roomName}"`)
  sections.push('')
  sections.push('=== CURRENT SYSTEM PROMPT ===')
  sections.push(ctx.currentSystemPrompt)
  sections.push('')
  if (ctx.currentGreeting) {
    sections.push('=== CURRENT GREETING ===')
    sections.push(ctx.currentGreeting)
    sections.push('')
  }
  sections.push('=== TOP OBJECTIONS (count) ===')
  sections.push(
    ctx.objectionsTop.map((o) => `- ${o.category}: ${o.count}×`).join('\n') || '(belum ada data objection)',
  )
  sections.push('')
  if (ctx.wonSessions.length > 0) {
    sections.push(`=== ${ctx.wonSessions.length} CONTOH WIN (CLOSED_WON) ===`)
    for (const s of ctx.wonSessions) {
      sections.push(`--- session ${s.id} ---`)
      sections.push(s.transcript.slice(0, 1500))
    }
    sections.push('')
  }
  if (ctx.lostSessions.length > 0) {
    sections.push(`=== ${ctx.lostSessions.length} CONTOH LOST (CLOSED_LOST / DROPPED) ===`)
    for (const s of ctx.lostSessions) {
      sections.push(`--- session ${s.id} ---`)
      sections.push(s.transcript.slice(0, 1500))
    }
    sections.push('')
  }
  if (ctx.openSessions.length > 0) {
    sections.push(`=== ${ctx.openSessions.length} CONTOH ENGAGED-OPEN (belum closing) ===`)
    for (const s of ctx.openSessions) {
      sections.push(`--- session ${s.id} ---`)
      sections.push(s.transcript.slice(0, 1500))
    }
  }
  sections.push('')
  sections.push('Berdasarkan data di atas, usulkan 1-3 perubahan kongkrit untuk improve closing rate.')
  return sections.join('\n')
}

function parseProposals(raw: string): RawProposal[] {
  const begin = raw.indexOf(BEGIN)
  const end = raw.indexOf(END, begin)
  if (begin === -1 || end === -1) {
    throw new Error('Marker output tidak ditemukan')
  }
  const json = raw.slice(begin + BEGIN.length, end).trim()
  const parsed = JSON.parse(json) as { proposals?: RawProposal[] }
  return parsed.proposals ?? []
}

export async function generateProposalsForRoom(input: {
  liveRoomId: string
}): Promise<{ created: number; skipped?: string }> {
  const room = await prisma.liveRoom.findUnique({
    where: { id: input.liveRoomId },
    select: {
      id: true,
      userId: true,
      name: true,
      systemPrompt: true,
      greeting: true,
    },
  })
  if (!room) return { created: 0, skipped: 'room not found' }

  // Build sample sessions (won + lost + open). Pakai outcome dari LiveSession.
  // Lost = CLOSED_LOST or DROPPED.
  const [won, lost, open, objAgg] = await Promise.all([
    prisma.liveSession.findMany({
      where: { liveRoomId: room.id, outcome: 'CLOSED_WON' },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: { id: true },
    }),
    prisma.liveSession.findMany({
      where: {
        liveRoomId: room.id,
        outcome: { in: ['CLOSED_LOST', 'DROPPED'] },
      },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: { id: true },
    }),
    prisma.liveSession.findMany({
      where: {
        liveRoomId: room.id,
        outcome: 'OPEN',
        messageCount: { gte: 3 },
      },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: { id: true },
    }),
    prisma.liveObjection.groupBy({
      by: ['category'],
      where: { liveSession: { liveRoomId: room.id } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
  ])

  const totalEvidence = won.length + lost.length + open.length
  if (totalEvidence === 0) {
    return { created: 0, skipped: 'tidak ada session untuk analisa' }
  }

  // Build transcripts paralel.
  const [wonTr, lostTr, openTr] = await Promise.all([
    Promise.all(won.map(async (s) => ({ id: s.id, transcript: await buildTranscript(s.id) }))),
    Promise.all(lost.map(async (s) => ({ id: s.id, transcript: await buildTranscript(s.id) }))),
    Promise.all(open.map(async (s) => ({ id: s.id, transcript: await buildTranscript(s.id) }))),
  ])

  const ctx: AnalysisContext = {
    roomName: room.name,
    currentSystemPrompt: room.systemPrompt,
    currentGreeting: room.greeting,
    objectionsTop: objAgg.map((o) => ({ category: o.category, count: o._count.id })),
    wonSessions: wonTr,
    lostSessions: lostTr,
    openSessions: openTr,
  }

  const userPrompt = buildUserPrompt(ctx)
  const estimateInputTokens = Math.ceil(
    (SYSTEM_PROMPT.length + userPrompt.length) / 3.5,
  )

  const apiKey = await getLiveApiKey('ANTHROPIC')
  const client = new Anthropic({ apiKey })

  const { result } = await executeAiWithCharge({
    featureKey: FEATURE_KEY,
    userId: room.userId,
    ctx: {
      referencePrefix: `live_optimize:${room.id}`,
      description: `Optimization proposals — room ${room.name}`,
      subjectType: 'LIVE_ROOM',
      subjectId: room.id,
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

  let proposals: RawProposal[]
  try {
    proposals = parseProposals(result)
  } catch (err) {
    throw new Error(`Parse proposals JSON gagal: ${(err as Error).message}`)
  }

  // Insert proposals (max 3, validate target).
  const validTargets = new Set(['SYSTEM_PROMPT', 'GREETING', 'REBUTTAL_NOTE'])
  const cleaned = proposals
    .slice(0, 3)
    .filter((p) => validTargets.has(p.targetAsset))
    .filter((p) => p.proposalText?.length >= 5)
    .map((p) => ({
      userId: room.userId,
      liveRoomId: room.id,
      targetAsset: p.targetAsset,
      title: (p.title ?? '').slice(0, 180) || `Usul ${p.targetAsset.toLowerCase()}`,
      proposalText: p.proposalText.slice(0, 8000),
      rationale: (p.rationale ?? '').slice(0, 4000),
      evidenceSessionIds: (p.evidenceSessionIds ?? []).slice(0, 5),
    }))

  if (cleaned.length === 0) return { created: 0, skipped: 'AI tidak hasilkan proposal valid' }

  await prisma.liveOptimizationProposal.createMany({ data: cleaned })
  return { created: cleaned.length }
}
