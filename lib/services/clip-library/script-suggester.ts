// Bulk script suggester — Claude generate N script siap pakai per kategori
// untuk Klip Live library, berdasarkan detail produk + target count.
//
// Strategi distribusi:
//   5 klip:  1 GREETING, 1 PRODUCT_DEMO, 1 PRICE, 1 CLOSING, 1 IDLE
//   10 klip: 2 GREETING, 3 PRODUCT_DEMO, 2 PRICE, 1 OBJECTION, 1 CLOSING, 1 IDLE
//   15 klip: 2 GREETING, 4 PRODUCT_DEMO, 2 PRICE, 2 OBJECTION, 3 CLOSING, 1 GENERAL, 1 IDLE
//   20 klip: 3 GREETING, 5 PRODUCT_DEMO, 3 PRICE, 3 OBJECTION, 3 CLOSING, 2 GENERAL, 1 IDLE
//
// Constraint: tiap script max 120 char (fit 10s baseline, ~129 budget).
// Script Bahasa Indonesia casual, ID TikTok Live vibe.

import Anthropic from '@anthropic-ai/sdk'

import { getLiveApiKey } from '@/lib/services/live/provider-keys'

const MODEL = 'claude-haiku-4-5'
const MAX_TOKENS = 4000

export type TargetCount = 5 | 10 | 15 | 20

const DISTRIBUTION: Record<TargetCount, Record<string, number>> = {
  5: { GREETING: 1, PRODUCT_DEMO: 1, PRICE: 1, CLOSING: 1, IDLE: 1 },
  10: { GREETING: 2, PRODUCT_DEMO: 3, PRICE: 2, OBJECTION: 1, CLOSING: 1, IDLE: 1 },
  15: { GREETING: 2, PRODUCT_DEMO: 4, PRICE: 2, OBJECTION: 2, CLOSING: 3, GENERAL: 1, IDLE: 1 },
  20: { GREETING: 3, PRODUCT_DEMO: 5, PRICE: 3, OBJECTION: 3, CLOSING: 3, GENERAL: 2, IDLE: 1 },
}

export interface SuggestedScript {
  category: string
  script: string
  charCount: number
  // Sprint 5+: psychology metadata supaya owner paham WHY script ini
  trigger?: string // mis "scarcity_stock + specific_action"
  kpi_goal?: string // mis "click_card", "watch_10sec", "build_conviction"
}

export interface ScriptSuggestInput {
  productName: string
  productDescription?: string
  price?: number // dalam IDR
  benefits?: string[] // 1-5 manfaat utama
  targetCustomer?: string // e.g. "pemilik motor"
  brandTone?: string // e.g. "casual playful" | "professional warm"
  count: TargetCount
}

