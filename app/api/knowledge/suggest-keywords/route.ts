// POST /api/knowledge/suggest-keywords
// Generate 5 kata kunci pemicu pakai Claude Haiku berdasarkan judul + isi.
// Output: { keywords: string[], charge: { tokensCharged, ... } }.
//
// Charging: pay-as-usage via AiFeatureConfig featureKey=KNOWLEDGE_KEYWORD_SUGGEST.
// Lewat executeAiWithCharge → guaranteed log + deduct (no silent bypass).
// Admin tunable via /admin/ai-features. Default margin 2.0 (50% gross profit).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { getAnthropicClient } from '@/lib/anthropic'
import {
  executeAiWithCharge,
  InsufficientBalanceError,
} from '@/lib/services/ai-generation-log'
import { getAiFeatureConfig } from '@/lib/services/ai-feature-config'
import { suggestKeywordsSchema } from '@/lib/validations/knowledge'

const FEATURE_KEY = 'KNOWLEDGE_KEYWORD_SUGGEST'
// Estimasi token untuk pre-flight check. Real usage akan replace ini setelah
// AI response. Estimate generous untuk avoid false-negative balance check.
const ESTIMATE_INPUT_TOKENS = 1_500
const ESTIMATE_OUTPUT_TOKENS = 400

