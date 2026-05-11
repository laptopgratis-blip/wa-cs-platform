'use client'

// InlineEditPopover — popover universal untuk Visual Editor.
// Sections (kondisional):
//   - Action bar (selalu): Move Up/Down, Duplicate, Cut, Delete + Paste here
//     (kalau clipboard aktif).
//   - Format toolbar (kalau text-bearing): Tag dropdown + B/I/U/Mark.
//   - Editor: contentEditable (text) atau image fields (src+alt).
//   - Link section (kalau anchor): WhatsApp / URL.
import {
  ArrowDown,
  ArrowUp,
  Bold,
  ClipboardPaste,
  Copy,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Save,
  Scissors,
  Target,
  Trash2,
  Underline,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  type EditableSnapshot,
  isSwappableTag,
  PIXEL_EVENT_PRESETS,
  type SwappableTag,
} from '@/lib/lp/html-mutation'
import { cn } from '@/lib/utils'

interface SelectedSnapshot extends EditableSnapshot {
  absRect: { top: number; left: number; width: number; height: number }
}

export type PopoverAction =
  | 'cut'
  | 'duplicate'
  | 'delete'
  | 'move-up'
  | 'move-down'
  | 'paste-before'
  | 'paste-after'

interface Props {
  snapshot: SelectedSnapshot
  clipboardActive: boolean
  onSubmit: (patch: {
    innerHtml?: string
    href?: string
    src?: string
    alt?: string
    newTag?: SwappableTag
    // Pixel: null = hapus, undefined = tidak diubah, string = set.
    pixelEvent?: string | null
    pixelValue?: string | null
    pixelCurrency?: string | null
  }) => void
  onAction: (action: PopoverAction) => void
  onClose: () => void
}

// Hint untuk masing-masing event ke awam — supaya user tahu kapan pakai mana.
const PIXEL_EVENT_HINTS: Record<string, string> = {
  ViewContent: 'Saat user lihat halaman/produk',
  Lead: 'Submit form / minat (kontak WA, dst)',
  Contact: 'Klik tombol kontak (WA/telpon/email)',
  InitiateCheckout: 'Mulai proses order/checkout',
  AddToCart: 'Tambah ke keranjang',
  Purchase: 'Order selesai/dibayar',
  CompleteRegistration: 'Daftar/signup berhasil',
}

// Currency umum untuk LP Indonesia + fallback international.
const CURRENCY_OPTIONS = ['IDR', 'USD', 'SGD', 'MYR', 'EUR'] as const

const POPOVER_WIDTH = 380
const POPOVER_OFFSET = 8

const TAG_LABEL: Record<SwappableTag, string> = {
  h1: 'Judul Besar (H1)',
  h2: 'Judul Sedang (H2)',
  h3: 'Sub-judul (H3)',
  h4: 'Sub-judul kecil (H4)',
  p: 'Paragraf',
}

function detectWaNumber(href: string | null): string | null {
  if (!href) return null
  const m1 = href.match(/wa\.me\/(\+?\d+)/i)
  if (m1) return m1[1].replace(/\D/g, '')
  const m2 = href.match(/api\.whatsapp\.com\/[^?]*\?[^=]*phone=(\+?\d+)/i)
  if (m2) return m2[1].replace(/\D/g, '')
  return null
}

function toggleWrapSelection(tagName: string, root: HTMLElement) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return

  let walker: Node | null = range.commonAncestorContainer
  while (walker && walker !== root) {
    if (
      walker.nodeType === Node.ELEMENT_NODE &&
      (walker as Element).tagName.toLowerCase() === tagName.toLowerCase()
    ) {
      const el = walker as Element
      const parent = el.parentNode
      if (parent) {
        while (el.firstChild) parent.insertBefore(el.firstChild, el)
        parent.removeChild(el)
      }
      return
    }
    walker = walker.parentNode
  }

  if (range.collapsed) return
  const wrapper = document.createElement(tagName)
  try {
    range.surroundContents(wrapper)
  } catch {
    wrapper.appendChild(range.extractContents())
    range.insertNode(wrapper)
  }
  sel.removeAllRanges()
}

