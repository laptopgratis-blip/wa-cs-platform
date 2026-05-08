// Landing page publik. Server component supaya paket harga di-fetch
// langsung dari DB (tidak perlu client request).
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { CTA } from '@/components/landing/CTA'
import { FAQ } from '@/components/landing/FAQ'
import { Features } from '@/components/landing/Features'
import { Footer } from '@/components/landing/Footer'
import { Hero } from '@/components/landing/Hero'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { LpBuilderHook } from '@/components/landing/LpBuilderHook'
import { Navbar } from '@/components/landing/Navbar'
import { PowerTierExplainer } from '@/components/landing/PowerTierExplainer'
import { Pricing } from '@/components/landing/Pricing'
import { ProblemAgitation } from '@/components/landing/ProblemAgitation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  // Kalau sudah login, lompat langsung ke dashboard.
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  const packages = await prisma.tokenPackage.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      tokenAmount: true,
      price: true,
      isPopular: true,
    },
  })

  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <main className="flex-1">
        {/* Order section disusun mengikuti funnel:
            Hero → Problem (agitate) → Features (3-act solution) →
            HowItWorks (gampang) → LpBuilder (lead magnet bonus) →
            Power tier (untuk yang serius) → Pricing → FAQ (objection) → CTA */}
        <Hero />
        <ProblemAgitation />
        <Features />
        <HowItWorks />
        <LpBuilderHook />
        <div id="power">
          <PowerTierExplainer />
        </div>
        <Pricing packages={packages} />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
