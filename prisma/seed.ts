// prisma/seed.ts
// Data awal untuk database — jalankan: npx prisma db seed

import { PrismaClient, AiProvider } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Mulai seed database...')

  // ─── AI Models ───
  await prisma.aiModel.createMany({
    data: [
      {
        name: 'Claude Haiku (Cepat & Hemat)',
        provider: AiProvider.ANTHROPIC,
        modelId: 'claude-haiku-4-5-20251001',
        costPerMessage: 1,
        isActive: true,
        description: 'Model tercepat dan paling hemat. Cocok untuk CS standar.',
      },
      {
        name: 'Claude Sonnet (Pintar)',
        provider: AiProvider.ANTHROPIC,
        modelId: 'claude-sonnet-4-6',
        costPerMessage: 3,
        isActive: true,
        description: 'Lebih pintar dan natural. Cocok untuk handling komplain dan negosiasi.',
      },
    ],
    skipDuplicates: true,
  })
  console.log('✅ AI Models selesai')

  // ─── Token Packages ───
  await prisma.tokenPackage.createMany({
    data: [
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
    ],
    skipDuplicates: true,
  })
  console.log('✅ Token Packages selesai')

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
