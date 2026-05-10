// Landing page utama — fokus ke "Bikin LP Gratis 5 menit" sebagai entry-point
// utama UMKM (positioning baru 2026-05-10). Fitur CS WhatsApp AI dipindah ke
// /cs-whatsapp sub-page biar home tidak terlalu padat.
//
// Funnel: Hero (LP gratis) → 3-step (cara kerja) → Features (apa yg didapat)
// → MoreFeatures (cross-sell ke fitur lain Hulao) → Pricing (transparan)
// → FAQ (objection handling) → FinalCTA (risk reversal).
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { Footer } from '@/components/landing/Footer'
import { Features } from '@/components/landing/lp-gratis/Features'
import { FAQ } from '@/components/landing/lp-gratis/FAQ'
import { FinalCTA } from '@/components/landing/lp-gratis/FinalCTA'
import { Hero } from '@/components/landing/lp-gratis/Hero'
import { MoreFeatures } from '@/components/landing/lp-gratis/MoreFeatures'
import { ThreeSteps } from '@/components/landing/lp-gratis/ThreeSteps'
import { Navbar } from '@/components/landing/Navbar'
import { Pricing } from '@/components/landing/Pricing'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Bikin Landing Page Gratis dalam 5 Menit · Hulao',
  description:
    'Pakai AI gratis (Gemini/Claude.ai), Hulao yang host & auto-connect ke WhatsApp. Tanpa coding, tanpa langganan bulanan. Custom slug, mobile responsive, editor visual.',
}

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
        <Hero />
        <ThreeSteps />
        <Features />
        <MoreFeatures />
        <div id="pricing">
          <Pricing packages={packages} />
        </div>
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
