// /sitemap.xml — auto-generated dari semua LP yang dipublish.
// Search engine bisa discover & crawl semua public LP via file ini.
import type { MetadataRoute } from 'next'

import { prisma } from '@/lib/prisma'

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3000'
  )
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()

  const publishedLps = await prisma.landingPage.findMany({
    where: { isPublished: true },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 5_000, // batas sitemap aman
  })

  // Halaman utama platform + semua public LP.
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    ...publishedLps.map((lp) => ({
      url: `${baseUrl}/p/${lp.slug}`,
      lastModified: lp.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}
