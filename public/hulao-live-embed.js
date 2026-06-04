// Hulao Live AI Embed — widget loader.
// Di-inject otomatis oleh /p/[slug] renderer kalau LandingPage punya
// LpLiveEmbed aktif. Owner tidak perlu paste apapun manual.
//
// Cara kerja:
// 1. Baca data-lp-id dari script tag sendiri
// 2. Fetch /api/lp-embed/<lpId> untuk config
// 3. Kalau inactive → exit
// 4. Sesuai position:
//    - 'inline' → cari marker [data-hulao-live-embed], replace dgn iframe
//    - 'floating-*' → append fixed iframe ke <body> di pojok
// 5. Iframe src: /embed/live/<liveSlug>?lpId=<lpId>
//
// Listen postMessage dari iframe untuk:
//   - hulao-live:lead-captured → trigger pixel custom event "Lead"
;(function () {
  if (window.__HULAO_LIVE_EMBED_LOADED__) return
  window.__HULAO_LIVE_EMBED_LOADED__ = true

  var script = document.currentScript
  if (!script) {
    // Cari script[src*=hulao-live-embed.js] sebagai fallback.
    var scripts = document.querySelectorAll('script[src*="hulao-live-embed.js"]')
    script = scripts[scripts.length - 1]
  }
  if (!script) return

  var lpId = script.getAttribute('data-lp-id')
  if (!lpId) {
    console.warn('[hulao-live-embed] data-lp-id missing')
    return
  }

  var baseUrl =
    script.getAttribute('data-base-url') ||
    (function () {
      try {
        return new URL(script.src).origin
      } catch (e) {
        return ''
      }
    })()

  function buildEmbedSrc(liveSlug) {
    var u = baseUrl + '/embed/live/' + encodeURIComponent(liveSlug)
    u += '?lpId=' + encodeURIComponent(lpId)
    return u
  }

  function mountInline(config, marker) {
    var iframe = document.createElement('iframe')
    iframe.src = buildEmbedSrc(config.liveSlug)
    iframe.title = 'Hulao Live AI — ' + (config.liveName || '')
    iframe.allow = 'autoplay; fullscreen; microphone; camera; clipboard-write'
    iframe.style.cssText = [
      'width: 100%',
      'max-width: ' + config.widthPx + 'px',
      'height: ' + config.heightPx + 'px',
      'border: 0',
      'border-radius: 16px',
      'overflow: hidden',
      'box-shadow: 0 10px 40px rgba(0,0,0,0.15)',
      'display: block',
      'margin: 0 auto',
    ].join(';')
    marker.innerHTML = ''
    marker.appendChild(iframe)
  }

  function mountFloating(config) {
    var wrapper = document.createElement('div')
    var positionStyle = ''
    switch (config.position) {
      case 'floating-bl':
        positionStyle = 'left: 16px; bottom: 16px;'
        break
      case 'floating-tr':
        positionStyle = 'right: 16px; top: 16px;'
        break
      case 'floating-tl':
        positionStyle = 'left: 16px; top: 16px;'
        break
      case 'floating-br':
      default:
        positionStyle = 'right: 16px; bottom: 16px;'
    }
    wrapper.style.cssText = [
      'position: fixed',
      positionStyle,
      'z-index: 999999',
      'width: 360px',
      'max-width: calc(100vw - 32px)',
      'height: 600px',
      'max-height: calc(100vh - 32px)',
      'border-radius: 16px',
      'overflow: hidden',
      'box-shadow: 0 10px 40px rgba(0,0,0,0.3)',
      'background: black',
    ].join(';')

    var iframe = document.createElement('iframe')
    iframe.src = buildEmbedSrc(config.liveSlug)
    iframe.title = 'Hulao Live AI — ' + (config.liveName || '')
    iframe.allow = 'autoplay; fullscreen; microphone; camera; clipboard-write'
    iframe.style.cssText = 'width: 100%; height: 100%; border: 0;'

    var closeBtn = document.createElement('button')
    closeBtn.innerHTML = '✕'
    closeBtn.setAttribute('aria-label', 'Tutup')
    closeBtn.style.cssText = [
      'position: absolute',
      'top: 8px',
      'right: 8px',
      'z-index: 2',
      'width: 28px',
      'height: 28px',
      'border-radius: 999px',
      'border: 0',
      'background: rgba(0,0,0,0.6)',
      'color: white',
      'font-size: 14px',
      'cursor: pointer',
    ].join(';')
    closeBtn.onclick = function () {
      wrapper.style.display = 'none'
      showLauncher()
    }

    wrapper.appendChild(closeBtn)
    wrapper.appendChild(iframe)
    document.body.appendChild(wrapper)

    var launcherShown = false
    function showLauncher() {
      if (launcherShown) return
      launcherShown = true
      var btn = document.createElement('button')
      btn.innerHTML =
        '<span style="font-size:18px;margin-right:6px;">▶</span> ' +
        (config.ctaLabel || 'Tanya host live')
      btn.style.cssText = [
        'position: fixed',
        positionStyle,
        'z-index: 999999',
        'padding: 12px 18px',
        'border-radius: 999px',
        'border: 0',
        'background: #f97316',
        'color: white',
        'font-weight: 600',
        'font-size: 14px',
        'cursor: pointer',
        'box-shadow: 0 8px 24px rgba(249,115,22,0.4)',
        'display: flex',
        'align-items: center',
      ].join(';')
      btn.onclick = function () {
        document.body.removeChild(btn)
        wrapper.style.display = 'block'
        launcherShown = false
      }
      document.body.appendChild(btn)
    }
  }

  function init() {
    fetch(baseUrl + '/api/lp-embed/' + encodeURIComponent(lpId), {
      credentials: 'omit',
    })
      .then(function (r) {
        return r.json()
      })
      .then(function (config) {
        if (!config || !config.active) return
        if (config.position === 'inline') {
          var marker = document.querySelector('[data-hulao-live-embed]')
          if (!marker) {
            // Fallback: kalau owner gak pasang marker, append di akhir <body>
            // sebagai inline section.
            var fallback = document.createElement('section')
            fallback.setAttribute('data-hulao-live-embed', '')
            fallback.style.cssText = 'padding: 32px 16px;'
            document.body.appendChild(fallback)
            mountInline(config, fallback)
          } else {
            mountInline(config, marker)
          }
        } else {
          // floating-*
          mountFloating(config)
        }
      })
      .catch(function (err) {
        console.warn('[hulao-live-embed] gagal load config:', err)
      })
  }

  // Listen lead capture dari iframe — forward ke pixel global jika ada.
  window.addEventListener('message', function (ev) {
    if (!ev.data || typeof ev.data !== 'object') return
    if (ev.data.type === 'hulao-live:lead-captured') {
      // Meta Pixel
      try {
        if (typeof window.fbq === 'function') window.fbq('track', 'Lead')
      } catch (e) {/* ignore */}
      // GA4
      try {
        if (typeof window.gtag === 'function') {
          window.gtag('event', 'generate_lead', {
            event_category: 'hulao_live',
            event_label: 'embed_gate',
          })
        }
      } catch (e) {/* ignore */}
      // TikTok Pixel
      try {
        if (window.ttq && typeof window.ttq.track === 'function') {
          window.ttq.track('SubmitForm')
        }
      } catch (e) {/* ignore */}
    }
  })

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 0)
  } else {
    document.addEventListener('DOMContentLoaded', init)
  }
})()
