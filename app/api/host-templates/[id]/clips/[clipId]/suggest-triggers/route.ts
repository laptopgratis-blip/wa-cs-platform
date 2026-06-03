// POST /api/host-templates/[id]/clips/[clipId]/suggest-triggers
// Generate trigger phrases pakai Claude Haiku berdasarkan transcript klip + kategori.
// Pattern: mirror /api/knowledge/suggest-keywords — dimensi LITERAL + KERAGUAN.
// Output: { triggers: string[], charge: { tokensCharged, modelName } }
//
// Charging via AiFeatureConfig featureKey=KLIP_LIVE_TRIGGER_SUGGEST.

import Anthropic from '@anthropic-ai/sdk'
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { getAiFeatureConfig } from '@/lib/services/ai-feature-config'
import {
  executeAiWithCharge,
  InsufficientBalanceError,
} from '@/lib/services/ai-generation-log'
import { getLiveApiKey } from '@/lib/services/live/provider-keys'

const FEATURE_KEY = 'KLIP_LIVE_TRIGGER_SUGGEST'
const ESTIMATE_INPUT_TOKENS = 1_200
const ESTIMATE_OUTPUT_TOKENS = 350

const schema = z.object({
  // existingTriggers: kasih ke AI biar gak ngulang
  existingTriggers: z.array(z.string()).max(40).optional(),
})

const SYSTEM_PROMPT = `Kamu bantu owner live shopping Indonesia generate "trigger phrase" untuk klip video host AI. Tujuan: saat customer chat frasa tertentu di live, klip ini auto-dipilih untuk dijawab.

## Konteks
Owner punya library klip video host (per kategori: GREETING, PRICE, PRODUCT_DEMO, OBJECTION, CLOSING). Setiap klip transcript-nya bisa pendek (1-3 kalimat marketing). Customer di live nanya pakai bahasa CHAT — singkat, tipo, slang.

## Cara pikir: 2 dimensi trigger

### Dimensi 1: KATA LITERAL (customer sebut topik klip)
Customer langsung minta hal yang klip ini jawab. Pakai bahasa chat WA Indonesia, bukan bahasa baku.

✅ BOLEH:
- Klip PRICE: "harga", "berapa", "brp", "harganya brp", "biaya", "ongkos", "kena berapa"
- Klip GREETING: "halo", "hai", "permisi", "siang", "kenalan", "baru masuk"
- Klip PRODUCT_DEMO: "cara pakai", "gimana pakenya", "fungsinya", "kandungan", "bahan", "kerjanya gimana"
- Klip CLOSING: "beli dimana", "order", "pesen", "checkout", "minat", "mau ambil", "klik dimana"

❌ JANGAN:
- "tanya harga" (terlalu baku)
- "info produk" (generic ngambang)
- Brand name doang ("cleanoz") — too broad, semua klip kena
- Kalimat panjang ("saya mau tahu harga produk ini")

### Dimensi 2: KERAGUAN/CONCERN (customer punya doubt yang klip ini JAWAB)
Customer kadang tidak minta langsung — mereka express KERAGUAN, dan klip ini kebetulan jawaban tepat.

Contoh:
- Klip OBJECTION: "kok mahal", "kemahalan", "ragu", "aman ga", "scam ga", "asli ga", "ori ga", "efek samping"
- Klip CLOSING (urgency): "masih ada", "stok ada", "kosong", "habis", "tinggal berapa"
- Klip PRODUCT_DEMO (assurance): "beneran works", "manjur ga", "ampuh ga", "ngaruh ga"
- Klip PRICE (objection-shaped): "diskon", "promo", "potongan", "cashback", "flash sale"

Aturan: trigger dimensi 2 cocok kalau klip mengandung jawaban ASSURANCE/HANDLE-OBJECTION/SCARCITY. Untuk klip greeting murni, skip dimensi 2.

## Pikir seperti customer Indonesia live shopping
- Singkat, sering typo: "gmn", "gimana", "brp", "ga"/"ngga"/"gak", "udah"
- Slang: "kak", "min", "bos", "sis", "kakak" (TAPI jangan tag sapaan polos — semua klip kena)
- Tanpa tanda baca lengkap
- 1-4 kata
- Pakai kata sehari-hari: "rusak", "aman", "cocok", "ampuh", "works", "manjur", "habis", "kelar"

## DILARANG keras
- **Frasa marketing**: "produk amazing", "berkualitas", "terbaik", "premium"
- **Bahasa kantor**: "kesaksian", "umpan balik", "pengalaman pengguna"
- **Generic over-broad**: "info", "tanya", "halo aja", "kak" (tanpa konteks)
- **Brand polos**: "cleanoz", "felow" — terlalu luas, tag semua klip
- **Kategori abstract**: "harga", "price" pas keduanya — pakai bahasa Indo dominan

## Test mental
"Kalau saya intip 100 chat live shopping WA real, berapa kali kira-kira customer ketik frasa persis ini SAAT lagi butuh klip kategori ini?" Kalau <5x, BUANG.

## Output rules
- Output JSON saja: { "triggers": ["...", "..."] }. JANGAN narasi.
- Lowercase semua, tanpa tanda baca.
- Tiap trigger 1-4 kata, panjang 2-40 karakter.
- Kalau ada trigger existing, JANGAN ulang.
- Target: 7 trigger. Mix literal (5) + concern/keraguan (2) untuk klip non-greeting. Untuk GREETING: 7 literal saja.
- Spesifik > generik. Pilih trigger yang BENERAN muncul di chat real.`

