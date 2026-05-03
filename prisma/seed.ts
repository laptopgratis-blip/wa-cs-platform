// prisma/seed.ts
// Data awal untuk database — jalankan: npx prisma db seed
//
// Catatan harga:
// - inputPricePer1M / outputPricePer1M = IDR per 1 juta token (kurs $1 = 16k).
// - costPerMessage = jumlah token PLATFORM yang dipotong dari saldo user
//   per balasan AI sukses. Disesuaikan ke tier biaya provider:
//     Tier 1 (Haiku, Gemini Flash) → 1 token  (~1.0–1.2 IDR cost provider)
//     Tier 2 (Sonnet, GPT-5 Mini)  → 4 token  (~4.5–5.0 IDR cost provider)
//     Tier 3 (Gemini 2.5 Pro)      → 13 token (~15.6 IDR cost provider)

import { PrismaClient, AiProvider, LpTier } from '@prisma/client'

const prisma = new PrismaClient()

const models = [
  // ─── ANTHROPIC ─────────────────────────────────────────────
  {
    name: 'Claude Haiku (Cepat & Hemat)',
    provider: AiProvider.ANTHROPIC,
    modelId: 'claude-haiku-4-5-20251001',
    inputPricePer1M: 800,
    outputPricePer1M: 4000,
    avgTokensPerMessage: 500,
    costPerMessage: 1,
    isActive: true,
    description: 'Model tercepat dan paling hemat. Cocok untuk CS standar.',
  },
  {
    name: 'Claude Sonnet (Pintar)',
    provider: AiProvider.ANTHROPIC,
    modelId: 'claude-sonnet-4-6',
    inputPricePer1M: 3000,
    outputPricePer1M: 15000,
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
    inputPricePer1M: 4000,
    outputPricePer1M: 16000,
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
    inputPricePer1M: 750,
    outputPricePer1M: 3000,
    avgTokensPerMessage: 500,
    costPerMessage: 1,
    isActive: true,
    description: 'Model Google paling hemat dan cepat.',
  },
  {
    name: 'Gemini 2.5 Pro (Pintar)',
    provider: AiProvider.GOOGLE,
    modelId: 'gemini-2.5-pro',
    inputPricePer1M: 12500,
    outputPricePer1M: 50000,
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
