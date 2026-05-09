/* eslint-disable */
/*
 * Hulao LP Tracker — vanilla JS, no deps. Inject di public LP route /p/<slug>.
 *
 * Tugasnya: ngumpulin event engagement di browser visitor → batch kirim ke
 * /api/lp/events. Server pakai data ini untuk analytics dashboard + AI
 * optimization context.
 *
 * Privacy:
 * - TIDAK record value field input apapun.
 * - TIDAK record full mouse path; cuma click coordinates (untuk heatmap nanti).
 * - IP di-hash di server, browser tidak send IP raw.
 *
 * Performance:
 * - Listener debounced (scroll 200ms, click immediate, time milestone setInterval 30s).
 * - Batch flush via setInterval 5s + sendBeacon saat unload.
 * - Total <3KB minified.
 */
(function () {
  if (typeof window === 'undefined' || !document) return;
  // Idempotent — kalau script ke-inject 2x, skip.
  if (window.__hulaoLpTracker) return;
  window.__hulaoLpTracker = true;

  // Config dari script tag attribute. Format: <script data-lp="<lpId>" src="..."></script>
  var script = document.currentScript;
  if (!script) {
    // Fallback: cari script tag dgn data-lp.
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      if (scripts[i].getAttribute('data-lp')) {
        script = scripts[i];
        break;
      }
    }
  }
  if (!script) return;
  var lpId = script.getAttribute('data-lp');
  if (!lpId) return;

  var ENDPOINT = '/api/lp/events';
  var FLUSH_INTERVAL_MS = 5000;
  var TIME_MILESTONES_SEC = [30, 60, 120, 300]; // 30s, 1m, 2m, 5m
  var SCROLL_MILESTONES = [25, 50, 75, 100];
  var MAX_QUEUE_SIZE = 30; // safety cap supaya satu visit tidak spam server

  var queue = [];
  var startedAt = Date.now();
  var maxScroll = 0;
  var firedScrollMs = {}; // milestone -> true
  var firedTimeMs = {}; // milestone -> true
  var pageviewSent = false;

  // ── Helpers ─────────────────────────────────────────────────────────────
  function now() { return Date.now(); }
  function sec() { return Math.floor((now() - startedAt) / 1000); }

  function pushEvent(type, value, extra) {
    if (queue.length >= MAX_QUEUE_SIZE) return; // drop, jangan crash
    var ev = {
      t: type,
      v: value || null,
      sp: typeof extra === 'object' && extra && extra.sp != null ? extra.sp : maxScroll,
      ts: sec(),
    };
    // Heatmap coords — kalau extra punya cx/cy (click position), attach.
    // Server akan bin ke 100×100 grid relative to page width/height.
    if (extra && extra.cx != null && extra.cy != null) {
      ev.cx = extra.cx;
      ev.cy = extra.cy;
      ev.pw = extra.pw || 0;
      ev.ph = extra.ph || 0;
    }
    queue.push(ev);
  }

  function flush(viaBeacon) {
    if (queue.length === 0) return;
    var batch = queue.splice(0, queue.length);
    var body = JSON.stringify({
      lpId: lpId,
      events: batch,
      // Kirim UTM dari URL sekali — server attach ke LpVisit terkait.
      utm: extractUtm(),
    });
    try {
      if (viaBeacon && navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon(ENDPOINT, blob);
      } else {
        // keepalive supaya request lanjut walaupun page navigate.
        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true,
          credentials: 'omit',
        }).catch(function () { /* swallow */ });
      }
    } catch (_e) { /* swallow */ }
  }

  function extractUtm() {
    try {
      var p = new URLSearchParams(window.location.search);
      var src = p.get('utm_source');
      var med = p.get('utm_medium');
      var camp = p.get('utm_campaign');
      if (!src && !med && !camp) return null;
      return { source: src || null, medium: med || null, campaign: camp || null };
    } catch (_e) { return null; }
  }

  // ── Scroll tracking ─────────────────────────────────────────────────────
  function getScrollPct() {
    var scrollY = window.scrollY || window.pageYOffset || 0;
    var docH = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    );
    var winH = window.innerHeight || document.documentElement.clientHeight || 0;
    var scrollable = docH - winH;
    if (scrollable <= 0) return 100; // page tidak scrollable = 100% terlihat
    var pct = Math.min(100, Math.max(0, Math.round(((scrollY + winH) / docH) * 100)));
    return pct;
  }

  var scrollTimer = null;
  function onScroll() {
    if (scrollTimer) return;
    scrollTimer = setTimeout(function () {
      scrollTimer = null;
      var pct = getScrollPct();
      if (pct > maxScroll) maxScroll = pct;
      for (var i = 0; i < SCROLL_MILESTONES.length; i++) {
        var m = SCROLL_MILESTONES[i];
        if (pct >= m && !firedScrollMs[m]) {
          firedScrollMs[m] = true;
          pushEvent('scroll_' + m, null);
        }
      }
    }, 200);
  }

  // ── Click tracking ──────────────────────────────────────────────────────
  // Detect CTA button: data-lp-cta attribute, atau button/link yg point ke
  // wa.me/anchor #order/external. Best-effort heuristic.
  function classifyClick(target) {
    if (!target) return null;
    var el = target;
    // Walk up max 5 levels untuk handle child element click (mis. <span> di dlm <a>).
    for (var depth = 0; el && depth < 5; depth++) {
      if (el.getAttribute) {
        var explicitCta = el.getAttribute('data-lp-cta');
        if (explicitCta != null) {
          return { type: 'cta_click', label: explicitCta || textOf(el) || 'cta' };
        }
      }
      var tag = (el.tagName || '').toUpperCase();
      if (tag === 'A') {
        var href = el.getAttribute('href') || '';
        var label = textOf(el);
        if (/^https?:\/\/wa\.me\//i.test(href) || /^https?:\/\/api\.whatsapp\.com\//i.test(href)) {
          return { type: 'cta_click', label: 'whatsapp:' + (label || 'wa') };
        }
        if (/^mailto:/i.test(href)) {
          return { type: 'outbound_click', label: 'email' };
        }
        if (/^tel:/i.test(href)) {
          return { type: 'cta_click', label: 'phone:' + (label || 'tel') };
        }
        if (href.charAt(0) === '#') {
          // Anchor ke section di same page — biasanya CTA scroll-to-form.
          return { type: 'cta_click', label: 'anchor:' + href.slice(0, 40) };
        }
        if (/^https?:\/\//i.test(href)) {
          var host = '';
          try { host = new URL(href).hostname; } catch (_e) { host = ''; }
          if (host && host !== window.location.hostname) {
            return { type: 'outbound_click', label: host };
          }
        }
      }
      if (tag === 'BUTTON') {
        return { type: 'cta_click', label: textOf(el) || 'button' };
      }
      el = el.parentNode;
    }
    return null;
  }

  function textOf(el) {
    var t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.slice(0, 60);
  }

  function onClick(ev) {
    // Capture click position untuk heatmap (semua click, bukan cuma CTA).
    // Coordinates: pageX/pageY relative to full document (termasuk scroll).
    // pw/ph = total document dimensions saat klik.
    var pageW = Math.max(
      document.documentElement ? document.documentElement.scrollWidth : 0,
      document.body ? document.body.scrollWidth : 0,
      window.innerWidth || 0
    );
    var pageH = Math.max(
      document.documentElement ? document.documentElement.scrollHeight : 0,
      document.body ? document.body.scrollHeight : 0,
      window.innerHeight || 0
    );
    var coords = {
      cx: typeof ev.pageX === 'number' ? ev.pageX : ev.clientX,
      cy: typeof ev.pageY === 'number' ? ev.pageY : ev.clientY,
      pw: pageW,
      ph: pageH,
    };

    // Kirim 1 event saja per klik supaya tidak double-bin di heatmap.
    // - Kalau klik di CTA/outbound → event type spesifik dgn coords.
    // - Kalau klik random (text, image, area kosong) → event type 'click_pos'
    //   (generic, hanya untuk heatmap).
    // Server akan bin semua event yg punya cx/cy ke LpHeatmapBin tanpa
    // mempedulikan event type → semua klik kontribusi ke heatmap.
    var info = classifyClick(ev.target);
    if (info) {
      pushEvent(info.type, info.label, coords);
    } else {
      pushEvent('click_pos', null, coords);
    }
  }

  // ── Form submit ─────────────────────────────────────────────────────────
  function onSubmit(ev) {
    var f = ev.target;
    var label = (f && f.action) ? (function () {
      try { return new URL(f.action).pathname.slice(0, 80); } catch (_e) { return 'form'; }
    })() : 'form_inline';
    pushEvent('form_submit', label);
    // Form submit = high-intent → flush immediate supaya data tidak hilang
    // kalau user navigate.
    setTimeout(function () { flush(false); }, 50);
  }

  // ── Time milestone ──────────────────────────────────────────────────────
  function checkTimeMilestone() {
    var s = sec();
    for (var i = 0; i < TIME_MILESTONES_SEC.length; i++) {
      var m = TIME_MILESTONES_SEC[i];
      if (s >= m && !firedTimeMs[m]) {
        firedTimeMs[m] = true;
        pushEvent('time_milestone', String(m));
      }
    }
  }

  // ── Unload — kirim summary final ────────────────────────────────────────
  function onUnload() {
    pushEvent('page_unload', String(sec()));
    flush(true);
  }

  // ── Visibility change — flush saat user switch tab ──────────────────────
  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      flush(true);
    }
  }

  // ── Boot ────────────────────────────────────────────────────────────────
  function boot() {
    if (pageviewSent) return;
    pageviewSent = true;

    // Pageview event — server skip insert duplicate (LpVisit sudah dibuat di
    // /p/<slug>), tapi event ini menandakan tracker boot OK + kirim UTM.
    pushEvent('pageview', null);
    // Initial scroll check (kalau page short, langsung 100%).
    onScroll();

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onClick, { passive: true, capture: true });
    document.addEventListener('submit', onSubmit, { capture: true });
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    document.addEventListener('visibilitychange', onVisibility);

    setInterval(flush, FLUSH_INTERVAL_MS);
    setInterval(checkTimeMilestone, 5000);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(boot, 0);
  } else {
    document.addEventListener('DOMContentLoaded', boot);
  }
})();
