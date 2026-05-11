// Generate browser pixel SDK snippets untuk di-inject di LP public.
//
// Input: list PixelIntegration aktif milik user pemilik LP.
// Output: HTML <script> blob yang di-inject di <head> halaman publik.
//
// Sertakan juga dispatcher script: saat ada klik elemen ber-`data-pixel-event`,
// fire event ke semua platform aktif. Standard events di-route ke `fbq('track')`,
// custom event ke `fbq('trackCustom')`; TikTok pakai `ttq.track`; GA4 pakai
// `gtag('event')`; Google Ads pakai conversion label map per-event.

// Subset field PixelIntegration yang dibutuhkan — sengaja explicit supaya
// caller tidak forced expose access token / data sensitif.
export interface PixelInjectConfig {
  platform: string // META | TIKTOK | GA4 | GOOGLE_ADS
  pixelId: string
  conversionLabelInitiateCheckout?: string | null
  conversionLabelLead?: string | null
  conversionLabelPurchase?: string | null
}

// Escape untuk safe inject ke dalam JS string literal. Hanya untuk pixelId yang
// sumbernya DB — tetap defensif.
function jsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')
}

function metaSnippet(pixelId: string): string {
  const id = jsEscape(pixelId)
  return `
<!-- Meta Pixel -->
<script>
!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${id}');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1"/></noscript>`
}

function tiktokSnippet(pixelId: string): string {
  const id = jsEscape(pixelId)
  return `
<!-- TikTok Pixel -->
<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
  ttq.load('${id}');
  ttq.page();
}(window, document, 'ttq');
</script>`
}

function ga4Snippet(measurementId: string): string {
  const id = jsEscape(measurementId)
  return `
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');
</script>`
}

function googleAdsSnippet(awId: string): string {
  const id = jsEscape(awId)
  return `
<!-- Google Ads -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');
</script>`
}

// Map event-name standard kita → event name target platform. Beberapa platform
// pakai casing/nama berbeda (TikTok pakai TitleCase yang sama, GA4 pakai
// snake_case di beberapa).
const STANDARD_META_EVENTS = new Set([
  'PageView',
  'ViewContent',
  'Search',
  'AddToCart',
  'AddToWishlist',
  'InitiateCheckout',
  'AddPaymentInfo',
  'Purchase',
  'Lead',
  'CompleteRegistration',
  'Contact',
  'CustomizeProduct',
  'Donate',
  'FindLocation',
  'Schedule',
  'StartTrial',
  'SubmitApplication',
  'Subscribe',
])

// Build object literal `{Lead: 'AW-XXX/yyy', ...}` untuk Google Ads conversion
// label mapping — di-inject ke window supaya dispatcher bisa send_to dgn label.
function googleAdsLabelMap(cfg: PixelInjectConfig): string {
  const entries: string[] = []
  const awId = jsEscape(cfg.pixelId)
  if (cfg.conversionLabelLead) {
    entries.push(
      `'Lead':'${awId}/${jsEscape(cfg.conversionLabelLead)}'`,
    )
  }
  if (cfg.conversionLabelInitiateCheckout) {
    entries.push(
      `'InitiateCheckout':'${awId}/${jsEscape(cfg.conversionLabelInitiateCheckout)}'`,
    )
  }
  if (cfg.conversionLabelPurchase) {
    entries.push(
      `'Purchase':'${awId}/${jsEscape(cfg.conversionLabelPurchase)}'`,
    )
  }
  return `{${entries.join(',')}}`
}

// Dispatcher: pasang event listener "click" capture, walk up parent max 5 level,
// kalau ada elemen dengan data-pixel-event → fire ke semua platform aktif.
function dispatcherScript(pixels: PixelInjectConfig[]): string {
  const hasMeta = pixels.some((p) => p.platform === 'META')
  const hasTikTok = pixels.some((p) => p.platform === 'TIKTOK')
  const hasGa4 = pixels.some((p) => p.platform === 'GA4')
  const googleAds = pixels.find((p) => p.platform === 'GOOGLE_ADS')

  const standardMetaJson = JSON.stringify(
    Array.from(STANDARD_META_EVENTS).reduce<Record<string, number>>(
      (acc, ev) => ((acc[ev] = 1), acc),
      {},
    ),
  )
  const adsLabelMap = googleAds ? googleAdsLabelMap(googleAds) : '{}'

  return `
<!-- Hulao LP — pixel dispatcher (data-pixel-event listener) -->
<script>
(function () {
  if (window.__lpPixelDispatcherWired) return;
  window.__lpPixelDispatcherWired = true;
  var STANDARD_META = ${standardMetaJson};
  var ADS_LABELS = ${adsLabelMap};

  function fire(eventName, value, currency) {
    var v = value && !isNaN(parseFloat(value)) ? parseFloat(value) : null;
    var c = currency || 'IDR';
    try {
      ${
        hasMeta
          ? `if (window.fbq) {
        var params = {};
        if (v != null) params.value = v;
        if (v != null) params.currency = c;
        if (STANDARD_META[eventName]) {
          window.fbq('track', eventName, Object.keys(params).length ? params : undefined);
        } else {
          window.fbq('trackCustom', eventName, params);
        }
      }`
          : ''
      }
      ${
        hasTikTok
          ? `if (window.ttq && typeof window.ttq.track === 'function') {
        var tp = {};
        if (v != null) tp.value = v;
        if (v != null) tp.currency = c;
        window.ttq.track(eventName, Object.keys(tp).length ? tp : undefined);
      }`
          : ''
      }
      ${
        hasGa4
          ? `if (window.gtag) {
        var gp = {};
        if (v != null) gp.value = v;
        if (v != null) gp.currency = c;
        window.gtag('event', eventName, gp);
      }`
          : ''
      }
      ${
        googleAds
          ? `if (window.gtag && ADS_LABELS[eventName]) {
        var ap = { send_to: ADS_LABELS[eventName] };
        if (v != null) ap.value = v;
        if (v != null) ap.currency = c;
        window.gtag('event', 'conversion', ap);
      }`
          : ''
      }
    } catch (err) {
      if (window.console) console.error('[lp-pixel]', err);
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target;
    for (var i = 0; el && i < 5; i++) {
      if (el.getAttribute) {
        var ev = el.getAttribute('data-pixel-event');
        if (ev) {
          fire(ev, el.getAttribute('data-pixel-value'), el.getAttribute('data-pixel-currency'));
          return;
        }
      }
      el = el.parentNode;
    }
  }, true);

  // Expose untuk dipanggil manual dari script LP lain (mis. form submit).
  window.lpFirePixel = fire;
})();
</script>`
}

// Public entry: bangun blob script dari pixel list. Return string kosong kalau
// tidak ada pixel aktif (jangan inject dispatcher juga supaya halaman bersih).
export function buildPixelSnippet(pixels: PixelInjectConfig[]): string {
  if (!pixels || pixels.length === 0) return ''
  const parts: string[] = []
  for (const p of pixels) {
    if (!p.pixelId) continue
    if (p.platform === 'META') parts.push(metaSnippet(p.pixelId))
    else if (p.platform === 'TIKTOK') parts.push(tiktokSnippet(p.pixelId))
    else if (p.platform === 'GA4') parts.push(ga4Snippet(p.pixelId))
    else if (p.platform === 'GOOGLE_ADS') parts.push(googleAdsSnippet(p.pixelId))
  }
  if (parts.length === 0) return ''
  parts.push(dispatcherScript(pixels))
  return parts.join('\n')
}
