// prisma/seed.ts
// Data awal untuk database — jalankan: npx prisma db seed
//
// Catatan harga:
// - inputPricePer1M / outputPricePer1M = USD per 1 juta token (harga provider).
// - costPerMessage = jumlah token PLATFORM yang dipotong dari saldo user
//   per balasan AI sukses. Set lewat /admin/pricing-calculator (tombol Apply)
//   supaya margin platform sesuai target.

import { PrismaClient, AiProvider, LpTier } from '@prisma/client'

const prisma = new PrismaClient()

const models = [
  // ─── ANTHROPIC ─────────────────────────────────────────────
  {
    name: 'Claude Haiku (Cepat & Hemat)',
    provider: AiProvider.ANTHROPIC,
    modelId: 'claude-haiku-4-5-20251001',
    inputPricePer1M: 0.80,
    outputPricePer1M: 4.00,
    avgTokensPerMessage: 500,
    costPerMessage: 1,
    isActive: true,
    description: 'Model tercepat dan paling hemat. Cocok untuk CS standar.',
  },
  {
    name: 'Claude Sonnet (Pintar)',
    provider: AiProvider.ANTHROPIC,
    modelId: 'claude-sonnet-4-6',
    inputPricePer1M: 3.00,
    outputPricePer1M: 15.00,
    avgTokensPerMessage: 500,
    costPerMessage: 4,
    isActive: true,
    description: 'Lebih pintar dan natural. Cocok untuk handling komplain kompleks.',
  },
  // ─── OPENAI ────────────────────────────────────────────────
  {
    name: 'GPT-5 Mini (Hemat)',
    provider: AiProvider.OPENAI,
    modelId: 'gpt-5-mini',
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.60,
    avgTokensPerMessage: 500,
    costPerMessage: 4,
    isActive: true,
    description: 'Model OpenAI terbaru yang hemat. Pintar untuk CS sehari-hari.',
  },
  // ─── GOOGLE ────────────────────────────────────────────────
  {
    name: 'Gemini 2.0 Flash (Hemat)',
    provider: AiProvider.GOOGLE,
    modelId: 'gemini-2.0-flash',
    inputPricePer1M: 0.10,
    outputPricePer1M: 0.40,
    avgTokensPerMessage: 500,
    costPerMessage: 1,
    isActive: true,
    description: 'Model Google paling hemat dan cepat.',
  },
  {
    name: 'Gemini 2.5 Pro (Pintar)',
    provider: AiProvider.GOOGLE,
    modelId: 'gemini-2.5-pro',
    inputPricePer1M: 1.25,
    outputPricePer1M: 10.00,
    avgTokensPerMessage: 500,
    costPerMessage: 13,
    isActive: true,
    description: 'Model Google paling pintar untuk reasoning kompleks.',
  },
]

const tokenPackages = [
  {
    name: 'Starter',
    tokenAmount: 10000,
    price: 35000,
    isPopular: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'Popular',
    tokenAmount: 50000,
    price: 149000,
    isPopular: true,
    isActive: true,
    sortOrder: 2,
  },
  {
    name: 'Power',
    tokenAmount: 200000,
    price: 499000,
    isPopular: false,
    isActive: true,
    sortOrder: 3,
  },
]

// Paket upgrade LP — dijual terpisah, langsung set tier UserQuota.
// Di-purchase via Payment / ManualPayment dengan purpose=LP_UPGRADE.
const lpUpgradePackages = [
  {
    name: 'Starter',
    description: 'Cocok untuk usaha kecil yang baru mulai promosi online.',
    tier: LpTier.STARTER,
    maxLp: 3,
    maxStorageMB: 20,
    price: 29_000,
    isPopular: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    name: 'Popular',
    description: 'Pilihan paling populer untuk yang punya beberapa produk.',
    tier: LpTier.POPULAR,
    maxLp: 10,
    maxStorageMB: 100,
    price: 79_000,
    isPopular: true,
    isActive: true,
    sortOrder: 2,
  },
  {
    name: 'Power',
    description: 'Untuk agensi atau bisnis dengan banyak campaign sekaligus.',
    tier: LpTier.POWER,
    maxLp: 999,
    maxStorageMB: 500,
    price: 199_000,
    isPopular: false,
    isActive: true,
    sortOrder: 3,
  },
]

