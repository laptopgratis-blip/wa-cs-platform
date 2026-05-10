'use client'

// ColorsPanel — sidebar warna untuk Visual Editor.
// Auto-detect warna unique di HTML (style attr & <style> tag), tampilkan
// sebagai swatches. Klik swatch → buka native color picker → ganti warna
// di seluruh HTML.
//
// Catatan UX: untuk awam yang butuh "ganti warna brand", panel ini cukup —
// klik swatch, pilih warna baru, semua bagian halaman yang pakai warna
// itu otomatis ikut ganti.
import { ChevronDown, ChevronUp, Palette } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { extractColors, replaceColor } from '@/lib/lp/html-mutation'

interface Props {
  html: string
  onChange: (next: string) => void
}

// Untuk memberikan indikator label "kemungkinan dipakai untuk apa".
// Heuristik kasar: warna terang → kemungkinan background, gelap → teks.
function inferLabel(color: string): string | null {
  const m = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i)
  if (!m) return null
  const r = parseInt(m[1], 16)
  const g = parseInt(m[2], 16)
  const b = parseInt(m[3], 16)
  // Perceived luminance (sRGB approximation).
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  if (lum > 220) return 'terang'
  if (lum < 40) return 'gelap'
  return null
}

// Konversi warna apa pun ke hex untuk dipakai di <input type="color">
// (yang hanya menerima format #rrggbb). Kalau bukan hex, default ke #000000.
function toHexInput(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase()
  if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(0, 7).toLowerCase()
  // rgb(r,g,b)
  const rgb = color.match(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
  if (rgb) {
    const hex = (n: string) =>
      Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, '0')
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`
  }
  return '#000000'
}

export function ColorsPanel({ html, onChange }: Props) {
  const [open, setOpen] = useState(true)
  const colors = useMemo(() => extractColors(html), [html])

  // Hidden input color refs per swatch untuk trigger native picker.
  const inputsRef = useRef<Map<string, HTMLInputElement>>(new Map())

  function handleColorChange(oldColor: string, newColor: string) {
    if (newColor === oldColor) return
    const next = replaceColor(html, oldColor, newColor)
    if (next !== html) onChange(next)
  }

  function openPicker(color: string) {
    const input = inputsRef.current.get(color)
    if (input) input.click()
  }

  return (
    <div className="border-b border-warm-200 bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-warm-50"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <Palette className="size-4 text-primary-500" />
          <span className="font-display text-sm font-bold text-warm-900">
            Warna Halaman
          </span>
          <span className="text-[10px] text-warm-500">
            {colors.length} warna · klik untuk ganti
          </span>
        </div>
        {open ? (
          <ChevronUp className="size-4 text-warm-500" />
        ) : (
          <ChevronDown className="size-4 text-warm-500" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-3 pt-1">
          {colors.length === 0 ? (
            <p className="text-[11px] text-warm-500">
              Belum ada warna terdeteksi. Generate HTML dulu, atau ubah warna di
              tab HTML Lanjutan.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {colors.map((c) => {
                const label = inferLabel(c)
                return (
                  <div key={c} className="flex flex-col items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => openPicker(c)}
                      className="size-9 rounded-md border-2 border-warm-200 shadow-sm transition hover:scale-110 hover:border-warm-400 hover:shadow-md"
                      style={{ backgroundColor: c }}
                      title={`${c}${label ? ` (${label})` : ''} — klik untuk ganti`}
                      aria-label={`Ganti warna ${c}`}
                    />
                    <span className="font-mono text-[9px] text-warm-500">
                      {c.length > 7 ? c.slice(0, 7) : c}
                    </span>
                    {/* Hidden native color picker per swatch. */}
                    <input
                      ref={(el) => {
                        if (el) inputsRef.current.set(c, el)
                      }}
                      type="color"
                      defaultValue={toHexInput(c)}
                      onChange={(e) => handleColorChange(c, e.target.value)}
                      className="absolute size-0 opacity-0"
                      aria-hidden
                      tabIndex={-1}
                    />
                  </div>
                )
              })}
            </div>
          )}
          <p className="mt-2 text-[10px] text-warm-500">
            Tip: warna yang sama dipakai di banyak bagian akan ikut ter-update
            sekaligus.
          </p>
        </div>
      )}
    </div>
  )
}