export function InlineEditPopover({
  snapshot,
  clipboardActive,
  onSubmit,
  onAction,
  onClose,
}: Props) {
  const popRef = useRef<HTMLDivElement>(null)
  const editableRef = useRef<HTMLDivElement>(null)
  const isAnchor = snapshot.tagName === 'a'
  const isImage = snapshot.tagName === 'img'
  const swappable = isSwappableTag(snapshot.tagName)
  const isTextBearing = !isImage // img tidak punya inner text editor

  const initialWa = isAnchor ? detectWaNumber(snapshot.href) : null
  const isWaLink = initialWa !== null

  const [href, setHref] = useState(snapshot.href ?? '')
  const [waNumber, setWaNumber] = useState(initialWa ?? '')
  const [linkMode, setLinkMode] = useState<'wa' | 'url'>(isWaLink ? 'wa' : 'url')
  const [currentTag, setCurrentTag] = useState<SwappableTag | null>(
    swappable ? (snapshot.tagName as SwappableTag) : null,
  )
  const [imgSrc, setImgSrc] = useState(snapshot.src ?? '')
  const [imgAlt, setImgAlt] = useState(snapshot.alt ?? '')

  // Pixel tracking state — initial value dari attribute existing di elemen.
  // Empty string di event = "tidak track" (hapus attribute saat save).
  const [pixelEvent, setPixelEvent] = useState(snapshot.pixelEvent ?? '')
  const [pixelValue, setPixelValue] = useState(snapshot.pixelValue ?? '')
  const [pixelCurrency, setPixelCurrency] = useState(
    snapshot.pixelCurrency ?? 'IDR',
  )
  const [pixelOpen, setPixelOpen] = useState(
    Boolean(snapshot.pixelEvent && snapshot.pixelEvent.trim()),
  )

  const [pos, setPos] = useState<{ top: number; left: number; placement: 'below' | 'above' }>(
    () => ({
      top: snapshot.absRect.top + snapshot.absRect.height + POPOVER_OFFSET,
      left: snapshot.absRect.left,
      placement: 'below',
    }),
  )

  useEffect(() => {
    if (editableRef.current && isTextBearing) {
      editableRef.current.innerHTML = snapshot.innerHtml || snapshot.text || ''
    }
  }, [snapshot, isTextBearing])

  // Re-compute posisi popover. Dipanggil saat snapshot berubah DAN saat tinggi
  // popover berubah (mis. expand section "Tracking Pixel" yang menambah konten).
  // Tanpa re-compute, popover yang awalnya cukup di bawah element bisa jadi
  // overflow viewport setelah konten bertambah → bagian bawah ter-clip.
  const reposition = useCallback(() => {
    const popEl = popRef.current
    if (!popEl) return
    const popH = popEl.offsetHeight
    const vh = window.innerHeight
    const vw = window.innerWidth
    const r = snapshot.absRect
    const MARGIN = 16

    // Default: below element.
    let top = r.top + r.height + POPOVER_OFFSET
    let placement: 'below' | 'above' = 'below'

    // Coba flip ke above kalau bawah overflow & atas cukup space.
    if (top + popH > vh - 20 && r.top - popH - POPOVER_OFFSET > 20) {
      top = r.top - popH - POPOVER_OFFSET
      placement = 'above'
    }

    // Clamp top supaya popover tidak overflow viewport. Kalau popH lebih besar
    // dari viewport (mis. expand section bikin tinggi > vh), popover akan
    // scroll secara internal (lihat className body di JSX), bukan ter-clip.
    if (top + popH > vh - MARGIN) {
      top = Math.max(MARGIN, vh - MARGIN - popH)
    }
    if (top < MARGIN) top = MARGIN

    let left = r.left
    if (left + POPOVER_WIDTH > vw - MARGIN) left = vw - POPOVER_WIDTH - MARGIN
    if (left < MARGIN) left = MARGIN
    setPos({ top, left, placement })
  }, [snapshot])

  useLayoutEffect(() => {
    reposition()
  }, [reposition])

  // Re-position saat konten popover berubah ukurannya (mis. section expand,
  // dropdown render in-flow). ResizeObserver lebih reliable daripada manual
  // trigger di tiap onChange handler.
  useEffect(() => {
    const popEl = popRef.current
    if (!popEl || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => reposition())
    ro.observe(popEl)
    return () => ro.disconnect()
  }, [reposition])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const el = popRef.current
      if (!el) return
      const target = e.target as Element | null
      if (!target) return
      // Klik di dalam popover sendiri — abaikan.
      if (el.contains(target)) return
      // Klik di dalam Radix Select/Dropdown content yang di-render via Portal
      // ke document.body (di luar popover). Tanpa pengecualian ini, klik
      // <SelectItem> men-trigger onClose & popover tutup sebelum user sempat
      // klik tombol Simpan. Radix tambahkan wrapper [data-radix-popper-content-wrapper]
      // dan content ber-role="listbox" — kita exempt keduanya.
      if (
        target.closest('[data-radix-popper-content-wrapper]') ||
        target.closest('[role="listbox"]') ||
        target.closest('[role="dialog"]')
      ) {
        return
      }
      onClose()
    }
    const id = setTimeout(() => {
      window.addEventListener('mousedown', onClick)
    }, 50)
    return () => {
      clearTimeout(id)
      window.removeEventListener('mousedown', onClick)
    }
  }, [onClose])

  function buildHrefFromForm(): string {
    if (linkMode === 'wa') {
      const digits = waNumber.replace(/\D/g, '')
      return digits ? `https://wa.me/${digits}` : ''
    }
    return href.trim()
  }

  function handleFormat(tag: 'strong' | 'em' | 'u' | 'mark') {
    if (!editableRef.current) return
    toggleWrapSelection(tag, editableRef.current)
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(document.createTextNode(text))
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  function handleSubmit() {
    const patch: {
      innerHtml?: string
      href?: string
      src?: string
      alt?: string
      newTag?: SwappableTag
      pixelEvent?: string | null
      pixelValue?: string | null
      pixelCurrency?: string | null
    } = {}

    if (isTextBearing) {
      const newInner = editableRef.current?.innerHTML.trim() ?? ''
      const oldInner = (snapshot.innerHtml || snapshot.text || '').trim()
      if (newInner !== oldInner) patch.innerHtml = newInner
    }

    if (isAnchor) {
      const next = buildHrefFromForm()
      if (next && next !== (snapshot.href ?? '')) patch.href = next
    }

    if (isImage) {
      if (imgSrc.trim() !== (snapshot.src ?? '').trim()) patch.src = imgSrc.trim()
      if (imgAlt !== (snapshot.alt ?? '')) patch.alt = imgAlt
    }

    if (
      swappable &&
      currentTag &&
      currentTag !== (snapshot.tagName as SwappableTag)
    ) {
      patch.newTag = currentTag
    }

    // Pixel diff — kirim hanya kalau berubah dari snapshot.
    const evTrim = pixelEvent.trim()
    const vTrim = pixelValue.trim()
    const cTrim = pixelCurrency.trim()
    const oldEv = snapshot.pixelEvent ?? ''
    const oldV = snapshot.pixelValue ?? ''
    const oldC = snapshot.pixelCurrency ?? ''
    if (evTrim !== oldEv) {
      patch.pixelEvent = evTrim || null
    }
    if (vTrim !== oldV) {
      // Cuma kirim value kalau ada event aktif — supaya tidak orphan.
      patch.pixelValue = evTrim ? vTrim || null : null
    }
    if (cTrim !== oldC) {
      patch.pixelCurrency = evTrim ? cTrim || null : null
    }

    if (Object.keys(patch).length === 0) return onClose()
    onSubmit(patch)
  }

  return (
    <div
      ref={popRef}
      className="fixed z-50 flex max-h-[calc(100vh-32px)] flex-col rounded-lg border border-warm-300 bg-card shadow-xl"
      style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
      role="dialog"
      aria-label="Edit elemen"
    >
      {/* Header (sticky atas — selalu visible) */}
      <div className="flex shrink-0 items-center justify-between border-b border-warm-200 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-primary-50 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-primary-700">
            {snapshot.tagName}
          </span>
          <span className="text-[11px] text-warm-500">
            {isImage
              ? 'Gambar'
              : isAnchor
                ? 'Tombol / link'
                : 'Teks'}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="rounded p-1 text-warm-500 hover:bg-warm-100 hover:text-warm-900"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Body scrollable — semua section yang bisa expand masuk sini supaya
          kalau total tinggi > viewport, content scroll internal & footer tetap
          terlihat (tidak ter-clip di bawah). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">

      {/* Action bar — Move/Duplicate/Cut/Delete (selalu ada) */}
      <div
        className="flex shrink-0 items-center gap-0.5 border-b border-warm-200 bg-warm-50/30 px-2 py-1.5"
        onMouseDown={(e) => e.preventDefault()}
      >
        <ToolbarBtn
          label="Geser ke atas"
          onClick={() => onAction('move-up')}
          disabled={!snapshot.hasPrev}
        >
          <ArrowUp className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          label="Geser ke bawah"
          onClick={() => onAction('move-down')}
          disabled={!snapshot.hasNext}
        >
          <ArrowDown className="size-3.5" />
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-warm-200" aria-hidden />
        <ToolbarBtn
          label="Duplikat (gandakan)"
          onClick={() => onAction('duplicate')}
        >
          <Copy className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Potong (cut)" onClick={() => onAction('cut')}>
          <Scissors className="size-3.5" />
        </ToolbarBtn>
        <ToolbarBtn label="Hapus" onClick={() => onAction('delete')} danger>
          <Trash2 className="size-3.5" />
        </ToolbarBtn>

        {clipboardActive && (
          <div className="ml-auto flex items-center gap-0.5">
            <span className="hidden text-[10px] text-warm-500 sm:inline">
              Tempel:
            </span>
            <ToolbarBtn
              label="Tempel sebelum bagian ini"
              onClick={() => onAction('paste-before')}
              accent
            >
              <ClipboardPaste className="size-3.5 -scale-y-100" />
            </ToolbarBtn>
            <ToolbarBtn
              label="Tempel sesudah bagian ini"
              onClick={() => onAction('paste-after')}
              accent
            >
              <ClipboardPaste className="size-3.5" />
            </ToolbarBtn>
          </div>
        )}
      </div>

      {/* Format toolbar (hanya untuk text-bearing) */}
      {isTextBearing && (
        <div
          className="flex items-center gap-1 border-b border-warm-200 bg-warm-50/30 px-2 py-1.5"
          onMouseDown={(e) => e.preventDefault()}
        >
          {swappable && (
            <Select
              value={currentTag ?? undefined}
              onValueChange={(v) => setCurrentTag(v as SwappableTag)}
            >
              <SelectTrigger className="h-7 w-[145px] text-[11px]">
                <SelectValue placeholder="Ukuran" />
              </SelectTrigger>
              <SelectContent>
                {(['h1', 'h2', 'h3', 'h4', 'p'] as const).map((t) => (
                  <SelectItem key={t} value={t} className="text-xs">
                    {TAG_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="ml-auto flex items-center gap-0.5">
            <ToolbarBtn
              label="Bold (tebal)"
              onClick={() => handleFormat('strong')}
            >
              <Bold className="size-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              label="Italic (miring)"
              onClick={() => handleFormat('em')}
            >
              <Italic className="size-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              label="Underline (garis bawah)"
              onClick={() => handleFormat('u')}
            >
              <Underline className="size-3.5" />
            </ToolbarBtn>
            <ToolbarBtn
              label="Stabilo (highlight)"
              onClick={() => handleFormat('mark')}
              highlight
            >
              <Highlighter className="size-3.5" />
            </ToolbarBtn>
          </div>
        </div>
      )}

      {/* Editor area */}
      {isTextBearing ? (
        <div className="px-3 py-2">
          <Label className="text-[10px] text-warm-500">
            Teks · pilih bagian, lalu klik tombol di atas untuk format
          </Label>
          <div
            ref={editableRef}
            contentEditable
            suppressContentEditableWarning
            onPaste={handlePaste}
            className="mt-1 max-h-40 min-h-[60px] overflow-auto rounded-md border border-warm-200 bg-card px-2 py-1.5 text-xs text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-200 [&_mark]:bg-yellow-200 [&_mark]:px-0.5"
          />
        </div>
      ) : (
        <div className="space-y-2 px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded border border-warm-200 bg-warm-50">
              {imgSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgSrc}
                  alt={imgAlt}
                  className="size-full object-cover"
                />
              ) : (
                <ImageIcon className="size-6 text-warm-400" />
              )}
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="lp-img-src" className="text-[10px] text-warm-500">
                URL gambar
              </Label>
              <Input
                id="lp-img-src"
                value={imgSrc}
                onChange={(e) => setImgSrc(e.target.value)}
                placeholder="https://..."
                className="h-7 font-mono text-[11px]"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lp-img-alt" className="text-[10px] text-warm-500">
              Alt (deskripsi singkat — bagus untuk SEO)
            </Label>
            <Input
              id="lp-img-alt"
              value={imgAlt}
              onChange={(e) => setImgAlt(e.target.value)}
              placeholder="Gambar produk..."
              className="h-7 text-[11px]"
            />
          </div>
          <p className="text-[10px] text-warm-500">
            Tip: copy URL dari panel Image Manager di kiri, paste ke sini.
          </p>
        </div>
      )}

      {/* Link section (kalau anchor) */}
      {isAnchor && (
        <div className="space-y-1.5 border-t border-warm-200 px-3 py-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Tujuan link</Label>
            <div className="flex rounded-md border border-warm-200 bg-warm-50 p-0.5">
              <button
                type="button"
                onClick={() => setLinkMode('wa')}
                className={
                  linkMode === 'wa'
                    ? 'rounded bg-card px-2 py-0.5 text-[10px] font-semibold text-warm-900 shadow-sm'
                    : 'px-2 py-0.5 text-[10px] text-warm-500 hover:text-warm-900'
                }
              >
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setLinkMode('url')}
                className={
                  linkMode === 'url'
                    ? 'rounded bg-card px-2 py-0.5 text-[10px] font-semibold text-warm-900 shadow-sm'
                    : 'px-2 py-0.5 text-[10px] text-warm-500 hover:text-warm-900'
                }
              >
                URL
              </button>
            </div>
          </div>

          {linkMode === 'wa' ? (
            <div>
              <div className="flex items-stretch overflow-hidden rounded-md border border-warm-200">
                <span className="flex items-center bg-warm-50 px-2 text-xs text-warm-600">
                  +
                </span>
                <Input
                  placeholder="6281234567890"
                  value={waNumber}
                  onChange={(e) => setWaNumber(e.target.value.replace(/\D/g, ''))}
                  maxLength={15}
                  className="h-8 rounded-none border-0 font-mono text-xs focus-visible:ring-0"
                />
              </div>
              <p className="mt-1 text-[10px] text-warm-500">
                Format: 62 + nomor tanpa 0 di depan (mis. 6281234567890)
              </p>
            </div>
          ) : (
            <Input
              placeholder="https://contoh.com"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              className="h-8 text-xs"
            />
          )}
        </div>
      )}

      {/* Tracking Pixel section — collapse default, expand kalau sudah ada event */}
      <div className="border-t border-warm-200">
        <button
          type="button"
          onClick={() => setPixelOpen((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-warm-50"
          aria-expanded={pixelOpen}
        >
          <span className="flex items-center gap-1.5 text-xs font-medium text-warm-900">
            <Target className="size-3.5 text-primary-600" />
            Tracking Pixel
            {pixelEvent.trim() && (
              <span className="ml-1 rounded-full bg-primary-50 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-primary-700">
                {pixelEvent.trim()}
              </span>
            )}
          </span>
          <span className="text-[10px] text-warm-500">
            {pixelOpen ? 'Tutup' : 'Atur event'}
          </span>
        </button>
        {pixelOpen && (
          <div className="space-y-2 px-3 pb-3">
            <p className="text-[10px] leading-relaxed text-warm-500">
              Saat user klik elemen ini di LP live, event di-kirim ke pixel
              Meta/TikTok/Google Ads yang aktif di akun kamu. Kosongkan untuk
              non-aktifkan.
            </p>
            <div className="space-y-1">
              <Label className="text-[10px] text-warm-500">Event</Label>
              <Select
                value={pixelEvent || '__none'}
                onValueChange={(v) => setPixelEvent(v === '__none' ? '' : v)}
              >
                <SelectTrigger className="h-8 text-[11px]">
                  <SelectValue placeholder="Pilih event…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none" className="text-xs">
                    <span className="text-warm-500">Tidak track</span>
                  </SelectItem>
                  {PIXEL_EVENT_PRESETS.map((ev) => (
                    <SelectItem key={ev} value={ev} className="text-xs">
                      <span className="font-mono font-semibold">{ev}</span>
                      <span className="ml-2 text-[10px] text-warm-500">
                        {PIXEL_EVENT_HINTS[ev]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={pixelEvent}
                onChange={(e) => setPixelEvent(e.target.value)}
                placeholder="Atau ketik event custom (mis. ChatStarted)"
                className="h-7 font-mono text-[11px]"
              />
            </div>
            {pixelEvent.trim() && (
              <div className="grid grid-cols-[1fr_85px] gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-warm-500">
                    Nilai (opsional)
                  </Label>
                  <Input
                    value={pixelValue}
                    onChange={(e) =>
                      setPixelValue(e.target.value.replace(/[^\d.]/g, ''))
                    }
                    placeholder="100000"
                    inputMode="decimal"
                    className="h-7 font-mono text-[11px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-warm-500">Mata uang</Label>
                  <Select
                    value={pixelCurrency}
                    onValueChange={(v) => setPixelCurrency(v)}
                  >
                    <SelectTrigger className="h-7 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_OPTIONS.map((c) => (
                        <SelectItem key={c} value={c} className="text-xs">
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <p className="text-[10px] text-warm-500">
              Tip: pakai{' '}
              <span className="font-mono font-semibold">Lead</span> untuk tombol
              WA/form,{' '}
              <span className="font-mono font-semibold">InitiateCheckout</span>{' '}
              untuk tombol order,{' '}
              <span className="font-mono font-semibold">Purchase</span> di
              halaman success.
            </p>
          </div>
        )}
      </div>

      </div>{/* end scrollable body */}

      {/* Footer (sticky bawah — selalu visible walaupun body scroll) */}
      <div className="flex shrink-0 justify-end gap-1.5 border-t border-warm-200 bg-card px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
          Batal
        </Button>
        <Button
          size="sm"
          onClick={handleSubmit}
          className="h-7 bg-primary-500 text-xs text-white hover:bg-primary-600"
        >
          <Save className="mr-1 size-3" />
          Simpan
        </Button>
      </div>
    </div>
  )
}

function ToolbarBtn({
  label,
  onClick,
  children,
  danger,
  highlight,
  accent,
  disabled,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
  highlight?: boolean
  accent?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded transition',
        disabled && 'cursor-not-allowed opacity-30',
        !disabled &&
          (danger
            ? 'text-destructive hover:bg-red-50'
            : highlight
              ? 'text-amber-600 hover:bg-amber-50'
              : accent
                ? 'text-primary-600 hover:bg-primary-50'
                : 'text-warm-700 hover:bg-warm-100'),
      )}
    >
      {children}
    </button>
  )
}