const SYSTEM_PROMPT = `Kamu Indonesian Top Live Shopping Copywriter level Tokopedia/Shopee Star Seller. Tugas: generate N script siap-diucapkan host di klip lipsync 10dtk.

=== REALITY FRAMING (BUKAN SOFT SELL) ===
- Watcher avg attention: 30-90 detik. Hook + value padat di 30dtk pertama wajib.
- In-live conversion 2-8%, sisanya leave. Post-live decay -50% per hari.
- Mission setiap script: convert NOW (5% high-intent) ATAU lock engagement (95% lain).
- Bukan persuasi gradual — push hard, action-or-clarity.

=== 4 PSYCHOLOGY TRIGGERS YANG TERBUKTI CONVERT ===
1. Scarcity (stock/time) — wajib di CLOSING, optional PRICE
2. Loss aversion — frame "rugi kalau nunda" > "untung kalau pakai". Pakai di OBJECTION + CLOSING.
3. Social proof konkret dengan angka — "47 customer udah pakai bulan ini" (bukan "banyak yang udah pakai")
4. Authority spesifik — sertifikat/test/source (kalau ada di produk)

=== CTA SPESIFIK (PENTING!) ===
Action SATU-SATUNYA yang valid: "klik kartu produk" (atau variasi: "tap kartu produk", "klik produknya di samping", "tap di gambar produk")
JANGAN suruh: komen di chat, klik link WA, scroll, share, like, follow — itu boros token AI dan gak convert ke order.

=== ATURAN KARAKTER ===
1. MAX 120 KARAKTER per script (termasuk spasi).
2. Bahasa Indonesia casual TikTok Live: "kakak", "kak", "yuk", "buruan", "sayang", "banget", "nih", "kak sis".
3. 1 script = 1 thought, gak storytelling panjang.
4. Pause via koma untuk natural TTS reading.
5. JANGAN: URL, hashtag, emoji, "Pak/Bu yth", "kami persembahkan", "luar biasa", "fantastis", "kualitas terjamin" (AI cliché).
6. JANGAN compound sentence > 18 kata.

=== MISI PER KATEGORI ===
- GREETING: Hook + tease value. Bikin viewer stay >10 detik. Mix patterns: warm welcome / curiosity / interrupt-scroll / target / FOMO.
- PRODUCT_DEMO: 1 manfaat konkret dengan angka/hasil spesifik (gak generic). Build conviction. Kemana arah aksi: "kak liat kartu produknya".
- PRICE: Anchor high → reveal low, atau cost-of-waiting frame. End dengan "klik kartu produk" CTA.
- OBJECTION: Empathy 1 kalimat + reframe 1 kalimat. Tutup dengan action.
- CLOSING: Stack 2+ urgency (scarcity + time / stock + bonus). CTA HARD: "klik kartu produk SEKARANG".
- IDLE: Output kosong string "".
- GENERAL: Fallback umum, tetep arah ke produk.

=== VARIATION DI KATEGORI SAMA ===
Kalau >1 script per kategori, BEDA ANGLE wajib:
- GREETING-1: warm welcome
- GREETING-2: curiosity hook
- GREETING-3: urgency opener
- PRODUCT_DEMO-1: feature focus (bahan/cara kerja)
- PRODUCT_DEMO-2: benefit focus (hasil setelah pakai)
- PRODUCT_DEMO-3: comparison (sebelum vs sesudah)
- CLOSING-1: time urgency
- CLOSING-2: stock urgency
- CLOSING-3: price-revert urgency (habis ini balik normal)

=== OUTPUT JSON only between BEGIN_JSON dan END_JSON ===
Tiap script di-tag dengan trigger + goal supaya owner paham WHY:

{
  "scripts": [
    {
      "category": "GREETING",
      "script": "Halo kakak sayaaang! Welcome ke live Cleanoz, lagi flash sale gila nih!",
      "trigger": "warm_welcome + urgency_tease",
      "kpi_goal": "watch_10sec"
    },
    {
      "category": "PRODUCT_DEMO",
      "script": "Cleanoz bersihin kerak piston, BBM langsung irit 25%, sekali pakai kerasa!",
      "trigger": "specific_number + sensory",
      "kpi_goal": "build_conviction"
    },
    {
      "category": "PRICE",
      "script": "Normalnya 100rb, sekarang cuma 65rb kak! Klik kartu produknya disamping!",
      "trigger": "anchor_high_reveal_low + action",
      "kpi_goal": "click_card"
    },
    {
      "category": "OBJECTION",
      "script": "Yang nunggu besok biasanya nyesel kak, harga balik 100rb pasti!",
      "trigger": "loss_aversion + scarcity_time",
      "kpi_goal": "click_card"
    },
    {
      "category": "CLOSING",
      "script": "Stok tinggal 5 kak! Klik kartu produknya SEKARANG, habis ini sold out!",
      "trigger": "scarcity_stock + specific_action",
      "kpi_goal": "click_card"
    },
    { "category": "IDLE", "script": "", "trigger": "silent_loop", "kpi_goal": "background_presence" }
  ]
}

JANGAN tulis prose di luar marker JSON. JANGAN markdown.`