export async function POST(
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

  const clip = await prisma.liveClip.findUnique({
    where: { id: clipId },
    select: {
      hostTemplateId: true,
      userId: true,
      transcript: true,
      category: true,
      summary: true,
      triggerKeywords: true,
    },
  })
  if (!clip || clip.hostTemplateId !== id) return jsonError('Klip tidak ditemukan', 404)
  if (session.user.role !== 'ADMIN' && clip.userId !== session.user.id) {
    return jsonError('Tidak punya akses', 403)
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body invalid', 400)
  }
  const existing = parsed.data.existingTriggers ?? clip.triggerKeywords

  const userPrompt = [
    `Kategori klip: ${clip.category}`,
    clip.summary ? `Ringkasan: ${clip.summary}` : null,
    `Transcript klip (yang host ucapkan):\n${clip.transcript.slice(0, 800)}`,
    existing.length > 0
      ? `Trigger sudah ada (JANGAN ulang, kasih variasi BARU):\n${existing.map((k) => `- ${k}`).join('\n')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  const config = await getAiFeatureConfig(FEATURE_KEY)

  try {
    const { result: triggers, charge } = await executeAiWithCharge<string[]>({
      featureKey: FEATURE_KEY,
      userId: clip.userId,
      ctx: {
        referencePrefix: `clip_trigger_suggest:${clipId}`,
        description: `Optimasi Trigger Klip (${clip.category})`,
        subjectType: 'LIVE_CLIP',
        estimateInputTokens: ESTIMATE_INPUT_TOKENS,
        estimateOutputTokens: ESTIMATE_OUTPUT_TOKENS,
        aiCall: async () => {
          const apiKey = await getLiveApiKey('ANTHROPIC')
          const client = new Anthropic({ apiKey })
          const response = await client.messages.create({
            model: config.modelName,
            max_tokens: 500,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
          })
          const text = response.content
            .filter((b) => b.type === 'text')
            .map((b) => (b as { text: string }).text)
            .join('')
            .trim()
          const jsonStart = text.indexOf('{')
          const jsonEnd = text.lastIndexOf('}')
          const jsonText =
            jsonStart >= 0 && jsonEnd > jsonStart ? text.slice(jsonStart, jsonEnd + 1) : text
          let parsedAi: { triggers?: unknown }
          try {
            parsedAi = JSON.parse(jsonText)
          } catch {
            return {
              result: [],
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            }
          }
          const existingLower = new Set(existing.map((k) => k.toLowerCase().trim()))
          const filtered = Array.isArray(parsedAi.triggers)
            ? (parsedAi.triggers as unknown[])
                .filter((k): k is string => typeof k === 'string')
                .map((k) => k.toLowerCase().trim().replace(/[?!.,]/g, ''))
                .filter((k) => k.length >= 2 && k.length <= 40)
                .filter((k) => !existingLower.has(k))
                .slice(0, 10)
            : []
          return {
            result: filtered,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          }
        },
      },
    })

    return jsonOk({
      triggers,
      charge: { tokensCharged: charge.tokensCharged, modelName: charge.modelName },
    })
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return jsonError(
        `Saldo token tidak cukup. Butuh ±${err.tokensRequired} token, top-up dulu.`,
        402,
      )
    }
    console.error('[suggest-triggers] gagal:', err)
    return jsonError('Gagal panggil AI. Coba lagi.', 500)
  }
}
