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
      keywordMatches(kw, msg),
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

// Stopword Indonesia + Inggris yang umum & tidak distinctive — supaya tidak
// jadi pemicu false positive saat relaxed match.
const STOPWORDS = new Set([
  'untuk',
  'dengan',
  'yang',
  'adalah',
  'tidak',
  'sudah',
  'masih',
  'lihat',
  'punya',
  'sangat',
  'kalau',
  'tetapi',
  'tapi',
  'bagaimana',
  'gimana',
  'saya',
  'kamu',
  'kalian',
  'mereka',
  'kakak',
  'admin',
  'mohon',
  'tolong',
  'gimana',
  'about',
  'please',
  'where',
  'which',
])

const MIN_TOKEN_LEN = 5

function tokenizeKeyword(kw: string): string[] {
  return kw
    .toLowerCase()
    .trim()
    .split(/[\s,;]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length >= MIN_TOKEN_LEN && !STOPWORDS.has(w))
}

// Match keyword vs pesan customer dengan dua tier:
//   1. Exact phrase substring (lossless — current behavior, high confidence)
//   2. Relaxed token: kalau exact phrase tidak match, anggap match kalau ada
//      MIN. 1 kata distinctive (>=5 chars, bukan stopword) dari keyword muncul
//      di msg. Solusi untuk knowledge yg keyword-nya "testimoni cleanoz" tapi
//      customer bilang "ada testimoni?" — masih relevan.
// Trade-off: bisa over-trigger kalau keyword pakai kata umum. User bisa
// narrow keyword (mis. tambah unique brand name) kalau itu jadi masalah.
export function keywordMatches(rawKw: string, msg: string): boolean {
  const kw = rawKw.toLowerCase().trim()
  if (!kw) return false
  if (msg.includes(kw)) return true
  const tokens = tokenizeKeyword(kw)
  if (tokens.length === 0) return false
  return tokens.some((t) => msg.includes(t))
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
//
// PENTING: instruksi explicit supaya AI tidak escalate ke admin saat ada file
// yang relevan — sistem (wa-manager) AKAN otomatis kirim file IMAGE/FILE
// setelah balasan teks AI. AI cuma perlu confirm "saya kirim ya".
export function formatKnowledgeForPrompt(items: RetrievedKnowledge[]): string {
  if (items.length === 0) return ''
  const lines: string[] = ['', '## Info Pendukung']
  lines.push(
    'Pakai info berikut untuk menjawab pertanyaan customer.',
    '',
  )

  const hasFile = items.some(
    (kb) =>
      kb.fileUrl && (kb.contentType === 'IMAGE' || kb.contentType === 'FILE'),
  )

  for (const kb of items) {
    const body = kb.textContent || kb.caption || '(lihat file/link terlampir)'
    lines.push(`- **${kb.title}**: ${body}`)
    if (kb.fileUrl && (kb.contentType === 'IMAGE' || kb.contentType === 'FILE')) {
      lines.push(
        `  → File "${kb.title}" akan OTOMATIS dikirim setelah balasan teks kamu. JANGAN bilang "admin akan kirim" — cukup bilang "ini saya kirim ya" atau "berikut bukti/gambarnya".`,
      )
    }
    if (kb.linkUrl) lines.push(`  (Link untuk customer: ${kb.linkUrl})`)
  }

  if (hasFile) {
    lines.push(
      '',
      '**PENTING**: Kalau ada knowledge IMAGE/FILE yang akan dikirim sistem, JANGAN tulis "tunggu admin", "nanti admin balas", atau "saya hubungi admin". Cukup bilang seperti "Berikut bukti/foto/testimoninya ya kak 👇" lalu sistem akan attach file otomatis setelah balasan kamu.',
    )
  }

  return lines.join('\n')
}

// Bangun blok teks untuk daftar rekening pembayaran user. Pakai untuk
// melengkapi system prompt supaya AI bisa langsung kasih nomor rekening saat
// customer minta — tanpa harus minta admin.
export async function formatBankAccountsForPrompt(
  userId: string,
): Promise<string> {
  try {
    const accounts = await prisma.userBankAccount.findMany({
      where: { userId, isActive: true },
      select: {
        bankName: true,
        accountNumber: true,
        accountName: true,
      },
      orderBy: [{ isDefault: 'desc' }, { order: 'asc' }, { createdAt: 'asc' }],
    })
    if (accounts.length === 0) return ''

    const lines: string[] = ['', '## Rekening Pembayaran']
    lines.push(
      'Saat customer minta nomor rekening / cara transfer, sebutkan info berikut langsung — JANGAN minta admin. Kamu bisa kasih satu (default) atau semua, sesuai konteks:',
      '',
    )
    for (const a of accounts) {
      lines.push(
        `- **${a.bankName}**: \`${a.accountNumber}\` a.n. ${a.accountName}`,
      )
    }
    return lines.join('\n')
  } catch (err) {
    console.error('[formatBankAccountsForPrompt] gagal:', err)
    return ''
  }
}

// Aturan default tambahan supaya AI lebih proaktif & tidak terus-terusan
// escalate ke admin manual. Selalu di-append ke promptBlock — bypass cache
// Soul.systemPrompt di DB, jadi user existing langsung dapat behavior baru
// tanpa harus re-save soul.
export function defaultBehaviorRules(): string {
  return [
    '',
    '## Aturan Tambahan (Auto-Service)',
    '- **Jangan escalate berlebihan**: Hanya bilang "saya teruskan ke admin" kalau pertanyaan benar-benar di luar konteks bisnis & knowledge yang ada. Untuk testimoni, bukti foto, nomor rekening, cara order, harga — JAWAB SENDIRI dari konteks/knowledge.',
    '- **Tutup percakapan natural**: Kalau customer sudah puas / sudah konfirmasi order / sudah mengerti, ucapkan terima kasih singkat dan selesaikan. Tidak perlu selalu ajak ngobrol lagi.',
    '- **Kirim asset sendiri**: Sistem otomatis attach file IMAGE/FILE dari knowledge yang relevan setelah balasan kamu. JANGAN pakai kalimat seperti "admin akan kirim foto/bukti/testimoni" — cukup bilang "ini saya kirim ya" atau "berikut gambarnya 👇".',
    '- **Nomor rekening**: Kalau ada section "Rekening Pembayaran" di atas, sebutkan langsung saat customer minta cara transfer. Format jelas: nama bank + nomor + a.n.',
  ].join('\n')
}
