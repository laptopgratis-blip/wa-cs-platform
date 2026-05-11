'use client'

// VisualEditor — preview iframe + inline edit click handler.
// User klik elemen di preview → script di iframe kirim postMessage ke parent
// dengan editIndex + bounding rect → parent render InlineEditPopover.
// Edit form submit → parent mutate htmlContent string → iframe re-render.
//
// Tagged HTML: htmlContent ter-`data-lp-edit` index supaya iframe & parent
// punya identifikasi konsisten untuk setiap elemen editable.
import { Eye, Info, RotateCw, Scissors, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { InlineEditPopover, type PopoverAction } from '@/components/lp/InlineEditPopover'
import {
  changeElementTag,
  deleteElement,
  duplicateElement,
  type EditableSnapshot,
  getElementOuterHtml,
  moveElement,
  moveElementTo,
  pasteElement,
  setElementPixel,
  type SwappableTag,
  tagEditableElements,
  updateElement,
} from '@/lib/lp/html-mutation'
import { cn } from '@/lib/utils'
import type { Viewport } from '@/components/lp/EditorTopbar'

const DEBOUNCE_MS = 600
const IFRAME_SANDBOX =
  'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms'

interface Props {
  htmlContent: string
  viewport: Viewport
  onChange: (next: string) => void
}

// Script yang di-inject ke setiap iframe load. Gunakan IIFE & jaga supaya
// idempotent — load multiple times tidak duplikat handler.
function injectedClickScript(): string {
  // Gunakan template literal di luar React supaya tidak ke-escape.
  // CATATAN: kode dalam string ini dieksekusi di iframe dengan sandbox.
  return `
(function () {
  if (window.__lpEditorWired) return;
  window.__lpEditorWired = true;
  var EDIT_ATTR = 'data-lp-edit';
  var lastHover = null;
  var dragSource = null;
  var lastDropTarget = null;
  var lastDropPosition = null;

  function findEditable(el) {
    while (el && el !== document.body) {
      if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute(EDIT_ATTR)) return el;
      el = el.parentNode;
    }
    return null;
  }

  function clearHover() {
    if (lastHover) {
      lastHover.style.removeProperty('outline');
      lastHover.style.removeProperty('outline-offset');
      lastHover.style.removeProperty('cursor');
      lastHover = null;
    }
  }

  function clearDropIndicator() {
    if (lastDropTarget) {
      lastDropTarget.style.removeProperty('box-shadow');
      lastDropTarget = null;
      lastDropPosition = null;
    }
  }

  document.addEventListener('mouseover', function (e) {
    var t = findEditable(e.target);
    if (t === lastHover) return;
    clearHover();
    if (t) {
      t.style.setProperty('outline', '2px dashed #f97316', 'important');
      t.style.setProperty('outline-offset', '2px', 'important');
      t.style.setProperty('cursor', 'grab', 'important');
      // Pastikan elemen draggable. Kalau elemen <img>, draggable default true
      // tapi kita perlu pastikan event handler dipasang di document.
      if (t.getAttribute('draggable') !== 'true') {
        t.setAttribute('draggable', 'true');
      }
      lastHover = t;
    }
  }, true);

  document.addEventListener('mouseout', function (e) {
    if (!e.relatedTarget) clearHover();
  }, true);

  // Cegah link beneran di-klik & form submit saat mode edit.
  document.addEventListener('click', function (e) {
    var t = findEditable(e.target);
    if (!t) return;
    // Kalau baru drop, jangan trigger popover (browser kadang fire click setelah drag).
    if (dragSource !== null) return;
    e.preventDefault();
    e.stopPropagation();
    var rect = t.getBoundingClientRect();
    var href = t.getAttribute('href');
    var src = t.getAttribute('src');
    var alt = t.getAttribute('alt');
    var pixelEvent = t.getAttribute('data-pixel-event');
    var pixelValue = t.getAttribute('data-pixel-value');
    var pixelCurrency = t.getAttribute('data-pixel-currency');
    var idxStr = t.getAttribute(EDIT_ATTR);
    var hasPrev = !!t.previousElementSibling;
    var hasNext = !!t.nextElementSibling;
    var clone = t.cloneNode(true);
    var taggedDescendants = clone.querySelectorAll('[' + EDIT_ATTR + ']');
    taggedDescendants.forEach(function (el) { el.removeAttribute(EDIT_ATTR); });
    clone.removeAttribute(EDIT_ATTR);
    parent.postMessage({
      __lpEditor: true,
      type: 'click',
      payload: {
        editIndex: parseInt(idxStr || '-1', 10),
        tagName: t.tagName.toLowerCase(),
        text: (t.textContent || '').trim(),
        innerHtml: clone.innerHTML,
        href: href,
        src: src,
        alt: alt,
        hasPrev: hasPrev,
        hasNext: hasNext,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        pixelEvent: pixelEvent,
        pixelValue: pixelValue,
        pixelCurrency: pixelCurrency
      }
    }, '*');
  }, true);

  // Klik di area kosong → tutup popover.
  document.addEventListener('click', function (e) {
    if (findEditable(e.target)) return;
    parent.postMessage({ __lpEditor: true, type: 'dismiss' }, '*');
  });

  // Notify parent saat scroll supaya popover bisa update posisi atau hilang.
  document.addEventListener('scroll', function () {
    parent.postMessage({ __lpEditor: true, type: 'scroll' }, '*');
  }, true);

  // ── Drag & drop reorder ──
  // Native HTML5 drag — elemen punya draggable=true via mouseover handler.
  // dragstart simpan source index, dragover tentukan posisi (atas/bawah)
  // relatif terhadap target, drop kirim postMessage ke parent.
  document.addEventListener('dragstart', function (e) {
    var t = findEditable(e.target);
    if (!t) return;
    var idxStr = t.getAttribute(EDIT_ATTR);
    if (!idxStr) return;
    dragSource = parseInt(idxStr, 10);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      // Firefox butuh setData supaya drag jalan.
      try { e.dataTransfer.setData('text/plain', idxStr); } catch (_err) {}
    }
    t.style.setProperty('opacity', '0.5', 'important');
    // Tutup popover supaya tidak menghalangi gesture.
    parent.postMessage({ __lpEditor: true, type: 'dismiss' }, '*');
  }, true);

  document.addEventListener('dragover', function (e) {
    if (dragSource === null) return;
    var t = findEditable(e.target);
    if (!t) return;
    var idxStr = t.getAttribute(EDIT_ATTR);
    if (!idxStr) return;
    var targetIdx = parseInt(idxStr, 10);
    if (targetIdx === dragSource) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    var rect = t.getBoundingClientRect();
    var position = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
    if (lastDropTarget !== t || lastDropPosition !== position) {
      if (lastDropTarget) lastDropTarget.style.removeProperty('box-shadow');
      var shadow = position === 'before'
        ? 'inset 0 4px 0 0 #2563eb'
        : 'inset 0 -4px 0 0 #2563eb';
      t.style.setProperty('box-shadow', shadow, 'important');
      lastDropTarget = t;
      lastDropPosition = position;
    }
  }, true);

  document.addEventListener('dragleave', function (e) {
    // Hapus indicator kalau cursor keluar dari area target (related null = leave iframe).
    if (!e.relatedTarget) clearDropIndicator();
  }, true);

  document.addEventListener('drop', function (e) {
    if (dragSource === null) return;
    var t = findEditable(e.target);
    if (!t) { clearDropIndicator(); return; }
    var idxStr = t.getAttribute(EDIT_ATTR);
    if (!idxStr) { clearDropIndicator(); return; }
    var targetIdx = parseInt(idxStr, 10);
    if (targetIdx === dragSource) { clearDropIndicator(); return; }
    e.preventDefault();
    var rect = t.getBoundingClientRect();
    var position = (e.clientY - rect.top) < rect.height / 2 ? 'before' : 'after';
    parent.postMessage({
      __lpEditor: true,
      type: 'reorder',
      payload: { from: dragSource, to: targetIdx, position: position }
    }, '*');
    clearDropIndicator();
  }, true);

  document.addEventListener('dragend', function (e) {
    var t = findEditable(e.target);
    if (t) t.style.removeProperty('opacity');
    clearDropIndicator();
    // Reset di tick berikutnya supaya click handler (yang mungkin fire setelah drop)
    // tahu kita baru saja drag — guard click trigger popover yang tidak diinginkan.
    setTimeout(function () { dragSource = null; }, 0);
  }, true);
})();
`.trim()
}

// Wrap raw HTML — inject base style untuk hover outline & click script.
// Asumsi htmlContent SUDAH ditag (data-lp-edit).
function wrapForIframe(taggedHtml: string): string {
  const script = `<script>${injectedClickScript()}</script>`
  // Kalau ada </body>, sisip sebelum penutup. Kalau tidak, append di akhir.
  if (/<\/body>/i.test(taggedHtml)) {
    return taggedHtml.replace(/<\/body>/i, `${script}</body>`)
  }
  return taggedHtml + script
}

export function VisualEditor({ htmlContent, viewport, onChange }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [debouncedHtml, setDebouncedHtml] = useState(htmlContent)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selected, setSelected] = useState<
    (EditableSnapshot & { absRect: { top: number; left: number; width: number; height: number } })
    | null
  >(null)
  // Clipboard untuk fitur Cut → Paste antar elemen.
  const [clipboard, setClipboard] = useState<string | null>(null)

  // Debounce update srcDoc — supaya iframe tidak re-mount setiap keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedHtml(htmlContent), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [htmlContent])

  // Tag HTML once & wrap dengan injected script. Memoized supaya tidak re-tag
  // setiap render parent (cuma saat htmlContent berubah).
  const iframeSrcDoc = useMemo(() => {
    const tagged = tagEditableElements(debouncedHtml)
    return wrapForIframe(tagged)
  }, [debouncedHtml])

  // Listen postMessage dari iframe.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data
      if (!data || typeof data !== 'object' || !data.__lpEditor) return
      if (e.source !== iframeRef.current?.contentWindow) return
      if (data.type === 'click') {
        const p = data.payload as EditableSnapshot
        // Convert iframe-relative rect ke parent-absolute rect untuk popover.
        const iframeRect = iframeRef.current?.getBoundingClientRect()
        if (!iframeRect) return
        setSelected({
          ...p,
          absRect: {
            top: p.rect.top + iframeRect.top,
            left: p.rect.left + iframeRect.left,
            width: p.rect.width,
            height: p.rect.height,
          },
        })
      } else if (data.type === 'reorder') {
        const p = data.payload as {
          from: number
          to: number
          position: 'before' | 'after'
        }
        const next = moveElementTo(htmlContent, p.from, p.to, p.position)
        if (next !== htmlContent) onChange(next)
        setSelected(null)
      } else if (data.type === 'dismiss' || data.type === 'scroll') {
        setSelected(null)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [htmlContent, onChange])

  // Saat htmlContent berubah dari luar (mis. AI generate), close popover.
  useEffect(() => {
    setSelected(null)
  }, [htmlContent])

  function handleSubmit(patch: {
    innerHtml?: string
    href?: string
    src?: string
    alt?: string
    newTag?: SwappableTag
    // Pixel tracking: `null` artinya hapus attribute, `undefined` artinya tidak
    // diubah. Empty string juga di-treat sebagai hapus.
    pixelEvent?: string | null
    pixelValue?: string | null
    pixelCurrency?: string | null
  }) {
    if (!selected) return
    let next = htmlContent

    // Apply attribute/inner update dulu, lalu changeTag.
    if (
      patch.innerHtml !== undefined ||
      patch.href !== undefined ||
      patch.src !== undefined ||
      patch.alt !== undefined
    ) {
      next = updateElement(next, selected.editIndex, {
        innerHtml: patch.innerHtml,
        href: patch.href,
        src: patch.src,
        alt: patch.alt,
      })
    }

    if (patch.newTag) {
      next = changeElementTag(next, selected.editIndex, patch.newTag)
    }

    if (
      patch.pixelEvent !== undefined ||
      patch.pixelValue !== undefined ||
      patch.pixelCurrency !== undefined
    ) {
      next = setElementPixel(next, selected.editIndex, {
        event: patch.pixelEvent,
        value: patch.pixelValue,
        currency: patch.pixelCurrency,
      })
    }

    onChange(next)
    setSelected(null)
  }

  function handleAction(action: PopoverAction) {
    if (!selected) return
    const idx = selected.editIndex
    let next = htmlContent

    switch (action) {
      case 'move-up':
        next = moveElement(next, idx, 'up')
        break
      case 'move-down':
        next = moveElement(next, idx, 'down')
        break
      case 'duplicate':
        next = duplicateElement(next, idx)
        break
      case 'cut': {
        const outer = getElementOuterHtml(next, idx)
        if (!outer) return
        setClipboard(outer)
        next = deleteElement(next, idx)
        break
      }
      case 'delete':
        if (!window.confirm('Yakin hapus bagian ini?')) return
        next = deleteElement(next, idx)
        break
      case 'paste-before':
        if (!clipboard) return
        next = pasteElement(next, idx, clipboard, 'before')
        setClipboard(null)
        break
      case 'paste-after':
        if (!clipboard) return
        next = pasteElement(next, idx, clipboard, 'after')
        setClipboard(null)
        break
    }

    onChange(next)
    setSelected(null)
  }

  function handleRefresh() {
    setRefreshKey((k) => k + 1)
    setSelected(null)
  }

  const isMobile = viewport === 'mobile'

  return (
    <div className="flex h-full min-h-0 flex-col" ref={containerRef}>
      <div className="flex items-center justify-between border-b border-warm-200 bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-warm-600" />
          <span className="font-display text-sm font-bold text-warm-900">
            Edit Visual
          </span>
          <span className="hidden items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 sm:flex">
            <Info className="size-3" />
            Klik untuk ubah · drag untuk pindah urutan
          </span>
          <span className="text-[10px] text-warm-500">
            {isMobile ? 'Mobile · 375px' : 'Desktop · 100%'}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleRefresh}
          className="h-7 text-xs"
          title="Refresh preview"
        >
          <RotateCw className="mr-1.5 size-3" />
          Refresh
        </Button>
      </div>

      {clipboard && (
        <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
          <Scissors className="size-3.5 shrink-0" />
          <span className="flex-1">
            Bagian sudah dipotong. Klik elemen di preview → tombol{' '}
            <span className="rounded bg-amber-100 px-1 font-mono">📋 Tempel</span>{' '}
            akan muncul di popover.
          </span>
          <button
            type="button"
            onClick={() => setClipboard(null)}
            className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium hover:bg-amber-100"
          >
            <X className="size-3" />
            Batal
          </button>
        </div>
      )}

      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-auto bg-warm-100/40 p-4',
          isMobile && 'flex justify-center',
        )}
      >
        <div
          className={cn(
            'h-full overflow-hidden rounded-md border border-warm-200 bg-card shadow-sm',
            isMobile ? 'w-[375px] flex-shrink-0' : 'w-full',
          )}
        >
          {debouncedHtml.trim() ? (
            <iframe
              key={refreshKey}
              ref={iframeRef}
              title="Visual editor preview"
              srcDoc={iframeSrcDoc}
              sandbox={IFRAME_SANDBOX}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-warm-500">
              Belum ada konten — generate HTML pakai AI di atas, atau pindah ke
              tab Lanjutan untuk paste HTML manual.
            </div>
          )}
        </div>
      </div>

      {selected && (
        <InlineEditPopover
          snapshot={selected}
          clipboardActive={clipboard !== null}
          onSubmit={handleSubmit}
          onAction={handleAction}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
