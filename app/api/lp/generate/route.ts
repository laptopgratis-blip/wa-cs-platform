// POST /api/lp/generate
// Body: { lpId, description, imageUrls, style, ctaType, waNumber }
//
// Validasi LP owner + saldo aktif minimal MIN_BALANCE_FOR_AI, panggil Claude
// (haiku) lewat streaming untuk dapat HTML lengkap, charge user proporsional
// (executeAiWithCharge dgn featureKey LP_GENERATE), return { html, tokensUsed }.
import Anthropic from '@anthropic-ai/sdk'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { DEFAULT_MODEL, getAnthropicClient } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'
import {
  executeAiWithCharge,
  InsufficientBalanceError,
} from '@/lib/services/ai-generation-log'
import {
  LP_CTA_TYPES,
  LP_STYLES,
  lpGenerateSchema,
} from '@/lib/validations/lp-generate'

// Threshold minimal saldo token aktif untuk boleh akses AI generate.
// User free dengan saldo di bawah ini di-block — diarahkan ke alur manual
// (copy prompt template ke ChatGPT/Claude.ai gratis lalu paste). Tujuan:
// hemat biaya AI provider untuk user yg tidak generate revenue. Gate ini
// terpisah dari skema charge — charge per call proporsional via featureKey.
const MIN_BALANCE_FOR_AI = 1000

// Max output tokens — HTML landing page bisa panjang. Streaming aman sampai
// 64K (cap Haiku 4.5).
const MAX_OUTPUT_TOKENS = 16_000

// Estimasi worst-case untuk pre-flight balance check di executeAiWithCharge.
// Charge real dihitung dari response.usage Anthropic setelah AI sukses.
const EST_INPUT_TOKENS = 1500
const EST_OUTPUT_TOKENS = 6000

const SYSTEM_PROMPT = `Kamu adalah expert web developer yang membuat landing page HTML yang indah dan konversi tinggi.

ATURAN OUTPUT (WAJIB):
- Buat HANYA kode HTML lengkap (mulai dari <!DOCTYPE html> sampai </html>).
- Sertakan <style>...</style> di dalam <head> — JANGAN pakai external CSS atau framework.
- TIDAK ADA markdown code fence (\`\`\`html), TIDAK ADA penjelasan, TIDAK ADA komentar di luar HTML.
- Output langsung byte pertama HTML, tanpa preamble.

ATURAN LAYOUT (PENTING — DEFAULT VERTIKAL 1 KOLOM):
- WAJIB single-column vertical layout. Section disusun stack ke bawah,
  full-width container (max-width ~640px-720px untuk readability), center-aligned.
  Goal: pengunjung tinggal scroll dari atas ke bawah, langsung sampai ke CTA tanpa
  decision overhead.
- TIDAK ADA sidebar. TIDAK ADA multi-column layout. TIDAK ADA hero
  split kiri-kanan teks/gambar. Bahkan di desktop, layout tetap 1 kolom yang
  di-center supaya konsisten dengan flow mobile.
- Pengecualian sempit (boleh dipakai HEMAT, tapi tetap di dalam container):
  grid 2-3 kolom kecil untuk daftar fitur/benefit (kartu icon + teks pendek)
  ATAU 2 kolom testimoni → maksimum 1-2 section seperti ini di seluruh LP.
- Urutan section ideal (top → bottom):
  1) Hero (judul kuat + sub-headline + tombol CTA pertama langsung di hero)
  2) Pain points / masalah customer (kalau relevan)
  3) Solusi / value proposition produk (1-2 paragraf)
  4) Benefit / fitur utama (grid kecil 2-3 kolom OK di sini)
  5) Social proof / testimoni (max 1 section, layout 1 kolom atau 2 kolom)
  6) CTA utama lagi (tombol besar, mudah di-tap)
  7) FAQ singkat (3-5 pertanyaan, accordion atau plain Q&A) — opsional
  8) Footer minimal (CTA terakhir + info kontak)
- Setiap section padding vertikal cukup (min 48px desktop, 32px mobile)
  supaya tidak terlalu dempet saat di-scroll.

ATURAN DESAIN:
- Responsif mobile dan desktop (pakai meta viewport + media query). Karena
  layout 1 kolom, perbedaan mobile vs desktop hanya font-size, padding, dan
  ukuran gambar — tidak butuh re-layout dramatis.
- Pakai CSS modern (flexbox/grid, custom properties, transitions).
- Hierarki visual jelas: hero → benefit → CTA.
- Gunakan gambar dari URL yang diberikan user — JANGAN buat URL gambar baru.
- Tombol CTA harus mencolok, mudah diklik di mobile (min 44x44px tap area,
  lebar tombol di mobile bisa ~80% container supaya susah ke-miss).
- CTA muncul minimal 2x: di hero & di section terakhir sebelum footer.
  Boleh tambahan CTA sticky di bawah viewport (position:sticky bottom) kalau
  cocok dengan style.
- Aksesibilitas dasar: alt text untuk semua <img>, kontras warna cukup.

ATURAN BAHASA:
- Semua teks dalam Bahasa Indonesia.
- Tone copy disesuaikan dengan style yang dipilih user.`

