export const dynamic = 'force-dynamic'
export const revalidate = 0

import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://hulao.id',
      lastModified: new Date(),
    },
    {
      url: 'https://hulao.id/login',
      lastModified: new Date(),
    },
    {
      url: 'https://hulao.id/register',
      lastModified: new Date(),
    },
  ]
}
