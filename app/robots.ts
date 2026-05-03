// /robots.txt — allow semua crawler ke /p/* (LP publik), block area private.
import type { MetadataRoute } from 'next'

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3000'
  )
}

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl()
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/p/'],
        // Block area private supaya tidak pernah ke-index.
        disallow: ['/dashboard/', '/admin/', '/api/', '/login', '/register'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