const STYLE_HINT: Record<string, string> = {
  MODERN_MINIMALIS:
    'Modern Minimalis — banyak white space, palet 2-3 warna netral (putih/abu/satu accent), tipografi sans-serif clean.',
  BOLD_COLORFUL:
    'Bold & Colorful — palet vibrant (gradient, warna kontras tinggi), tipografi display besar, dekorasi grafis berani.',
  ELEGAN_PREMIUM:
    'Elegan Premium — palet gelap atau monokrom dengan accent gold/silver, tipografi serif elegant, banyak detail kecil yang halus.',
  CASUAL_FRIENDLY:
    'Casual Friendly — warna hangat & ramah (peach/mint/cream), tipografi rounded, ilustrasi atau emoji ringan, copy santai.',
}

function buildCtaInstruction(
  ctaType: string,
  waNumber: string | undefined,
  _description: string,
): string {
  const labelMap = Object.fromEntries(LP_CTA_TYPES.map((c) => [c.value, c.label]))
  const label = labelMap[ctaType] ?? 'Klik di Sini'

  if (ctaType === 'WHATSAPP' && waNumber) {
    const preMsg = encodeURIComponent(
      `Halo, saya tertarik dengan produk Anda. Bisa info lebih lanjut?`,
    )
    return `Tombol CTA utama: text "${label}", link \`https://wa.me/${waNumber}?text=${preMsg}\`, target _blank.`
  }
  if (ctaType === 'BUY') {
    return `Tombol CTA utama: text "${label}", link \`#order\` atau anchor ke bagian order/form (boleh kasih form sederhana).`
  }
  if (ctaType === 'SIGNUP') {
    return `Tombol CTA utama: text "${label}", buat form pendaftaran sederhana (nama + email/WA) inline atau di section terpisah.`
  }
  return `Tombol CTA utama: text "${label}", anchor ke section info detail di bawahnya.`
}

