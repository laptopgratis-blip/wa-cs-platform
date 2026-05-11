// Utilities untuk Visual Editor LP — tag editable elements, mutate text/href,
// extract & replace warna. Semua fungsi client-side (pakai DOMParser global).
//
// Strategi tagging: walk DOM in deterministic order, assign nomor `data-lp-edit`
// ke setiap elemen editable. Iframe pakai HTML yang sudah ter-tag; saat user
// klik, kirim nomor; parent re-tag htmlContent dengan urutan yang sama → modify
// → strip tag → simpan.

const EDITABLE_SELECTORS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'a',
  'button',
  'li',
  'span',
  'img',
]

const EDIT_ATTR = 'data-lp-edit'

// Predicate: elemen ini layak ditag sebagai editable?
// Hindari elemen yang sudah punya child editable lain (mis. <p> berisi <a>) —
// kita prefer tag yang paling spesifik (leaf-like). Tetap tag wrapper tapi
// klik handler di iframe akan pilih yg terdalam via event.target.
function isEditableTag(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  return EDITABLE_SELECTORS.includes(tag)
}

// Tag semua elemen editable di DOM dengan nomor urut.
// Mutates in-place; return jumlah elemen yang ditag.
function tagElementsInDoc(doc: Document): number {
  let counter = 0
  const all = doc.body?.querySelectorAll('*')
  if (!all) return 0
  for (const el of Array.from(all)) {
    if (isEditableTag(el)) {
      el.setAttribute(EDIT_ATTR, String(counter))
      counter++
    }
  }
  return counter
}

