// GET /p/[slug] — public renderer untuk landing page yang dipublish.
//
// Pakai Route Handler (bukan page.tsx) supaya bisa return raw HTML dari user
// langsung tanpa di-wrap React tree (htmlContent dari AI adalah dokumen
// lengkap <!DOCTYPE html>... — kalau di-render via dangerouslySetInnerHTML
// dalam page.tsx, hasilnya nested <html> yang invalid).
//
// Per LP optimization (2026-05-07):
// - Track visitor di tabel LpVisit (IP di-hash, bukan plaintext) untuk
//   analytics + throttling.
// - Throttle 10 visit/menit per IP/LP — cegah scraping/DoS basic.
// - Cap bulanan per plan owner (UserQuota.maxVisitorMonth) — kalau lewat,
//   render halaman placeholder "tidak tersedia". Tujuan: hemat bandwidth
//   VPS untuk LP user free yg viral.
//
// Tidak ada auth check — middleware juga tidak include /p/* di matcher.
import crypto from 'node:crypto'

import { NextResponse } from 'next/server'

import { buildPixelSnippet } from '@/lib/lp/pixel-snippets'
import { prisma } from '@/lib/prisma'
import { parseUa } from '@/lib/ua-parse'

// Hash IP supaya tidak simpan plaintext (privacy + GDPR). Salt dari env supaya
// hash tidak bisa di-rainbow-table-kan kalau DB bocor.
function hashIp(ip: string): string {
  const salt = process.env.IP_SALT ?? 'hulao-default-ip-salt-rotate-me'
  return crypto.createHash('sha256').update(`${ip}|${salt}`).digest('hex')
}