// Seed kepribadian + gaya balas untuk SoulBuilder. snippet ini RAHASIA —
// hanya admin yang bisa lihat lewat /admin/soul-settings. User cuma melihat
// name + description di dropdown.
const soulPersonalities = [
  {
    name: 'Sales Closing',
    description: 'Agen penjualan yang fokus closing dengan teknik SPIN.',
    systemPromptSnippet: [
      'Kamu adalah agen penjualan profesional yang menggunakan teknik SPIN selling.',
      '- Situation: gali konteks customer dengan pertanyaan singkat (apa kebutuhannya, untuk siapa, kapan butuhnya).',
      '- Problem: identifikasi masalah/keluhan yang sedang dia hadapi.',
      '- Implication: besarkan dampak masalah itu kalau tidak segera diselesaikan (kerugian waktu, peluang, kenyamanan).',
      '- Need-payoff: tunjukkan bagaimana produk/jasa kita menyelesaikan masalah tersebut secara konkret.',
      'Selalu tutup pesan dengan pertanyaan pilihan 2 opsi yang KEDUANYA mengarah ke pembelian (mis. "mau yang varian A atau B?", "transfer hari ini atau besok?"). Hindari pertanyaan terbuka yang membuat customer mudah menunda.',
    ].join('\n'),
    isActive: true,
    order: 1,
  },
  {
    name: 'CS Profesional',
    description: 'Formal, sopan, akurat — cocok untuk brand korporat.',
    systemPromptSnippet: [
      'Bersikap formal dan sopan layaknya customer service brand korporat.',
      '- Hindari slang, singkatan tidak baku, dan emoji berlebihan.',
      '- Fokus utama adalah AKURASI informasi — kalau ragu, sampaikan akan dicek dulu daripada menjawab spekulatif.',
      '- Gunakan sapaan formal ("Selamat pagi/siang/sore Bapak/Ibu") dan pengucapan terima kasih di akhir.',
      '- Jaga jarak profesional: ramah tapi tidak terlalu personal.',
    ].join('\n'),
    isActive: true,
    order: 2,
  },
  {
    name: 'CS Ramah',
    description: 'Hangat dan personal, cocok untuk brand lifestyle.',
    systemPromptSnippet: [
      'Bersikap hangat dan personal seperti teman dekat customer.',
      '- Sapa dengan nada akrab namun tetap sopan ("Halo kak!", "Hai sayang…").',
      '- Boleh pakai emoji secukupnya untuk membuat pesan terasa hidup (😊 🙏 ✨ 🛍️) — jangan lebih dari 1-2 per pesan.',
      '- Tunjukkan empati: kalau customer kelihatan ragu atau kecewa, akui perasaannya dulu sebelum menjelaskan solusi.',
      '- Tujuan utamanya bikin customer NYAMAN ngobrol, bukan cuma transaksional.',
    ].join('\n'),
    isActive: true,
    order: 3,
  },
  {
    name: 'CS Santai',
    description: 'Kasual seperti teman, cocok untuk brand anak muda.',
    systemPromptSnippet: [
      'Bersikap kasual seperti teman ngobrol — relax, fun, tapi tetap helpful.',
      '- Pakai bahasa sehari-hari ("oke sip", "gas aja", "mantap"), boleh menyelipkan candaan ringan kalau pas.',
      '- Hindari kata-kata terlalu formal seperti "dengan hormat", "kami sampaikan". Pakai "aku/kami" untuk diri sendiri.',
      '- Boleh pakai emoji yang relate sama anak muda (🔥 💯 👀 ✌️) tapi jangan spam.',
      '- Tetap profesional di info penting (harga, stok, jadwal) — jangan sampai bercanda menutupi data yang harus akurat.',
    ].join('\n'),
    isActive: true,
    order: 4,
  },
]