// Public: tag HTML, return HTML yang sudah ter-tag.
// Aman dipakai di srcDoc iframe.
export function tagEditableElements(html: string): string {
  if (!html.trim()) return html
  if (typeof window === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  tagElementsInDoc(doc)
  return serializeFullDoc(doc, html)
}

// Strip semua data-lp-edit dari HTML — dipakai sebelum save ke server.
export function stripEditAttributes(html: string): string {
  if (typeof window === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const tagged = doc.querySelectorAll(`[${EDIT_ATTR}]`)
  tagged.forEach((el) => el.removeAttribute(EDIT_ATTR))
  return serializeFullDoc(doc, html)
}

// Serialize doc dengan preserve doctype kalau ada di input asli.
// DOMParser membuat `<html>` wrapper otomatis; kita serialize documentElement.
function serializeFullDoc(doc: Document, original: string): string {
  const hasDoctype = /^\s*<!doctype/i.test(original)
  const hasHtmlTag = /<html[\s>]/i.test(original)
  const docHtml = doc.documentElement.outerHTML

  if (!hasHtmlTag) {
    // Original cuma fragment (mis. <div>...</div>). DOMParser bungkus dalam
    // <html><head></head><body>fragment</body></html>. Ekstrak isi body.
    return doc.body.innerHTML
  }
  return hasDoctype ? `<!DOCTYPE html>\n${docHtml}` : docHtml
}

// Mutate isi (innerHtml) dan/atau href elemen by edit index.
// `innerHtml` undefined untuk skip update isi, `href` undefined untuk skip link.
// `innerHtml` jadi sumber kebenaran isi elemen — menggantikan semua children
// (termasuk text nodes & inline tags seperti <strong>, <em>, <mark>).
// Caller bertanggung jawab sanitize HTML sebelum kirim — kita hanya parse via
// DOMParser di dokumen sandbox (tidak dieksekusi di main page).
export function updateElement(
  html: string,
  editIndex: number,
  patch: {
    innerHtml?: string
    href?: string
    // Untuk <img>.
    src?: string
    alt?: string
  },
): string {
  if (typeof window === 'undefined') return html
  if (
    patch.innerHtml === undefined &&
    patch.href === undefined &&
    patch.src === undefined &&
    patch.alt === undefined
  ) {
    return html
  }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  tagElementsInDoc(doc)
  const target = doc.body.querySelector(`[${EDIT_ATTR}="${editIndex}"]`)
  if (!target) return html

  if (patch.innerHtml !== undefined) {
    target.innerHTML = patch.innerHtml
  }

  if (patch.href !== undefined) {
    if (target.tagName.toLowerCase() === 'a') {
      target.setAttribute('href', patch.href)
    } else {
      const a =
        target.querySelector('a') ??
        target.closest('a') ??
        null
      a?.setAttribute('href', patch.href)
    }
  }

  if (patch.src !== undefined && target.tagName.toLowerCase() === 'img') {
    target.setAttribute('src', patch.src)
  }

  if (patch.alt !== undefined && target.tagName.toLowerCase() === 'img') {
    target.setAttribute('alt', patch.alt)
  }

  doc.querySelectorAll(`[${EDIT_ATTR}]`).forEach((el) =>
    el.removeAttribute(EDIT_ATTR),
  )
  return serializeFullDoc(doc, html)
}

// Hapus elemen dari DOM. Digunakan saat user klik "Hapus" di popover.
export function deleteElement(html: string, editIndex: number): string {
  if (typeof window === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  tagElementsInDoc(doc)
  const target = doc.body.querySelector(`[${EDIT_ATTR}="${editIndex}"]`)
  if (!target) return html
  target.remove()
  doc.querySelectorAll(`[${EDIT_ATTR}]`).forEach((el) =>
    el.removeAttribute(EDIT_ATTR),
  )
  return serializeFullDoc(doc, html)
}

// Tag yang valid untuk mengganti tipe blok teks. Dibatasi ke heading + p
// supaya user awam tidak mengubah `<a>` jadi `<h1>` (yang akan rusak link).
export const SWAPPABLE_TAGS = ['h1', 'h2', 'h3', 'h4', 'p'] as const
export type SwappableTag = (typeof SWAPPABLE_TAGS)[number]

// Apakah tag ini boleh diganti tipe-nya via UI?
export function isSwappableTag(tag: string): tag is SwappableTag {
  return (SWAPPABLE_TAGS as readonly string[]).includes(tag.toLowerCase())
}

// Ganti tag elemen — buat elemen baru dengan tag baru, copy attribute & children,
// replace dalam DOM. Untuk awam yang mau ubah heading H1↔H2↔H3 atau jadi paragraf.
export function changeElementTag(
  html: string,
  editIndex: number,
  newTag: SwappableTag,
): string {
  if (typeof window === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  tagElementsInDoc(doc)
  const target = doc.body.querySelector(`[${EDIT_ATTR}="${editIndex}"]`)
  if (!target) return html
  if (target.tagName.toLowerCase() === newTag) return html

  const fresh = doc.createElement(newTag)
  for (const a of Array.from(target.attributes)) {
    fresh.setAttribute(a.name, a.value)
  }
  while (target.firstChild) fresh.appendChild(target.firstChild)
  target.parentNode?.replaceChild(fresh, target)

  doc.querySelectorAll(`[${EDIT_ATTR}]`).forEach((el) =>
    el.removeAttribute(EDIT_ATTR),
  )
  return serializeFullDoc(doc, html)
}

// ─── Color extraction & replacement ──────────────────────────────────

// Regex untuk warna CSS yang umum dipakai di LP HTML.
// Match: #fff, #ffffff, #ffffff80, rgb(...), rgba(...), hsl(...), hsla(...).
const COLOR_REGEX =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g

// Whitelist tempat warna boleh muncul: dalam <style>...</style>, dalam atribut
// style="...", dan di attribute color/bgcolor (legacy). Kita scan di string
// langsung (regex di seluruh HTML cukup aman karena pattern hex/rgb/hsl).
export function extractColors(html: string): string[] {
  const found = new Set<string>()
  if (!html) return []
  // Hanya scan dalam style attr dan <style> tag untuk hindari false positive.
  // Style attr: style="color: #fff; background: rgb(...)"
  const styleAttrMatches = html.match(/style\s*=\s*"([^"]*)"/gi) ?? []
  for (const m of styleAttrMatches) {
    const colorsInThis = m.match(COLOR_REGEX) ?? []
    colorsInThis.forEach((c) => found.add(normalizeColor(c)))
  }
  const styleTagMatches = html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) ?? []
  for (const m of styleTagMatches) {
    const colorsInThis = m.match(COLOR_REGEX) ?? []
    colorsInThis.forEach((c) => found.add(normalizeColor(c)))
  }
  // Sort: warna gelap dulu (sering background), lalu cerah.
  return Array.from(found)
}

// Normalize warna ke representasi lowercase. Untuk hex, expand 3-digit ke 6.
function normalizeColor(raw: string): string {
  const c = raw.trim().toLowerCase()
  // #abc → #aabbcc; #abcd → #aabbccdd
  const shortHex = c.match(/^#([0-9a-f]{3,4})$/)
  if (shortHex) {
    return (
      '#' +
      shortHex[1]
        .split('')
        .map((ch) => ch + ch)
        .join('')
    )
  }
  return c
}

// Replace warna di seluruh HTML — hanya dalam style attr dan <style> tag,
// tidak di atribut/teks lain (hindari corrupt content).
export function replaceColor(
  html: string,
  oldColor: string,
  newColor: string,
): string {
  if (!html || !oldColor || !newColor) return html
  const oldNorm = normalizeColor(oldColor)
  const newNorm = newColor.toLowerCase()

  function replaceInBlock(block: string): string {
    // Buat regex flexible: support shorthand hex original kalau oldNorm hex.
    return block.replace(COLOR_REGEX, (match) => {
      if (normalizeColor(match) === oldNorm) return newNorm
      return match
    })
  }

  // Replace di style attr.
  let out = html.replace(/style\s*=\s*"([^"]*)"/gi, (full, inner: string) => {
    return `style="${replaceInBlock(inner)}"`
  })

  // Replace di <style> tag.
  out = out.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_full, open: string, inner: string, close: string) =>
      `${open}${replaceInBlock(inner)}${close}`,
  )

  return out
}

