// /content — Content Studio dashboard. 2 tab: Idea Generator + Library.
import { Sparkles } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { ContentStudioClient } from '@/components/content/ContentStudioClient'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ lpId?: string; tab?: string }>
}

export default async function ContentStudioPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const { lpId, tab } = await searchParams

  // Load LP list untuk dropdown.
  const [landingPages, balance] = await Promise.all([
    prisma.landingPage.findMany({
      where: { userId: session.user.id },
      select: { id: true, title: true, slug: true, isPublished: true },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    prisma.tokenBalance.findUnique({
      where: { userId: session.user.id },
      select: { balance: true },
    }),
  ])

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      <header>
        <div className="mb-1 flex items-center gap-2">
          <Sparkles className="size-5 text-primary-500" />
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            Content Studio
          </h1>
        </div>
        <p className="text-sm text-warm-500">
          Bikin ide & konten siap posting dari LP kamu — 15 ide dalam 1 klik,
          tinggal pilih yg mau di-bikin.
        </p>
      </header>

      <ContentStudioClient
        initialTab={tab === 'library' ? 'library' : 'generate'}
        initialLpId={lpId}
        landingPages={landingPages}
        tokenBalance={balance?.balance ?? 0}
      />
    </div>
  )
}
