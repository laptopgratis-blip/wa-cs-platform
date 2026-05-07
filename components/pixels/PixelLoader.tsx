'use client'

// Browser pixel loader — load script tags untuk Meta fbq, Google gtag,
// TikTok ttq sesuai pixel yang aktif untuk form/invoice. Auto-fire PageView
// saat load. Component lain panggil firePixelEvent() untuk track event lain.
import { useEffect, useRef } from 'react'

export interface BrowserPixel {
  id: string
  platform: string
  pixelId: string
}

interface Props {
  pixels: BrowserPixel[]
}

// Type augmentation untuk window — cleaner daripada `any` cast inline.
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fbq?: any
    _fbq?: unknown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gtag?: (...args: any[]) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dataLayer?: any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ttq?: any
    TiktokAnalyticsObject?: string
  }
}

const loadedPixelIds = new Set<string>()

export function PixelLoader({ pixels }: Props) {
  const initialized = useRef(false)

  useEffect(() => {
    // Idempotent — load sekali per pixelId selama session, supaya navigasi
    // antar halaman tidak re-load script.
    for (const pixel of pixels) {
      const key = `${pixel.platform}:${pixel.pixelId}`
      if (loadedPixelIds.has(key)) continue
      loadedPixelIds.add(key)

      try {
        if (pixel.platform === 'META') loadMeta(pixel.pixelId)
        else if (pixel.platform === 'GOOGLE_ADS' || pixel.platform === 'GA4')
          loadGtag(pixel.pixelId)
        else if (pixel.platform === 'TIKTOK') loadTikTok(pixel.pixelId)
      } catch (err) {
        // Don't break form kalau load pixel gagal.
        console.error('[PixelLoader] gagal load', pixel.platform, err)
      }
    }
    initialized.current = true
  }, [pixels])

  return null
}

// ─── Meta Pixel ────────────────────────────────────────────────────────────
function loadMeta(pixelId: string) {
  if (window.fbq) {
    window.fbq('init', pixelId)
    window.fbq('track', 'PageView')
    return
  }
  // Loader resmi dari Meta — kompatibel dengan multiple init. Pakai eval-like
  // pattern dari snippet resmi; cast `any` perlu karena fbq punya property
  // dinamis (callMethod, queue, push, loaded, version) yang di-attach inline.
  /* eslint-disable @typescript-eslint/no-explicit-any, prefer-rest-params */
  ;(function (f: any, b: Document, e: string, v: string) {
    if (f.fbq) return
    const n: any = (f.fbq = function () {
      n.callMethod
        ? n.callMethod.apply(n, arguments as unknown as unknown[])
        : n.queue.push(arguments)
    })
    if (!f._fbq) f._fbq = n
    n.push = n
    n.loaded = true
    n.version = '2.0'
    n.queue = []
    const t = b.createElement(e) as HTMLScriptElement
    t.async = true
    t.src = v
    const s = b.getElementsByTagName(e)[0]
    s.parentNode?.insertBefore(t, s)
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
  /* eslint-enable @typescript-eslint/no-explicit-any, prefer-rest-params */

  window.fbq('init', pixelId)
  window.fbq('track', 'PageView')
}

// ─── Google gtag (GA4 + Google Ads) ────────────────────────────────────────
function loadGtag(measurementId: string) {
  // gtag global setup — kalau sudah ada, cukup config tambahan.
  if (!window.gtag) {
    const script = document.createElement('script')
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
    script.async = true
    document.head.appendChild(script)
    window.dataLayer = window.dataLayer || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.gtag = function gtag(...args: any[]) {
      window.dataLayer!.push(args)
    }
    window.gtag('js', new Date())
  }
  window.gtag('config', measurementId)
}

// ─── TikTok Pixel ──────────────────────────────────────────────────────────
function loadTikTok(pixelId: string) {
  if (window.ttq) {
    window.ttq.load(pixelId)
    window.ttq.page()
    return
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  ;(function (w, d, t) {
    w.TiktokAnalyticsObject = t
    const ttq = (w[t] = w[t] || [])
    ttq.methods = [
      'page',
      'track',
      'identify',
      'instances',
      'debug',
      'on',
      'off',
      'once',
      'ready',
      'alias',
      'group',
      'enableCookie',
      'disableCookie',
      'holdConsent',
      'revokeConsent',
      'grantConsent',
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ttq.setAndDefer = function (t: any, e: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      t[e] = function (...args: any[]) {
        t.push([e].concat(args))
      }
    }
    for (let i = 0; i < ttq.methods.length; i++)
      ttq.setAndDefer(ttq, ttq.methods[i])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ttq.instance = function (t: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = ttq._i[t] || []
      for (let n = 0; n < ttq.methods.length; n++)
        ttq.setAndDefer(e, ttq.methods[n])
      return e
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ttq.load = function (e: string, n?: any) {
      const r = 'https://analytics.tiktok.com/i18n/pixel/events.js'
      ttq._i = ttq._i || {}
      ttq._i[e] = []
      ttq._i[e]._u = r
      ttq._t = ttq._t || {}
      ttq._t[e] = +new Date()
      ttq._o = ttq._o || {}
      ttq._o[e] = n || {}
      const o = d.createElement('script')
      o.type = 'text/javascript'
      o.async = !0
      o.src = `${r}?sdkid=${e}&lib=${t}`
      const a = d.getElementsByTagName('script')[0]
      a.parentNode?.insertBefore(o, a)
    }
    ttq.load(pixelId)
    ttq.page()
  })(w, document, 'ttq')
}

// ─── Helper: fire event ke semua loaded pixel ──────────────────────────────
// eventId WAJIB sama antara browser & server untuk dedup Meta/TikTok.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function firePixelEvent(
  eventName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventData: Record<string, any>,
  eventId: string,
) {
  // Meta — pakai eventID untuk dedup CAPI.
  if (typeof window !== 'undefined' && window.fbq) {
    try {
      window.fbq('track', eventName, eventData, { eventID: eventId })
    } catch (err) {
      console.error('[firePixelEvent] meta error', err)
    }
  }
  // Google gtag — pakai transaction_id untuk dedup conversion.
  if (typeof window !== 'undefined' && window.gtag) {
    try {
      window.gtag('event', eventName, {
        ...eventData,
        transaction_id: eventId,
      })
    } catch (err) {
      console.error('[firePixelEvent] gtag error', err)
    }
  }
  // TikTok — pakai event_id untuk dedup Events API.
  if (typeof window !== 'undefined' && window.ttq) {
    try {
      window.ttq.track(eventName, eventData, { event_id: eventId })
    } catch (err) {
      console.error('[firePixelEvent] tiktok error', err)
    }
  }
}

// Generate stable event ID supaya browser & server kirim ID sama untuk
// event sama. context = orderId / sessionId / formId — apa pun yang stable
// selama satu rentang interaksi user.
export function generateEventId(eventName: string, context: string): string {
  return `${eventName}_${context}_${Date.now()}`
}
