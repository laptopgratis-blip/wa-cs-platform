// POST /api/knowledge/suggest-keywords
// Generate kata kunci pemicu otomatis pakai Claude berdasarkan judul + isi.
// Output: { keywords: string[] } — biasanya 5-8 kata kunci pendek lowercase.
//
// Catatan biaya: panggil sekali per klik tombol "✨ Sarankan kata kunci".
// Tidak nge-charge user token (gratis bantuan setup).
import type { NextResponse } from 'next/server'

import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { DEFAULT_MODEL, getAnthropicClient } from '@/lib/anthropic'
import { suggestKeywordsSchema } from '@/lib/validations/knowledge'

const SYSTEM_PROMPT = `Kamu membantu user menyiapkan "trigger keywords" untuk AI customer service WhatsApp.

Tugas: dari judul + isi/caption yang user tulis, hasilkan 5-8 kata kunci pendek (1-3 kata) yang kemungkinan customer ucapkan saat butuh info ini.

Aturan:
- Output JSON saja: { "keywords": ["...", "..."] }. Jangan beri komentar.
- Pakai bahasa yang natural untuk customer Indonesia (boleh sehari-hari).
- Lowercase semua, tanpa tanda baca.
- Hindari kata yang terlalu umum (mis. "info", "tanya", "halo").
- Boleh sertakan singkatan / typo umum (mis. "tlg", "trf").`

export async function POST(req: Request) {
  try {
    await requireSession()
  } catch (res) {
    return res as NextResponse
  }

  const json = await req.json().catch(() => null)
  const parsed = suggestKeywordsSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }
  const { title, contentType, textContent, caption } = parsed.data

  const userPrompt = [
    `Judul: ${title}`,
    `Jenis: ${contentType}`,
    textContent ? `Isi:\n${textContent}` : null,
    caption ? `Caption:\n${caption}` : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  try {
    const client = getAnthropicClient()
    const response = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    // Ambil teks dari content block. Claude balas plain JSON sesuai system prompt.
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim()

    // Robust parse: cari JSON block dulu kalau Claude bandel kasih wrapper.
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    const jsonText = jsonStart >= 0 && jsonEnd > jsonStart
      ? text.slice(jsonStart, jsonEnd + 1)
      : text

    let parsedAi: unknown
    try {
      parsedAi = JSON.parse(jsonText)
    } catch {
      return jsonError('AI memberi balasan yang tidak terstruktur, coba lagi.', 502)
    }

    const keywords = Array.isArray(
      (parsedAi as { keywords?: unknown }).keywords,
    )
      ? ((parsedAi as { keywords: unknown[] }).keywords
          .filter((k) => typeof k === 'string')
          .map((k) => (k as string).toLowerCase().trim())
          .filter((k) => k.length >= 2 && k.length <= 40)
          .slice(0, 8))
      : []

    return jsonOk({ keywords })
  } catch (err) {
    console.error('[POST /api/knowledge/suggest-keywords] gagal:', err)
    return jsonError('Gagal panggil AI. Coba beberapa saat lagi.', 500)
  }
}