// Duplicate elemen — clone & insert tepat setelah elemen target.
export function duplicateElement(html: string, editIndex: number): string {
  if (typeof window === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  tagElementsInDoc(doc)
  const target = doc.body.querySelector(`[${EDIT_ATTR}="${editIndex}"]`)
  if (!target) return html
  const clone = target.cloneNode(true)
  // Strip data-lp-edit dari clone supaya tidak duplicate index — re-tag akan
  // dilakukan di iframe render berikutnya.
  if (clone.nodeType === Node.ELEMENT_NODE) {
    const cloneEl = clone as Element
    cloneEl.removeAttribute(EDIT_ATTR)
    cloneEl.querySelectorAll(`[${EDIT_ATTR}]`).forEach((el) =>
      el.removeAttribute(EDIT_ATTR),
    )
  }
  target.parentNode?.insertBefore(clone, target.nextSibling)
  doc.querySelectorAll(`[${EDIT_ATTR}]`).forEach((el) =>
    el.removeAttribute(EDIT_ATTR),
  )
  return serializeFullDoc(doc, html)
}

// Pindah elemen naik/turun — swap dengan element-sibling sebelumnya/sesudahnya.
// Dibatasi ke same parent (tidak crossing section). Cukup untuk reorder dasar.
export function moveElement(
  html: string,
  editIndex: number,
  direction: 'up' | 'down',
): string {
  if (typeof window === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  tagElementsInDoc(doc)
  const target = doc.body.querySelector(`[${EDIT_ATTR}="${editIndex}"]`)
  if (!target) return html

  if (direction === 'up') {
    const prev = target.previousElementSibling
    if (!prev) return html
    target.parentNode?.insertBefore(target, prev)
  } else {
    const next = target.nextElementSibling
    if (!next) return html
    // Insert next before target → target effectively moves down.
    target.parentNode?.insertBefore(next, target)
  }
  doc.querySelectorAll(`[${EDIT_ATTR}]`).forEach((el) =>
    el.removeAttribute(EDIT_ATTR),
  )
  return serializeFullDoc(doc, html)
}

// Pindah elemen ke posisi target (drag & drop). Source dipindah ke sebelum/sesudah
// elemen target di parent target. Skip kalau source==target atau target descendant
// dari source (drop ke dalam diri sendiri → noop biar tidak corrupt DOM).
export function moveElementTo(
  html: string,
  fromIndex: number,
  toIndex: number,
  position: 'before' | 'after',
): string {
  if (typeof window === 'undefined') return html
  if (fromIndex === toIndex) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  tagElementsInDoc(doc)
  const source = doc.body.querySelector(`[${EDIT_ATTR}="${fromIndex}"]`)
  const target = doc.body.querySelector(`[${EDIT_ATTR}="${toIndex}"]`)
  if (!source || !target) return html
  if (source.contains(target)) return html

  const ref = position === 'before' ? target : target.nextSibling
  target.parentNode?.insertBefore(source, ref)
  doc.querySelectorAll(`[${EDIT_ATTR}]`).forEach((el) =>
    el.removeAttribute(EDIT_ATTR),
  )
  return serializeFullDoc(doc, html)
}

// Ambil outerHTML elemen by index — dipakai untuk clipboard saat cut.
// Hasil sudah ter-strip dari data-lp-edit.
export function getElementOuterHtml(
  html: string,
  editIndex: number,
): string | null {
  if (typeof window === 'undefined') return null
  const doc = new DOMParser().parseFromString(html, 'text/html')
  tagElementsInDoc(doc)
  const target = doc.body.querySelector(`[${EDIT_ATTR}="${editIndex}"]`)
  if (!target) return null
  // Clone & strip semua data-lp-edit dari clone.
  const clone = target.cloneNode(true) as Element
  clone.removeAttribute(EDIT_ATTR)
  clone.querySelectorAll(`[${EDIT_ATTR}]`).forEach((el) =>
    el.removeAttribute(EDIT_ATTR),
  )
  return clone.outerHTML
}

// Tempel HTML fragment relatif ke elemen target (sebelum/sesudah).
// Caller bertanggung jawab pastikan fragment HTML valid.
export function pasteElement(
  html: string,
  editIndex: number,
  fragment: string,
  position: 'before' | 'after',
): string {
  if (typeof window === 'undefined') return html
  if (!fragment.trim()) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  tagElementsInDoc(doc)
  const target = doc.body.querySelector(`[${EDIT_ATTR}="${editIndex}"]`)
  if (!target) return html
  // Parse fragment dalam template untuk dapat root element.
  const tpl = doc.createElement('template') as HTMLTemplateElement
  tpl.innerHTML = fragment
  const node = tpl.content.firstElementChild
  if (!node) return html

  if (position === 'before') {
    target.parentNode?.insertBefore(node, target)
  } else {
    target.parentNode?.insertBefore(node, target.nextSibling)
  }
  doc.querySelectorAll(`[${EDIT_ATTR}]`).forEach((el) =>
    el.removeAttribute(EDIT_ATTR),
  )
  return serializeFullDoc(doc, html)
}

// Cari offset opening tag (dan closing tag kalau ada) untuk elemen editable
// ke-N di raw HTML — dipakai HtmlEditor di mode "lanjutan" untuk highlight
// range textarea saat user klik elemen di LivePreview.
//
// Cara: regex find all opening tag yang match editable selector, hitung urutan
// per pre-order, skip yang ada di dalam <script>/<style>/komen. Untuk non-void,
// cari matching closing tag dengan depth counter sederhana.
//
// Asumsi: HTML well-formed. Kalau parse meleset, return start..openEnd saja
// (highlight cuma opening tag — tetap berguna sebagai indikasi posisi).
export function findEditableTagOffset(
  rawHtml: string,
  editIndex: number,
): { start: number; end: number } | null {
  if (!rawHtml || editIndex < 0) return null

  // Range yang harus di-skip: <!-- ... -->, <script>...</script>, <style>...</style>.
  const skipRanges: Array<[number, number]> = []
  const skipRe = /<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>/gi
  let sm: RegExpExecArray | null
  while ((sm = skipRe.exec(rawHtml)) !== null) {
    skipRanges.push([sm.index, sm.index + sm[0].length])
  }
  const inSkip = (pos: number) =>
    skipRanges.some(([s, e]) => pos >= s && pos < e)

  // Cari opening tag editable ke-editIndex.
  const openRe = /<(h[1-6]|p|a|button|li|span|img)\b([^>]*)>/gi
  let counter = 0
  let m: RegExpExecArray | null
  while ((m = openRe.exec(rawHtml)) !== null) {
    if (inSkip(m.index)) continue
    if (counter === editIndex) {
      const start = m.index
      const openEnd = m.index + m[0].length
      const tagName = m[1].toLowerCase()
      const attrs = m[2] ?? ''
      const isVoid = tagName === 'img'
      const isSelfClosed = /\/\s*$/.test(attrs)
      if (isVoid || isSelfClosed) return { start, end: openEnd }
      // Find matching closing dengan depth counter — cari `<TAG...>` & `</TAG>`
      // dari posisi openEnd, kembalikan posisi `>` setelah </TAG> yang seimbang.
      const balRe = new RegExp(
        `<${tagName}\\b[^>]*>|</${tagName}\\s*>`,
        'gi',
      )
      balRe.lastIndex = openEnd
      let depth = 1
      let bm: RegExpExecArray | null
      while ((bm = balRe.exec(rawHtml)) !== null) {
        if (inSkip(bm.index)) continue
        const isClose = bm[0].startsWith('</')
        // Self-closing dalam balRe match untuk tag yang sama — treat sebagai close
        const isSelfCloseHere = !isClose && /\/\s*>$/.test(bm[0])
        if (isClose) {
          depth--
          if (depth === 0) {
            return { start, end: bm.index + bm[0].length }
          }
        } else if (!isSelfCloseHere) {
          depth++
        }
      }
      // Closing tidak ketemu — fallback highlight opening saja.
      return { start, end: openEnd }
    }
    counter++
  }
  return null
}

// Editable element snapshot — dipakai parent untuk render popover.
export interface EditableSnapshot {
  editIndex: number
  tagName: string
  text: string
  // innerHTML lengkap (preserve <strong>, <em>, <mark>, dst). Dipakai sebagai
  // initial value untuk contentEditable di popover.
  innerHtml: string
  href: string | null
  // Untuk <img>: src & alt.
  src: string | null
  alt: string | null
  // Punya saudara sebelum/sesudah dengan parent yang sama? Dipakai untuk
  // disable tombol Move Up/Down di popover.
  hasPrev: boolean
  hasNext: boolean
  // Bounding rect dari iframe (relatif ke iframe viewport).
  rect: { top: number; left: number; width: number; height: number }
  // Pixel tracking attributes (data-pixel-*) — dipakai popover untuk preset form.
  // null kalau elemen belum ada attribute pixel.
  pixelEvent: string | null
  pixelValue: string | null
  pixelCurrency: string | null
}

// Set/clear attribute pixel tracking ke elemen by edit index.
// `null` di patch field artinya HAPUS attribute itu.
// `undefined` artinya tidak diubah (preserve nilai existing).
export function setElementPixel(
  html: string,
  editIndex: number,
  patch: {
    event?: string | null
    value?: string | null
    currency?: string | null
  },
): string {
  if (typeof window === 'undefined') return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  tagElementsInDoc(doc)
  const target = doc.body.querySelector(`[${EDIT_ATTR}="${editIndex}"]`)
  if (!target) return html

  const apply = (attr: string, val: string | null | undefined) => {
    if (val === undefined) return
    if (val === null || !String(val).trim()) {
      target.removeAttribute(attr)
    } else {
      target.setAttribute(attr, String(val).trim())
    }
  }
  apply('data-pixel-event', patch.event)
  apply('data-pixel-value', patch.value)
  apply('data-pixel-currency', patch.currency)

  // Cleanup: kalau event kosong, hapus juga value & currency (mereka tidak
  // bermakna tanpa event).
  if (!target.getAttribute('data-pixel-event')) {
    target.removeAttribute('data-pixel-value')
    target.removeAttribute('data-pixel-currency')
  }

  doc.querySelectorAll(`[${EDIT_ATTR}]`).forEach((el) =>
    el.removeAttribute(EDIT_ATTR),
  )
  return serializeFullDoc(doc, html)
}

// Standard pixel events — superset dari yang di-support semua platform.
// Custom event bisa dimasukkan via input bebas di UI.
export const PIXEL_EVENT_PRESETS = [
  'ViewContent',
  'Lead',
  'Contact',
  'InitiateCheckout',
  'AddToCart',
  'Purchase',
  'CompleteRegistration',
] as const
export type PixelEventPreset = (typeof PIXEL_EVENT_PRESETS)[number]
