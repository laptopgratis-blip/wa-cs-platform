'use client'

// LivePreview — render HTML editor langsung ke iframe via srcDoc.
// Debounce 800ms supaya iframe tidak rerender setiap keystroke (mahal).
// Toggle viewport di-pass dari shell (state ada di topbar).
//
// Tambahan: klik elemen di preview kirim postMessage ke parent supaya HtmlEditor
// bisa highlight range tag tersebut (mirip Chrome DevTools inspect element).
import { Eye, RotateCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { tagEditableElements } from '@/lib/lp/html-mutation'
import { cn } from '@/lib/utils'
import type { Viewport } from '@/components/lp/EditorTopbar'

const DEBOUNCE_MS = 800
// Sandbox iframe — jalankan script & style halaman LP, tapi blokir top-navigation
// & form submit ke parent. allow-popups untuk wa.me link buka tab baru.
const IFRAME_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms'

interface Props {
  htmlContent: string
  viewport: Viewport
  // Klik elemen di preview → kirim editIndex ke parent. Optional supaya komponen
  // tetap bisa dipakai tanpa interaksi (mis. di tempat read-only).
  onElementClick?: (editIndex: number) => void
}

// Script ringan untuk deteksi klik & hover — kirim editIndex ke parent.
// Lebih simple dari injected script VisualEditor: tidak ada drag/popover,
// cuma highlight hover + report click.
function injectedInspectScript(): string {
  return `
(function () {
  if (window.__lpInspectWired) return;
  window.__lpInspectWired = true;
  var EDIT_ATTR = 'data-lp-edit';
  var lastHover = null;
  var lastSelected = null;

  function findEditable(el) {
    while (el && el !== document.body) {
      if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute(EDIT_ATTR)) return el;
      el = el.parentNode;
    }
    return null;
  }

  function clearHover() {
    if (lastHover && lastHover !== lastSelected) {
      lastHover.style.removeProperty('outline');
      lastHover.style.removeProperty('outline-offset');
    }
    lastHover = null;
  }

  document.addEventListener('mouseover', function (e) {
    var t = findEditable(e.target);
    if (t === lastHover) return;
    clearHover();
    if (t && t !== lastSelected) {
      t.style.setProperty('outline', '1.5px dashed #2563eb', 'important');
      t.style.setProperty('outline-offset', '2px', 'important');
      t.style.setProperty('cursor', 'pointer', 'important');
      lastHover = t;
    }
  }, true);

  document.addEventListener('mouseout', function (e) {
    if (!e.relatedTarget) clearHover();
  }, true);

  document.addEventListener('click', function (e) {
    var t = findEditable(e.target);
    if (!t) {
      // Klik di luar editable → clear selection.
      if (lastSelected) {
        lastSelected.style.removeProperty('outline');
        lastSelected.style.removeProperty('outline-offset');
        lastSelected = null;
      }
      parent.postMessage({ __lpInspect: true, type: 'dismiss' }, '*');
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    // Pindah selection outline.
    if (lastSelected && lastSelected !== t) {
      lastSelected.style.removeProperty('outline');
      lastSelected.style.removeProperty('outline-offset');
    }
    t.style.setProperty('outline', '2px solid #2563eb', 'important');
    t.style.setProperty('outline-offset', '2px', 'important');
    lastSelected = t;
    // Mencegah hover-clear menghapus outline elemen yang dipilih.
    if (lastHover === t) lastHover = null;
    var idxStr = t.getAttribute(EDIT_ATTR);
    var editIndex = parseInt(idxStr || '-1', 10);
    parent.postMessage({
      __lpInspect: true,
      type: 'click',
      payload: { editIndex: editIndex, tagName: t.tagName.toLowerCase() }
    }, '*');
  }, true);
})();
`.trim()
}

function wrapForIframe(taggedHtml: string): string {
  const script = `<script>${injectedInspectScript()}</script>`
  if (/<\/body>/i.test(taggedHtml)) {
    return taggedHtml.replace(/<\/body>/i, `${script}</body>`)
  }
  return taggedHtml + script
}

export function LivePreview({ htmlContent, viewport, onElementClick }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [debouncedHtml, setDebouncedHtml] = useState(htmlContent)
  // refreshKey — naikkan untuk force iframe remount saat user klik refresh.
  const [refreshKey, setRefreshKey] = useState(0)

  // Debounce update ke iframe.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedHtml(htmlContent), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [htmlContent])

  // Tag HTML supaya tiap elemen editable dapat data-lp-edit index — ini yang
  // jadi handshake ke HtmlEditor untuk highlight posisi tag.
  const iframeSrcDoc = useMemo(() => {
    if (!debouncedHtml.trim()) return ''
    const tagged = tagEditableElements(debouncedHtml)
    return wrapForIframe(tagged)
  }, [debouncedHtml])

  // Listen postMessage dari iframe.
  useEffect(() => {
    if (!onElementClick) return
    function onMessage(e: MessageEvent) {
      const data = e.data
      if (!data || typeof data !== 'object' || !data.__lpInspect) return
      if (e.source !== iframeRef.current?.contentWindow) return
      if (data.type === 'click') {
        const p = data.payload as { editIndex: number }
        if (typeof p?.editIndex === 'number' && p.editIndex >= 0) {
          onElementClick?.(p.editIndex)
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onElementClick])

  const isMobile = viewport === 'mobile'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-warm-200 bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-warm-600" />
          <span className="font-display text-sm font-bold text-warm-900">
            Preview
          </span>
          <span className="hidden text-[10px] text-warm-500 sm:inline">
            Klik bagian untuk lompat ke posisinya di HTML
          </span>
          <span className="text-[10px] text-warm-500">
            {isMobile ? 'Mobile · 375px' : 'Desktop · 100%'}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="h-7 text-xs"
          title="Refresh preview"
        >
          <RotateCw className="mr-1.5 size-3" />
          Refresh
        </Button>
      </div>

      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-auto p-4',
          isMobile && 'flex justify-center',
        )}
      >
        {/* Watermark "Preview" tipis di pojok kanan atas */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-6 top-6 z-10 select-none rounded-md bg-warm-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur-sm"
        >
          Preview
        </div>

        <div
          className={cn(
            'h-full overflow-hidden rounded-md border border-warm-200 bg-card shadow-sm',
            isMobile ? 'w-[375px] flex-shrink-0' : 'w-full',
          )}
        >
          {iframeSrcDoc ? (
            <iframe
              key={refreshKey}
              ref={iframeRef}
              title="Live preview LP"
              srcDoc={iframeSrcDoc}
              sandbox={IFRAME_SANDBOX}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-warm-500">
              Preview kosong — generate HTML pakai AI atau ketik HTML di
              editor.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