// Ambil IP klien — Traefik forward via x-forwarded-for. Fallback ke unknown
// kalau header hilang (mis. test lokal). Throttle berbasis hash, jadi dua IP
// "unknown" akan di-counted bersama — tidak ideal tapi aman (lebih ketat).
function clientIpFrom(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')
  if (fwd) {
    const first = fwd.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip') ?? 'unknown'
}

const THROTTLE_PER_MIN = 10
const QUOTA_EXCEEDED_HTML = `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Halaman Sementara Tidak Tersedia</title><style>*{box-sizing:border-box}body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;color:#1f1f1f;background:#fafafa;padding:24px}main{max-width:480px;text-align:center}h1{font-size:1.75rem;margin:0 0 12px;color:#ea580c}p{color:#555;line-height:1.6}small{display:block;margin-top:32px;color:#999;font-size:11px}</style></head><body><main><h1>🔒 Halaman Sementara Tidak Tersedia</h1><p>Pemilik halaman ini telah mencapai batas pengunjung untuk bulan ini.</p><p>Silakan coba kembali bulan depan, atau hubungi pemilik langsung.</p><small>Powered by Hulao</small></main></body></html>`

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

// Inject tracker JS sebelum </body>. Kalau </body> tidak ada (HTML user
// fragment yang kelewat wrap), append di akhir document.
function injectTrackerScript(html: string, lpId: string): string {
  const tag = `<script src="/lp-tracker.js" data-lp="${lpId}" async></script>`
  const closingBody = html.match(/<\/body\s*>/i)
  if (closingBody && closingBody.index !== undefined) {
    return (
      html.slice(0, closingBody.index) +
      tag +
      '\n' +
      html.slice(closingBody.index)
    )
  }
  return html + '\n' + tag
}

// Inject pixel SDK snippets (Meta/TikTok/GA4/Google Ads) tepat sebelum </head>.
// Snippet sudah berisi browser SDK loader + click dispatcher untuk
// data-pixel-event. Kalau snippet kosong (user tidak punya pixel aktif), noop.
function injectPixelSnippet(html: string, snippet: string): string {
  if (!snippet) return html
  const closingHead = html.match(/<\/head\s*>/i)
  if (closingHead && closingHead.index !== undefined) {
    return (
      html.slice(0, closingHead.index) +
      snippet +
      '\n' +
      html.slice(closingHead.index)
    )
  }
  // Fallback: prepend di awal body kalau tidak ada </head>.
  const bodyOpen = html.match(/<body[^>]*>/i)
  if (bodyOpen && bodyOpen.index !== undefined) {
    const end = bodyOpen.index + bodyOpen[0].length
    return html.slice(0, end) + '\n' + snippet + '\n' + html.slice(end)
  }
  return snippet + '\n' + html
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

export async function GET(req: Request, { params }: Params) {
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
      // userId + plan-derived maxVisitorMonth untuk cek cap bulanan.
      userId: true,
      user: {
        select: {
          lpQuota: { select: { maxVisitorMonth: true } },
        },
      },
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

  // ── Visitor tracking + throttle ─────────────────────────────────────────
  const ipHash = hashIp(clientIpFrom(req.headers))
  const oneMinuteAgo = new Date(Date.now() - 60_000)

  // Per-IP throttle: maksimum 10 visit/menit untuk LP yg sama. Counter pakai
  // tabel LpVisit yg juga jadi log analytics — tidak butuh redis terpisah.
  const recentFromIp = await prisma.lpVisit.count({
    where: {
      landingPageId: lp.id,
      ipHash,
      createdAt: { gte: oneMinuteAgo },
    },
  })
  if (recentFromIp >= THROTTLE_PER_MIN) {
    return new NextResponse('Too many requests', {
      status: 429,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Retry-After': '60',
      },
    })
  }

  // Cap bulanan per-LP berdasar plan owner. Kalau quota habis, render placeholder
  // 503 "tidak tersedia" — search engine masih bisa crawl tapi user value 0.
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const monthlyCount = await prisma.lpVisit.count({
    where: { landingPageId: lp.id, createdAt: { gte: startOfMonth } },
  })
  const cap = lp.user.lpQuota?.maxVisitorMonth ?? 1000
  if (monthlyCount >= cap) {
    return new NextResponse(QUOTA_EXCEEDED_HTML, {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Robots-Tag': 'noindex',
      },
    })
  }

  // Fire-and-forget visitor record + viewCount — JANGAN await supaya tidak slow
  // render. Error di-swallow karena observability bukan critical path.
  // LP Lab Phase 1 (2026-05-09): tambah deviceType/browser/os via UA parse +
  // UTM extract dari URL — supaya analytics dashboard punya dimensi lengkap.
  const userAgent = req.headers.get('user-agent') ?? ''
  const parsedUa = parseUa(userAgent)
  const reqUrl = new URL(req.url)
  const utmSource = reqUrl.searchParams.get('utm_source')?.slice(0, 100) ?? null
  const utmMedium = reqUrl.searchParams.get('utm_medium')?.slice(0, 100) ?? null
  const utmCampaign = reqUrl.searchParams.get('utm_campaign')?.slice(0, 100) ?? null
  // Geoip dari header reverse proxy kalau ada (Cloudflare/Vercel set ini).
  // Traefik default tidak set — jadi biasanya null. Bisa ditambah nanti via
  // service eksternal di Phase 2.
  const country =
    req.headers.get('cf-ipcountry')?.slice(0, 2) ??
    req.headers.get('x-vercel-ip-country')?.slice(0, 2) ??
    null
  const city =
    req.headers.get('x-vercel-ip-city')?.slice(0, 100) ??
    null
  prisma.lpVisit
    .create({
      data: {
        landingPageId: lp.id,
        ipHash,
        userAgent: userAgent.slice(0, 500) || null,
        referer: req.headers.get('referer')?.slice(0, 500) ?? null,
        deviceType: parsedUa.deviceType,
        browser: parsedUa.browser,
        os: parsedUa.os,
        country,
        city,
        utmSource,
        utmMedium,
        utmCampaign,
      },
    })
    .catch((err) => console.error('[/p/:slug] gagal save LpVisit:', err))
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

  let finalHtml = isFullDoc
    ? injectMeta(html, metaBlock)
    : wrapAsDocument(html, metaBlock)

  // Inject pixel SDK + dispatcher untuk semua pixel aktif milik owner LP.
  // Dispatcher pasang listener click — saat elemen ber-data-pixel-event di-klik,
  // fire ke semua platform. Aman kalau user belum ada pixel: buildPixelSnippet
  // return '' & injectPixelSnippet noop.
  const activePixels = await prisma.pixelIntegration.findMany({
    where: { userId: lp.userId, isActive: true },
    select: {
      platform: true,
      pixelId: true,
      conversionLabelInitiateCheckout: true,
      conversionLabelLead: true,
      conversionLabelPurchase: true,
    },
  })
  const pixelBlob = buildPixelSnippet(activePixels)
  finalHtml = injectPixelSnippet(finalHtml, pixelBlob)

  // LP Lab Phase 1 — inject tracker JS sebelum </body>. Async + non-blocking.
  // data-lp attribute dipakai tracker untuk identify lpId (tidak via URL
  // supaya cache CDN tetap satu file untuk semua LP).
  finalHtml = injectTrackerScript(finalHtml, lp.id)

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
