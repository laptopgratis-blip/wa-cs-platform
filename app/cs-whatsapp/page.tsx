// /cs-whatsapp — sub-page khusus fitur CS AI WhatsApp.
// Sebelumnya isi home, dipindah ke sini biar home utama bisa fokus ke LP
// Gratis (entry-point UMKM). Di sini full pitch CS AI: pain → solution
// → cara kerja → Order System (PowerTierExplainer) → pricing → FAQ → CTA.
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { CTA } from '@/components/landing/CTA'
import { FAQ } from '@/components/landing/FAQ'
import { Features } from '@/components/landing/Features'
import { Footer } from '@/components/landing/Footer'
import { Hero } from '@/components/landing/Hero'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { Navbar } from '@/components/landing/Navbar'
import { PowerTierExplainer } from '@/components/landing/PowerTierExplainer'
import { Pricing } from '@/components/landing/Pricing'
import { ProblemAgitation } from '@/components/landing/ProblemAgitation'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getOrderSystemStartingPlan } from '@/lib/services/landing-plan'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'CS WhatsApp Otomatis dengan AI · Hulao',
  description:
    'AI yang balas pelanggan WhatsApp dalam 3 detik, 24/7. Hubungkan banyak nomor, kontrol penuh dari inbox. Mulai gratis tanpa kartu kredit.',
}

export default async function CsWhatsAppPage() {
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  const [packages, orderSystemPlan] = await Promise.all([
    prisma.tokenPackage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        tokenAmount: true,
        price: true,
        isPopular: true,
      },
    }),
    getOrderSystemStartingPlan(),
  ])

  return (
    <div className="flex min-h-svh flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <ProblemAgitation />
        <Features />
        <HowItWorks />
        <div id="power">
          <PowerTierExplainer orderSystemPlan={orderSystemPlan} />
        </div>
        <Pricing packages={packages} orderSystemPlan={orderSystemPlan} />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  )
}
