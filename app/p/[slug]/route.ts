// GET /p/[slug] — public renderer untuk landing page yang dipublish.
//
// Pakai Route Handler (bukan page.tsx) supaya bisa return raw HTML dari user
// langsung tanpa di-wrap React tree (htmlContent dari AI adalah dokumen
// lengkap <!DOCTYPE html>... — kalau di-render via dangerouslySetInnerHTML
// dalam page.tsx, hasilnya nested <html> yang invalid).
//
// Tidak ada auth check — middleware juga tidak include /p/* di matcher.
import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'

interface Params {
  params: Promise<{ slug: string }>
}

// HTML-escape untuk content yang masuk ke <meta> attribute.
function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Build meta tag block — title + description + open graph + robots.
function buildMetaTags(input: {
  title: string
  description: string
  url: string
}): string {
  const t = escapeHtmlAttr(input.title)
  const d = escapeHtmlAttr(input.description)
  const u = escapeHtmlAttr(input.url)
  return [
    `<title>${t}</title>`,
    `<meta name="description" content="${d}" />`,
    `<meta name="robots" content="index, follow" />`,
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
  ].join('\n  ')
}

// Inject meta tags ke <head>. Pakai approach pragmatis: kalau user sudah
// punya <title>, kita ganti. Kalau tidak, kita prepend semua meta tags
// di awal <head>. Output user lain dibiarkan apa adanya.
function injectMeta(htmlDoc: string, metaBlock: string): string {
  const headOpenMatch = htmlDoc.match(/<head[^>]*>/i)
  if (!headOpenMatch) return htmlDoc // not a full document — leave alone
  const headOpenIdx = headOpenMatch.index ?? 0
  const headOpenLen = headOpenMatch[0].length
  // Strip <title> & beberapa meta tag yang akan kita override (description, robots, og:*).
  // Sisanya (mis. <meta charset>, viewport, custom og:image) kita biarkan.
  let cleaned = htmlDoc.replace(/<title[^>]*>[\s\S]*?<\/title>\s*/gi, '')
  cleaned = cleaned.replace(
    /<meta\s+(?:name|property)=["'](?:description|robots|og:title|og:description|og:type|og:url|twitter:card|twitter:title|twitter:description)["'][^>]*\/?\s*>\s*/gi,
    '',
  )
  // Re-find <head> di string yang sudah dibersihkan.
  const reMatch = cleaned.match(/<head[^>]*>/i)
  if (!reMatch) return htmlDoc
  const idx = (reMatch.index ?? 0) + reMatch[0].length
  return (
    cleaned.slice(0, idx) + '\n  ' + metaBlock + '\n' + cleaned.slice(idx)
  )
  // Note: hindari unused-variable warning untuk variabel awal — keep originals.
  void headOpenIdx
  void headOpenLen
}

// Wrap HTML kalau user kasih fragment (jarang — AI kita instruct kasih
// dokumen lengkap, tapi defensive).
function wrapAsDocument(content: string, metaBlock: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${metaBlock}
</head>
<body>
${content}
</body>
</html>`
}

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params

  const lp = await prisma.landingPage.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      htmlContent: true,
      metaTitle: true,
      metaDesc: true,
      isPublished: true,
    },
  })

  if (!lp || !lp.isPublished) {
    // Return 404 dengan body minimal — Next.js not-found.tsx tidak applicable
    // karena ini route handler (raw HTML).
    return new NextResponse(
      `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>404 — Tidak ditemukan</title><style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;color:#1f1f1f}main{text-align:center}h1{font-size:4rem;margin:0;color:#ea580c}p{color:#666}</style></head><body><main><h1>404</h1><p>Landing page tidak ditemukan atau belum dipublish.</p></main></body></html>`,
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  // Fire-and-forget viewCount increment — JANGAN await supaya tidak slow render.
  // Error di-swallow karena view count bukan critical path.
  prisma.landingPage
    .update({
      where: { id: lp.id },
      data: { viewCount: { increment: 1 } },
    })
    .catch((err) => console.error('[/p/:slug] gagal increment viewCount:', err))

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    'http://localhost:3000'
  const fullUrl = `${baseUrl}/p/${slug}`

  // Default fallback: pakai title LP & deskripsi dari metaDesc, atau text generic.
  const metaTitle = (lp.metaTitle ?? lp.title).slice(0, 200)
  const metaDesc = (
    lp.metaDesc ?? `${lp.title} — landing page.`
  ).slice(0, 320)

  const metaBlock = buildMetaTags({
    title: metaTitle,
    description: metaDesc,
    url: fullUrl,
  })

  const html = lp.htmlContent.trim()
  const isFullDoc = /<head[^>]*>/i.test(html) && /<html[^>]*>/i.test(html)

  const finalHtml = isFullDoc
    ? injectMeta(html, metaBlock)
    : wrapAsDocument(html, metaBlock)

  return new NextResponse(finalHtml, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Cache control: lightweight cache supaya search bot crawl efisien,
      // tapi tetap stale dalam menit untuk ngeliat update LP.
      'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=300',
      'X-Robots-Tag': 'index, follow',
    },
  })
}
