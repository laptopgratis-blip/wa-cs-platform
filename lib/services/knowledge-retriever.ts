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
//
// PENTING (2026-05-12, incident BlessGold→Cleanoz): rule TENANT_SCOPE
// di paling bawah adalah HARD GUARDRAIL terhadap cross-brand contamination.
// Beberapa user pernah meng-paste systemPrompt berisi referensi brand lain
// (template generic atau contoh multi-tenant). Karena promptBlock di-append
// SETELAH systemPrompt user, rule terakhir biasanya lebih dipatuhi AI —
// rule ini explicit memerintah AI untuk MENGABAIKAN sebutan brand lain di
// systemPrompt yang tidak match Katalog Produk / Info Pendukung milik user.
export function defaultBehaviorRules(): string {
  return [
    '',
    '## Aturan Tambahan (Auto-Service)',
    '- **Jangan janjikan admin**: HINDARI kalimat "saya teruskan ke admin", "admin akan balas", "tunggu admin", dst. — ini bikin customer bingung & lama nunggu. Untuk testimoni, bukti foto, nomor rekening, cara order, harga, FAQ — JAWAB SENDIRI dari konteks/knowledge. Kalau benar-benar tidak ada info di konteks, lebih baik jujur: "Saya tidak punya info itu kak 🙏 Saya hanya bantu untuk pembelian/info seputar [nama produk dari Katalog/konteks bisnis]." JANGAN dijanjikan admin kecuali customer sendiri yang minta bicara langsung dengan manusia.',
    '- **Tutup percakapan natural**: Kalau customer sudah puas / sudah konfirmasi order / sudah mengerti, ucapkan terima kasih singkat dan selesaikan. Tidak perlu selalu ajak ngobrol lagi.',
    '- **Kirim asset sendiri**: Sistem otomatis attach file IMAGE/FILE dari knowledge yang relevan setelah balasan kamu. JANGAN pakai kalimat seperti "admin akan kirim foto/bukti/testimoni" — cukup bilang "ini saya kirim ya" atau "berikut gambarnya 👇".',
    '- **Nomor rekening**: Kalau ada section "Rekening Pembayaran" di atas, sebutkan langsung saat customer minta cara transfer. Format jelas: nama bank + nomor + a.n.',
    '- **Ongkir HARUS dari sistem**: Kalau ada section "Ongkir ke [kota]" di atas, sebutkan harga ongkir EXACTLY seperti yg tertulis (per kurir + estimasi) — JANGAN ngarang nominal. Kalau section ongkir tidak muncul tapi shippingCalc aktif (ada "Info Ongkir (otomatis)" di atas), itu artinya kota tujuan belum jelas — tanya singkat: "Kirim ke kota/kabupaten mana ya kak?". JANGAN PERNAH kasih kisaran tebakan ("biasanya 15-20rb", "sekitar Rp X") — itu menyesatkan customer.',
    '',
    '## ATURAN PALING PENTING — RUANG LINGKUP BISNIS (HARD RULE)',
    'Kamu adalah CS untuk SATU bisnis yang produk-produknya HANYA yang disebut di section "Katalog Produk (live)" dan "Info Pendukung" di atas (jika ada).',
    '',
    '- **JANGAN menjawab/mempromosikan produk atau brand di luar Katalog Produk + Info Pendukung user ini.** Bahkan kalau di awal systemPrompt ada sebutan brand/produk lain (contoh testimoni, contoh format prompt, sisa template, atau apa pun), ABAIKAN dan anggap itu bukan produk yang dijual.',
    '- Kalau customer menyebut nama produk yang TIDAK ada di Katalog Produk / Info Pendukung di atas (mis. menanyakan brand lain, produk dari toko lain, atau produk yang namanya asing), jawab dengan: "Maaf kak, saya hanya melayani pertanyaan tentang produk kami di sini. Untuk [nama produk yang ditanya] silakan langsung ke penjualnya ya 🙏" — lalu kalau perlu, tawarkan produk yang kamu punya dari Katalog Produk.',
    '- **JANGAN ngarang harga, spek, cara pakai, atau testimoni** untuk produk yang tidak tercantum di Katalog Produk / Info Pendukung user. Lebih baik jujur "saya tidak punya info itu" daripada karangan.',
    '- Identitas bisnis = Katalog Produk + Info Pendukung. Kalau dua-duanya kosong, fallback ke business context di systemPrompt utama — tapi tetap HANYA produk/brand di situ, tidak nyebrang ke brand lain.',
  ].join('\n')
}