const soulStyles = [
  {
    name: 'Closing dengan Pilihan',
    description: 'Selalu akhiri dengan 2 opsi yang mengarah ke pembelian.',
    systemPromptSnippet: [
      'Setiap balasan WAJIB ditutup dengan pertanyaan pilihan yang berisi 2 opsi konkret, dan KEDUA opsi mengarah ke pembelian.',
      'Contoh format yang benar:',
      '- "Mau yang ukuran M atau L kak?"',
      '- "Bayar pakai BCA atau Mandiri?"',
      '- "Kirim hari ini atau besok pagi?"',
      'HINDARI pertanyaan terbuka seperti "Bagaimana kak?" atau "Ada pertanyaan lain?" — itu memberi celah customer untuk menunda. Setiap pertanyaan harus mendorong keputusan ke depan, bukan menggantung.',
    ].join('\n'),
    isActive: true,
    order: 1,
  },
  {
    name: 'Singkat & Padat',
    description: 'Maksimal 2-3 kalimat per balasan, langsung ke poin.',
    systemPromptSnippet: [
      'Jawab dengan singkat dan padat — maksimal 2-3 kalimat per balasan.',
      '- Langsung ke poin, hindari basa-basi pengantar yang panjang.',
      '- Satu pesan = satu informasi utama. Kalau ada banyak hal, pecah jadi beberapa pesan terpisah.',
      '- Jangan ulang pertanyaan customer di awal balasan. Langsung jawab.',
    ].join('\n'),
    isActive: true,
    order: 2,
  },
  {
    name: 'Detail & Informatif',
    description: 'Penjelasan lengkap dengan contoh dan langkah.',
    systemPromptSnippet: [
      'Berikan penjelasan komprehensif dan informatif.',
      '- Sertakan contoh konkret kalau menjelaskan fitur atau cara pakai.',
      '- Kalau ada langkah-langkah, list bernomor (1, 2, 3) supaya mudah diikuti.',
      '- Antisipasi pertanyaan lanjutan: kalau customer tanya harga, sebut juga sekalian metode bayar dan estimasi pengiriman.',
    ].join('\n'),
    isActive: true,
    order: 3,
  },
  {
    name: 'Storytelling',
    description: 'Pakai cerita dan testimoni untuk meyakinkan.',
    systemPromptSnippet: [
      'Gunakan cerita singkat atau testimoni relevan untuk meyakinkan customer.',
      '- Saat menjelaskan produk, sisipkan contoh customer lain yang punya situasi serupa ("Kemarin ada kak Sarah yang…").',
      '- Pakai mini-narasi: situasi awal → masalah → cara produk membantu → hasil.',
      '- Cerita harus PLAUSIBLE — jangan mengarang testimoni yang spesifik (nama lengkap, nominal pasti) kalau tidak ada di konteks bisnis.',
    ].join('\n'),
    isActive: true,
    order: 4,
  },
]

async function main() {
  console.log('🌱 Mulai seed database...')

  // ─── AI Models ─── (skipDuplicates aman dipanggil ulang)
  const aiResult = await prisma.aiModel.createMany({
    data: models,
    skipDuplicates: true,
  })
  console.log(`✅ AI Models: ${aiResult.count} dari ${models.length} ditambahkan`)

  // ─── Token Packages ───
  const pkgResult = await prisma.tokenPackage.createMany({
    data: tokenPackages,
    skipDuplicates: true,
  })
  console.log(`✅ Token Packages: ${pkgResult.count} dari ${tokenPackages.length} ditambahkan`)

  // ─── LP Upgrade Packages ───
  const lpResult = await prisma.lpUpgradePackage.createMany({
    data: lpUpgradePackages,
    skipDuplicates: true,
  })
  console.log(`✅ LP Upgrade Packages: ${lpResult.count} dari ${lpUpgradePackages.length} ditambahkan`)

  // ─── Soul Personalities ───
  // Tabel tidak punya unique constraint, jadi cek manual by name supaya
  // re-run seed tidak menduplikasi (createMany skipDuplicates butuh @unique).
  let personalityAdded = 0
  for (const p of soulPersonalities) {
    const existing = await prisma.soulPersonality.findFirst({ where: { name: p.name } })
    if (!existing) {
      await prisma.soulPersonality.create({ data: p })
      personalityAdded++
    }
  }
  console.log(
    `✅ Soul Personalities: ${personalityAdded} dari ${soulPersonalities.length} ditambahkan`,
  )

  // ─── Soul Styles ───
  let styleAdded = 0
  for (const s of soulStyles) {
    const existing = await prisma.soulStyle.findFirst({ where: { name: s.name } })
    if (!existing) {
      await prisma.soulStyle.create({ data: s })
      styleAdded++
    }
  }
  console.log(`✅ Soul Styles: ${styleAdded} dari ${soulStyles.length} ditambahkan`)

  console.log('🎉 Seed selesai!')
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
