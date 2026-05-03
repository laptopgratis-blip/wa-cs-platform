// /landing-pages/[lpId]/edit — Halaman editor LP.
// Server component: fetch LP + validasi owner, lalu render EditorShell.
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'

import { EditorShell } from '@/components/lp/EditorShell'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function EditLpPage({
  params,
}: {
  params: Promise<{ lpId: string }>
}) {
  const { lpId } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const lp = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: {
      id: true,
      title: true,
      slug: true,
      htmlContent: true,
      metaTitle: true,
      metaDesc: true,
      isPublished: true,
      updatedAt: true,
    },
  })

  if (!lp) notFound()
  // Validasi owner — server-side defense in depth (API juga sudah cek).
  const owner = await prisma.landingPage.findUnique({
    where: { id: lpId },
    select: { userId: true },
  })
  if (owner?.userId !== session.user.id) notFound()

  return (
    <EditorShell
      initial={{
        id: lp.id,
        title: lp.title,
        slug: lp.slug,
        htmlContent: lp.htmlContent,
        metaTitle: lp.metaTitle,
        metaDesc: lp.metaDesc,
        isPublished: lp.isPublished,
        updatedAt: lp.updatedAt.toISOString(),
      }}
    />
  )
}