export async function POST(req: Request) {
  let session
  try {
    session = await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const parsed = lpGenerateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Body tidak valid')
  }

  const { lpId, description, imageUrls, style, ctaType, waNumber } = parsed.data

  try {
    const lp = await prisma.landingPage.findUnique({
      where: { id: lpId },
      select: { id: true, userId: true },
    })
    if (!lp) return jsonError('Landing page tidak ditemukan', 404)
    if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)

    // Gate: minimum saldo aktif untuk akses AI generate (UX, bukan charge).
    const balance = await prisma.tokenBalance.findUnique({
      where: { userId: session.user.id },
      select: { balance: true },
    })
    const currentBalance = balance?.balance ?? 0
    if (currentBalance < MIN_BALANCE_FOR_AI) {
      return Response.json(
        {
          success: false,
          error: 'INSUFFICIENT_TOKEN',
          message: `AI Generate butuh saldo token aktif minimal ${MIN_BALANCE_FOR_AI.toLocaleString('id-ID')} token. Saldo kamu sekarang: ${currentBalance.toLocaleString('id-ID')}. Top up atau pakai cara manual (copy prompt template).`,
          minRequired: MIN_BALANCE_FOR_AI,
          currentBalance,
        },
        { status: 402 },
      )
    }

    const styleLabel =
      LP_STYLES.find((s) => s.value === style)?.label ?? style
    const ctaInstruction = buildCtaInstruction(ctaType, waNumber, description)

    const userPrompt = [
      `# Deskripsi Produk / Bisnis`,
      description,
      '',
      `# Style Landing Page`,
      `${styleLabel} — ${STYLE_HINT[style] ?? ''}`,
      '',
      `# Call-to-Action`,
      ctaInstruction,
      '',
      imageUrls && imageUrls.trim()
        ? `# URL Gambar yang Bisa Dipakai\n${imageUrls.trim()}\n\nGunakan URL gambar di atas untuk hero/produk/dekorasi. Jangan buat URL baru.`
        : `# Catatan Gambar\nUser belum upload gambar. Buat landing page yang tetap menarik dengan CSS-only (gradient, shape, tipografi besar).`,
      '',
      `# Output`,
      `Mulai langsung dengan <!DOCTYPE html>. Tanpa penjelasan apapun.`,
    ].join('\n')

    const client = getAnthropicClient()

    let charge
    let html: string
    try {
      const result = await executeAiWithCharge<string>({
        featureKey: 'LP_GENERATE',
        userId: session.user.id,
        ctx: {
          referencePrefix: `lp_generate:${lpId}`,
          description: 'Generate LP AI',
          subjectType: 'LP',
          subjectId: lpId,
          estimateInputTokens: EST_INPUT_TOKENS,
          estimateOutputTokens: EST_OUTPUT_TOKENS,
          aiCall: async () => {
            const stream = client.messages.stream({
              model: DEFAULT_MODEL,
              max_tokens: MAX_OUTPUT_TOKENS,
              system: SYSTEM_PROMPT,
              messages: [{ role: 'user', content: userPrompt }],
            })
            const final = await stream.finalMessage()
            const text = final.content
              .filter(
                (b: Anthropic.ContentBlock): b is Anthropic.TextBlock =>
                  b.type === 'text',
              )
              .map((b: Anthropic.TextBlock) => b.text)
              .join('')
              .trim()
            return {
              result: stripCodeFence(text),
              inputTokens: final.usage.input_tokens,
              outputTokens: final.usage.output_tokens,
            }
          },
        },
      })
      html = result.result
      charge = result.charge
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return jsonError(
          `Saldo token tidak cukup. Butuh ±${err.tokensRequired} token.`,
          402,
        )
      }
      if (err instanceof Anthropic.RateLimitError) {
        return jsonError(
          'AI service sedang sibuk, coba lagi sebentar lagi.',
          429,
        )
      }
      if (err instanceof Anthropic.APIError) {
        console.error('[POST /api/lp/generate] Anthropic API error:', err)
        return jsonError(`AI service error: ${err.message}`, 502)
      }
      throw err
    }

    if (!html) {
      return jsonError('AI tidak mengembalikan HTML, coba lagi.', 502)
    }

    // Audit per-LP di LpGeneration — sumber untuk /api/lp/generate/stats &
    // profitability summary. AiGenerationLog sudah jadi source of truth
    // unified; LpGeneration tetap dipertahankan untuk LP-specific reporting.
    await prisma.lpGeneration
      .create({
        data: {
          lpId,
          userId: session.user.id,
          model: charge.modelName,
          inputTokens: charge.inputTokens,
          outputTokens: charge.outputTokens,
          inputPricePer1MUsd: charge.pricingSnapshot.inputPricePer1M,
          outputPricePer1MUsd: charge.pricingSnapshot.outputPricePer1M,
          providerCostUsd: charge.apiCostUsd,
          providerCostRp: charge.apiCostRp,
          platformTokensCharged: charge.tokensCharged,
        },
      })
      .catch((err) => {
        console.error('[POST /api/lp/generate] audit insert gagal:', err)
      })

    return jsonOk({
      html,
      tokensUsed: charge.tokensCharged,
      aiUsage: {
        inputTokens: charge.inputTokens,
        outputTokens: charge.outputTokens,
      },
      providerCost: { usd: charge.apiCostUsd, rp: charge.apiCostRp },
    })
  } catch (err) {
    console.error('[POST /api/lp/generate] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

function stripCodeFence(text: string): string {
  const t = text.trim()
  const match = t.match(/^```(?:html|HTML)?\s*\n([\s\S]*?)\n```\s*$/)
  if (match && match[1]) return match[1].trim()
  return t
}