const SYSTEM_PROMPT = `Kamu bantu user generate "trigger keywords" untuk AI CS WhatsApp Indonesia. Tujuan: AI bisa kirim knowledge ini saat customer butuh, walau customer TIDAK nyebut topiknya secara langsung.

## Cara pikir: 2 dimensi keyword

### Dimensi 1: KATA LITERAL (customer sebut topiknya)
Customer langsung minta info ini. Pakai bahasa CHAT, bukan bahasa baku.

✅ BOLEH: "testi", "testinya", "ada testi", "buktinya", "fotonya", "hasilnya", "udah ada yg pake", "udah ada yg coba"
❌ JANGAN: "pengalaman pengguna" (terlalu baku), "kesaksian konsumen" (formal banget), "ulasan pelanggan" (bahasa kantor)

### Dimensi 2: KERAGUAN/CONCERN (customer punya doubt yang DIJAWAB oleh knowledge ini)
Ini bagian KRITIS. Customer sering tidak minta langsung — mereka ekspresikan KERAGUAN, dan jawaban terbaik kebetulan knowledge ini.

Contoh untuk knowledge **testimoni produk pembersih mesin**:
- "ngrusak mesin ga", "merusak ga", "bahaya ga", "aman ga sih"
- "beneran ampuh ga", "works ga", "ngaruh ga", "beneran efektif"
- "ada efek samping", "efek nya gimana"
- "scam ga", "penipuan ga", "ori ga", "asli ga"
- "udah ada yg berhasil", "udah ada yg sembuh", "ada yg cocok ga"

Customer ketik kata-kata di atas → AI ngerti dia butuh ASSURANCE → kirim testimoni = jawaban tepat.

Aturan keraguan: cuma masukkan kategori ini KALAU knowledge-nya sifat ASSURANCE/SOCIAL-PROOF (testimoni, garansi, sertifikat, review, before-after). Kalau knowledge-nya cuma daftar harga / jam buka / alamat, SKIP dimensi keraguan.

## Pikir seperti customer Indonesia di WhatsApp
- Singkat, sering typo, sering pakai "ga/ngga/gak" bukan "tidak"
- "udah" bukan "sudah"; "gimana" bukan "bagaimana"; "ngerusak" bukan "merusak"
- Tanpa tanda tanya/baca di chat
- Frasa pendek 1-4 kata
- Pakai kata sehari-hari: "rusak", "aman", "cocok", "ampuh", "works", "manjur", "kelar", "berhasil", "sembuh"

## Yang DILARANG keras
- **Frasa marketing/iklan**: "produk amazing", "berharga", "berkualitas tinggi", "terbaik", "premium"
- **Brand + kata sifat**: "cleanoz manjur", "cleanoz berharga" — itu kalimat penjual
- **Bahasa kantor/baku**: "pengalaman pengguna", "kesaksian konsumen", "umpan balik", "konsumen mengatakan"
- **Kalimat panjang naratif**: "saya ingin tahu apakah produk ini aman"
- **Kata generik over-broad**: "info", "tanya", "halo", "min", "kak", "mas", "permisi"

## Test mental tiap keyword
Sebelum keluarkan keyword, tanya: "Kalau saya intip 100 chat WA real, berapa kali kira-kira customer ketik frasa persis ini?" Kalau jawabannya <5, BUANG.

## Aturan output
- Output JSON saja: { "keywords": ["...", "..."] }. JANGAN komentar/penjelasan.
- Lowercase semua, tanpa tanda baca (kecuali spasi).
- Tiap keyword 1-4 kata, panjang 2-40 karakter.
- Kalau ada keyword existing, JANGAN ulang.
- Target PRESIS: 5 keyword. MIX dimensi 1 (literal) dan dimensi 2 (keraguan). Untuk knowledge social-proof (testimoni/garansi/sertifikat), bagi sekitar 2 literal + 3 keraguan. Untuk knowledge non-assurance (harga/jam buka/alamat), 5 literal saja.
- Sedikit-tapi-tepat > banyak-tapi-aneh. Pilih 5 keyword PALING BAGUS — yang benar-benar bakal muncul di chat WA real.`

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }
  const userId = session.user.id

  const json = await req.json().catch(() => null)
  const parsed = suggestKeywordsSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  const { title, contentType, textContent, caption, existingKeywords } = parsed.data

  const userPrompt = [
    `Judul: ${title}`,
    `Jenis: ${contentType}`,
    textContent ? `Isi:\n${textContent}` : null,
    caption ? `Caption:\n${caption}` : null,
    existingKeywords && existingKeywords.length > 0
      ? `Keyword sudah ada (JANGAN ulang, kasih variasi BARU):\n${existingKeywords.map((k) => `- ${k}`).join('\n')}`
      : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  const config = await getAiFeatureConfig(FEATURE_KEY)

  try {
    const { result: keywords, charge } = await executeAiWithCharge<string[]>({
      featureKey: FEATURE_KEY,
      userId,
      ctx: {
        referencePrefix: 'kb_suggest',
        description: 'Optimasi Keyword Knowledge',
        subjectType: 'KNOWLEDGE',
        estimateInputTokens: ESTIMATE_INPUT_TOKENS,
        estimateOutputTokens: ESTIMATE_OUTPUT_TOKENS,
        aiCall: async () => {
          const client = getAnthropicClient()
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
            jsonStart >= 0 && jsonEnd > jsonStart
              ? text.slice(jsonStart, jsonEnd + 1)
              : text
          let parsedAi: { keywords?: unknown }
          try {
            parsedAi = JSON.parse(jsonText)
          } catch {
            // AI sudah charged ke Anthropic — caller helper akan deduct via UUID-suffix.
            // Kita kembalikan array kosong, tetap charge user (cost real).
            return {
              result: [],
              inputTokens: response.usage.input_tokens,
              outputTokens: response.usage.output_tokens,
            }
          }
          const existingLower = new Set(
            (existingKeywords ?? []).map((k) => k.toLowerCase().trim()),
          )
          const filtered = Array.isArray(parsedAi.keywords)
            ? (parsedAi.keywords as unknown[])
                .filter((k): k is string => typeof k === 'string')
                .map((k) => k.toLowerCase().trim())
                .filter((k) => k.length >= 2 && k.length <= 40)
                .filter((k) => !existingLower.has(k))
                .slice(0, 5)
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
      keywords,
      charge: {
        tokensCharged: charge.tokensCharged,
        modelName: charge.modelName,
      },
    })
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      return jsonError(
        `Saldo token tidak cukup. Butuh ±${err.tokensRequired} token, top-up dulu di Tagihan.`,
        402,
      )
    }
    console.error('[POST /api/knowledge/suggest-keywords] gagal:', err)
    return jsonError('Gagal panggil AI. Coba beberapa saat lagi.', 500)
  }
}
