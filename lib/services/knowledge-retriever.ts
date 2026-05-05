// Knowledge retrieval — dipanggil oleh internal API saat wa-service handle
// pesan masuk. Match keyword di triggerKeywords[] terhadap isi pesan customer
// (case-insensitive substring match) lalu return entry yang aktif.
//
// Rancangan sederhana sengaja: kita pakai keyword matching, bukan vector
// search. Kalau nanti perlu semantic search, bisa ditambahkan kolom embedding
// + ekstensi pgvector. Untuk MVP keyword cukup.
import { prisma } from '@/lib/prisma'

// Maksimum entry yang dikirim ke AI dalam satu balasan. Kalau terlalu banyak,
// system prompt bengkak dan biaya token naik.
const MAX_RESULTS = 2

export interface RetrievedKnowledge {
  id: string
  title: string
  contentType: string
  textContent: string | null
  fileUrl: string | null
  linkUrl: string | null
  caption: string | null
}

export async function retrieveRelevantKnowledge(
  userId: string,
  customerMessage: string,
): Promise<RetrievedKnowledge[]> {
  const msg = customerMessage.toLowerCase().trim()
  if (!msg) return []

  // Ambil semua entry aktif (order: paling sering kepakai dulu — heuristik
  // bahwa entry populer relevan untuk percakapan umum).
  const all = await prisma.userKnowledge.findMany({
    where: { userId, isActive: true },
    orderBy: [{ triggerCount: 'desc' }, { order: 'asc' }, { updatedAt: 'desc' }],
    select: {
      id: true,
      title: true,
      contentType: true,
      textContent: true,
      fileUrl: true,
      linkUrl: true,
      caption: true,
      triggerKeywords: true,
    },
  })

  const matched: RetrievedKnowledge[] = []
  for (const kb of all) {
    if (matched.length >= MAX_RESULTS) break
    const hit = kb.triggerKeywords.some((kw) =>
      msg.includes(kw.toLowerCase().trim()),
    )
    if (hit) {
      matched.push({
        id: kb.id,
        title: kb.title,
        contentType: kb.contentType,
        textContent: kb.textContent,
        fileUrl: kb.fileUrl,
        linkUrl: kb.linkUrl,
        caption: kb.caption,
      })
    }
  }
  return matched
}

// Bump triggerCount + lastTriggeredAt untuk entry yang dipakai.
// Best-effort: error di sini tidak boleh menghentikan flow reply.
export async function incrementTriggerCount(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  try {
    await prisma.userKnowledge.updateMany({
      where: { id: { in: ids } },
      data: {
        triggerCount: { increment: 1 },
        lastTriggeredAt: new Date(),
      },
    })
  } catch (err) {
    console.error('[knowledge-retriever] incrementTriggerCount gagal:', err)
  }
}

// Bangun blok teks yang siap di-append ke system prompt.
// Format: heading + bullet per entry. Caption / textContent dipakai isi info.
export function formatKnowledgeForPrompt(items: RetrievedKnowledge[]): string {
  if (items.length === 0) return ''
  const lines: string[] = ['', '## Info Pendukung']
  lines.push(
    'Pakai info berikut untuk menjawab. Kalau ada file/link yang relevan, sebutkan kalau kamu bisa kirim referensinya.',
    '',
  )
  for (const kb of items) {
    const body = kb.textContent || kb.caption || '(tidak ada deskripsi)'
    lines.push(`- **${kb.title}**: ${body}`)
    if (kb.fileUrl) lines.push(`  (Tersedia file pendukung: ${kb.title})`)
    if (kb.linkUrl) lines.push(`  (Link: ${kb.linkUrl})`)
  }
  return lines.join('\n')
}
