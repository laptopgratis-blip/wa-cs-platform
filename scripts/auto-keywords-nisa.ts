// Auto-populate triggerKeywords + matchMode=KEYWORD_FIRST untuk semua clip Nisa.
// Cosine matching unreliable buat clip pendek Indonesia (banyak overlap kata).
// Keyword exact match jauh lebih predictable.

import { prisma } from '../lib/prisma'

// Keyword default per kategori — kosakata Indonesian live shopping yang umum.
// Owner bisa edit lagi di EditClipModal kalau mau tambah/kurangi.
const KEYWORDS_BY_CATEGORY: Record<string, string[]> = {
  PRICE: [
    'harga', 'brp', 'berapa', 'berapaan', 'biaya', 'price', 'cost',
    'mahal', 'murah', 'promo', 'diskon', 'potongan', 'cashback',
    'flash sale', 'flashsale', 'sale',
  ],
  GREETING: [
    'halo', 'hai', 'hi', 'assalamu', 'permisi', 'siang', 'malam', 'pagi', 'sore',
    'welcome', 'salam', 'kenalan',
  ],
  PRODUCT_DEMO: [
    'cara pakai', 'gimana pake', 'cara penggunaan', 'penggunaan',
    'cara kerja', 'bagaimana cara', 'cara nya', 'caranya',
    'fungsi', 'kegunaan', 'manfaat', 'kandungan', 'bahan',
    'gimana', 'gmn', 'fungsinya', 'apa itu',
  ],
  CLOSING: [
    'beli dimana', 'beli', 'order', 'pesen', 'pesan', 'checkout',
    'mau order', 'mau beli', 'mau pesen', 'cara order', 'cara pesan',
    'klik', 'minat', 'tertarik', 'ambil', 'mau ambil',
  ],
  OBJECTION: [
    'kok mahal', 'mahal banget', 'kemahalan', 'gak yakin',
    'ragu', 'beneran', 'asli', 'palsu', 'kw', 'aman gak', 'aman ga',
    'efek samping', 'bahaya', 'beneran works',
  ],
  IDLE: [
    // IDLE clip biasanya gak butuh keyword — diloop saat sepi via rotation
    // Tapi kalau owner tag sebagai default-idle, gak perlu tag keyword.
  ],
  GENERAL: [],
}

async function main() {
  const host = await prisma.hostTemplate.findFirst({
    where: { name: 'Nisa' },
    select: { id: true },
  })
  if (!host) throw new Error('Nisa host gak ada')

  const clips = await prisma.liveClip.findMany({
    where: { hostTemplateId: host.id, status: 'READY' },
    select: { id: true, category: true, triggerKeywords: true, matchMode: true, scriptOriginal: true },
  })

  let updated = 0
  let skipped = 0
  for (const c of clips) {
    if (c.triggerKeywords.length > 0) {
      console.log(`[skip] ${c.category} ${c.scriptOriginal.slice(0,40)} — already has ${c.triggerKeywords.length} kw`)
      skipped++
      continue
    }
    const kw = KEYWORDS_BY_CATEGORY[c.category] ?? []
    if (kw.length === 0) {
      console.log(`[skip] ${c.category} ${c.scriptOriginal.slice(0,40)} — no default keywords for category`)
      skipped++
      continue
    }
    await prisma.liveClip.update({
      where: { id: c.id },
      data: {
        triggerKeywords: kw,
        matchMode: 'KEYWORD_FIRST',
      },
    })
    console.log(`[OK] ${c.category} ${c.scriptOriginal.slice(0,40)} → ${kw.length} kw, mode=KEYWORD_FIRST`)
    updated++
  }
  console.log(`\nUpdated ${updated}, skipped ${skipped}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
