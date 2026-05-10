// /admin/pricing-calculator — kalkulator margin platform per AI model.
// Server component fetch data, client component pakai state untuk tweak input.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { PricingCalculator } from '@/components/admin/PricingCalculator'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function AdminPricingCalculatorPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')
  if (session.user.role !== 'ADMIN') redirect('/dashboard')

  const [models, packages, aiFeatures] = await Promise.all([
    prisma.aiModel.findMany({
      where: { isActive: true },
      orderBy: [{ provider: 'asc' }, { costPerMessage: 'asc' }],
    }),
    prisma.tokenPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.aiFeatureConfig.findMany({
      orderBy: { displayName: 'asc' },
    }),
  ])

  return (
    <div className="mx-auto h-full max-w-7xl overflow-y-auto p-4 md:p-6">
      <PricingCalculator
        models={models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          costPerMessage: m.costPerMessage,
          inputPricePer1M: m.inputPricePer1M,
          outputPricePer1M: m.outputPricePer1M,
        }))}
        packages={packages.map((p) => ({
          id: p.id,
          name: p.name,
          tokenAmount: p.tokenAmount,
          price: p.price,
          isPopular: p.isPopular,
        }))}
        aiFeatures={aiFeatures.map((f) => ({
          id: f.id,
          featureKey: f.featureKey,
          displayName: f.displayName,
          modelName: f.modelName,
          inputPricePer1M: f.inputPricePer1M,
          outputPricePer1M: f.outputPricePer1M,
          platformMargin: f.platformMargin,
          floorTokens: f.floorTokens,
          capTokens: f.capTokens,
          isActive: f.isActive,
        }))}
      />
    </div>
  )
}
