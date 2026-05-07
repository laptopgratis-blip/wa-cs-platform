// POST /api/lp/generate
// Body: { lpId, description, imageUrls, style, ctaType, waNumber }
//
// Validasi LP owner + saldo token >= 10, panggil Claude (haiku) lewat
// streaming untuk dapat HTML lengkap, potong 10 token sebagai USAGE,
// return { html, tokensUsed }.
import Anthropic from '@anthropic-ai/sdk'
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { DEFAULT_MODEL, getAnthropicClient } from '@/lib/anthropic'
import { prisma } from '@/lib/prisma'
import {
  LP_CTA_TYPES,
  LP_STYLES,
  lpGenerateSchema,
} from '@/lib/validations/lp-generate'

// Fixed cost per generation. User spec: "Potong 10 token dari balance".
const TOKENS_PER_GENERATION = 10
// Threshold minimal saldo token aktif untuk boleh akses AI generate.
// User free dengan saldo di bawah ini di-block — diarahkan ke alur manual
// (copy prompt template ke ChatGPT/Claude.ai gratis lalu paste). Tujuan:
// hemat biaya AI provider untuk user yg tidak generate revenue.
const MIN_BALANCE_FOR_AI = 1000

// Max output tokens — HTML landing page bisa panjang. Streaming aman sampai
// 64K (cap Haiku 4.5).
const MAX_OUTPUT_TOKENS = 16_000

const SYSTEM_PROMPT = `Kamu adalah expert web developer yang membuat landing page HTML yang indah dan konversi tinggi.

ATURAN OUTPUT (WAJIB):
- Buat HANYA kode HTML lengkap (mulai dari <!DOCTYPE html> sampai </html>).
- Sertakan <style>...</style> di dalam <head> — JANGAN pakai external CSS atau framework.
- TIDAK ADA markdown code fence (\`\`\`html), TIDAK ADA penjelasan, TIDAK ADA komentar di luar HTML.
- Output langsung byte pertama HTML, tanpa preamble.

ATURAN DESAIN:
- Responsif mobile dan desktop (pakai meta viewport + media query).
- Pakai CSS modern (flexbox/grid, custom properties, transitions).
- Hierarki visual jelas: hero → benefit → CTA.
- Gunakan gambar dari URL yang diberikan user — JANGAN buat URL gambar baru.
- Tombol CTA harus mencolok, mudah diklik di mobile (min 44x44px tap area).
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

// Build CTA instruction based on ctaType + waNumber
function buildCtaInstruction(
  ctaType: string,
  waNumber: string | undefined,
  description: string,
): string {
  const labelMap = Object.fromEntries(LP_CTA_TYPES.map((c) => [c.value, c.label]))
  const label = labelMap[ctaType] ?? 'Klik di Sini'

  if (ctaType === 'WHATSAPP' && waNumber) {
    // wa.me link dengan pre-filled message yang singkat & generic.
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
    // 1. Validasi owner LP
    const lp = await prisma.landingPage.findUnique({
      where: { id: lpId },
      select: { id: true, userId: true },
    })
    if (!lp) return jsonError('Landing page tidak ditemukan', 404)
    if (lp.userId !== session.user.id) return jsonError('Forbidden', 403)

    // 2. Cek saldo token. Dua threshold:
    //    - MIN_BALANCE_FOR_AI (1000): minimum untuk akses fitur AI generate.
    //      Kalau di bawah ini, user diarahkan ke alur manual (copy prompt
    //      template). Hemat biaya AI provider untuk user free yg low LTV.
    //    - TOKENS_PER_GENERATION (10): biaya per panggilan; di-charge setelah
    //      AI sukses respond.
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

    // 3. Build user prompt
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

    // 4. Panggil Claude pakai streaming (HTML bisa panjang).
    //    .finalMessage() collect semua chunk jadi satu Message object.
    const client = getAnthropicClient()
    let html = ''
    let inputTokens = 0
    let outputTokens = 0

    try {
      const stream = client.messages.stream({
        model: DEFAULT_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const final = await stream.finalMessage()

      // Ambil teks dari content blocks (cuma type=text yang relevan).
      html = final.content
        .filter(
          (b: Anthropic.ContentBlock): b is Anthropic.TextBlock =>
            b.type === 'text',
        )
        .map((b: Anthropic.TextBlock) => b.text)
        .join('')
        .trim()

      inputTokens = final.usage.input_tokens
      outputTokens = final.usage.output_tokens
    } catch (err) {
      // Pakai typed exception classes (anti string-matching error msg).
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

    // 5. Bersihkan output — kadang AI tetap bungkus dengan ```html walau diminta tidak.
    html = stripCodeFence(html)

    // 6. Potong token user secara atomic. Kalau race condition saldo habis
    //    di antara cek (step 2) dan sini, return 402 (HTML hilang — user bisa
    //    retry setelah top-up).
    const decrement = await prisma.$transaction(async (tx) => {
      const updated = await tx.tokenBalance.updateMany({
        where: {
          userId: session.user.id,
          balance: { gte: TOKENS_PER_GENERATION },
        },
        data: {
          balance: { decrement: TOKENS_PER_GENERATION },
          totalUsed: { increment: TOKENS_PER_GENERATION },
        },
      })
      if (updated.count === 0) return null

      await tx.tokenTransaction.create({
        data: {
          userId: session.user.id,
          amount: -TOKENS_PER_GENERATION,
          type: 'USAGE',
          description: 'Generate LP AI',
          reference: lpId,
        },
      })
      return TOKENS_PER_GENERATION
    })

    if (decrement === null) {
      // Sudah panggil AI tapi gak bisa charge. Beri tahu user.
      return jsonError(
        'Saldo token habis selama generasi. Top-up dulu lalu generate ulang.',
        402,
      )
    }

    return jsonOk({
      html,
      tokensUsed: TOKENS_PER_GENERATION,
      // Token AI provider (untuk transparansi, bukan untuk billing).
      aiUsage: { inputTokens, outputTokens },
    })
  } catch (err) {
    console.error('[POST /api/lp/generate] gagal:', err)
    return jsonError('Terjadi kesalahan server', 500)
  }
}

// Strip ```html ... ``` fence kalau AI bandel kasih markdown.
function stripCodeFence(text: string): string {
  const t = text.trim()
  // ```html\n...\n``` atau ```\n...\n```
  const match = t.match(/^```(?:html|HTML)?\s*\n([\s\S]*?)\n```\s*$/)
  if (match && match[1]) return match[1].trim()
  return t
}