function buildUserPrompt(input: ScriptSuggestInput): string {
  const dist = DISTRIBUTION[input.count]
  const distLines = Object.entries(dist)
    .map(([cat, n]) => `- ${cat}: ${n} script`)
    .join('\n')
  const lines: string[] = []
  lines.push(`PRODUK: ${input.productName}`)
  if (input.productDescription) lines.push(`Deskripsi: ${input.productDescription}`)
  if (input.price) lines.push(`Harga: Rp ${input.price.toLocaleString('id-ID')}`)
  if (input.benefits && input.benefits.length > 0) {
    lines.push(`Manfaat utama:`)
    for (const b of input.benefits) lines.push(`- ${b}`)
  }
  if (input.targetCustomer) lines.push(`Target customer: ${input.targetCustomer}`)
  if (input.brandTone) lines.push(`Brand tone: ${input.brandTone}`)
  lines.push('')
  lines.push(`Total ${input.count} script dengan distribusi:`)
  lines.push(distLines)
  lines.push('')
  lines.push(
    'Generate semua. Pastikan distribusi pas, max 120 char per script, Bahasa Indo casual TikTok Live vibe. Output JSON murni antara marker.',
  )
  return lines.join('\n')
}

function parseScripts(raw: string): SuggestedScript[] {
  const beginIdx = raw.indexOf('BEGIN_JSON')
  const endIdx = raw.indexOf('END_JSON')
  let jsonStr = raw
  if (beginIdx >= 0 && endIdx > beginIdx) {
    jsonStr = raw.slice(beginIdx + 'BEGIN_JSON'.length, endIdx).trim()
  }
  jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  // Fallback: cari first {
  if (!jsonStr.startsWith('{')) {
    const firstBrace = jsonStr.indexOf('{')
    const lastBrace = jsonStr.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1)
    }
  }
  const parsed = JSON.parse(jsonStr) as {
    scripts?: Array<{
      category: string
      script: string
      trigger?: string
      kpi_goal?: string
    }>
  }
  if (!parsed.scripts || !Array.isArray(parsed.scripts)) {
    throw new Error('Output tidak punya field scripts[]')
  }
  return parsed.scripts.map((s) => ({
    category: s.category,
    script: s.script ?? '',
    charCount: (s.script ?? '').length,
    trigger: s.trigger,
    kpi_goal: s.kpi_goal,
  }))
}

export async function suggestScripts(
  input: ScriptSuggestInput & { userId?: string },
): Promise<SuggestedScript[]> {
  if (!DISTRIBUTION[input.count]) {
    throw new Error(`count harus 5/10/15/20, dapat ${input.count}`)
  }
  const apiKey = await getLiveApiKey('ANTHROPIC')
  const client = new Anthropic({ apiKey })

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
  })

  const raw = res.content
    .filter((b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  const scripts = parseScripts(raw)
  // Validate budget: trim ke 120 char kalau over (defensive).
  for (const s of scripts) {
    if (s.script.length > 120) {
      s.script = s.script.slice(0, 117) + '...'
      s.charCount = s.script.length
    }
  }

  // Billing — KLIP_LIVE_SCRIPT_SUGGEST per call, charge real Claude token usage
  if (input.userId) {
    try {
      const { computeMediaCharge } = await import('@/lib/services/media-charge')
      const { deductTokenAtomic } = await import('@/lib/services/ai-generation-log')
      const totalTokens = (res.usage.input_tokens ?? 0) + (res.usage.output_tokens ?? 0)
      const charge = await computeMediaCharge({
        featureKey: 'KLIP_LIVE_SCRIPT_SUGGEST',
        units: totalTokens,
      })
      await deductTokenAtomic({
        userId: input.userId,
        tokensCharged: charge.tokensCharged,
        description: `Klip Live script suggester — ${scripts.length} scripts`,
        reference: `klip_suggest:${Date.now()}`,
      })
    } catch (e) {
      console.warn('[script-suggester] billing skip:', (e as Error).message)
    }
  }

  return scripts
}
