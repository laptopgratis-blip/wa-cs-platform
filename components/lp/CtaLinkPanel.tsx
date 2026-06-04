'use client'

// CtaLinkPanel — sidebar untuk set URL default ke semua tombol non-WhatsApp
// di LP. Tujuan: user yang sudah generate LP dengan CTA "Beli Sekarang" /
// "Daftar Gratis" / "Pelajari Lebih Lanjut" bisa arahkan semua tombol non-WA
// ke 1 URL eksternal (checkout, form daftar, halaman info) sekaligus tanpa
// harus klik tombol satu per satu.
//
// WA links (wa.me / api.whatsapp.com) di-skip — user maintain itu via inline
// editor di preview (klik tombol → popover mode WhatsApp).
import { ChevronDown, ChevronUp, Link2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  countNonWaAnchors,
  replaceAllNonWaAnchorHrefs,
} from '@/lib/lp/html-mutation'

interface Props {
  html: string
  onChange: (next: string) => void
}

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function CtaLinkPanel({ html, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState('')

  const nonWaCount = useMemo(() => countNonWaAnchors(html), [html])

  function handleApply() {
    const trimmed = url.trim()
    if (!trimmed) return
    if (!isHttpUrl(trimmed)) {
      toast.error(
        'Format URL tidak valid. Harus diawali http:// atau https:// (mis. https://checkout.contoh.com).',
      )
      return
    }
    const next = replaceAllNonWaAnchorHrefs(html, trimmed)
    if (next === html) {
      toast.info('Tidak ada tombol non-WA untuk diubah.')
      return
    }
    onChange(next)
    toast.success(`Link diterapkan ke ${nonWaCount} tombol non-WA.`)
  }

  return (
    <div className="border-b border-warm-200 bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2 text-left hover:bg-warm-50"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <Link2 className="size-4 text-primary-500" />
          <span className="font-display text-sm font-bold text-warm-900">
            Link Tombol Default
          </span>
          <span className="text-[10px] text-warm-500">
            {nonWaCount} tombol non-WA terdeteksi
          </span>
        </div>
        {open ? (
          <ChevronUp className="size-4 text-warm-500" />
        ) : (
          <ChevronDown className="size-4 text-warm-500" />
        )}
      </button>

      {open && (
        <div className="space-y-2 px-4 pb-3 pt-1">
          <div className="space-y-1">
            <label htmlFor="cta-default-url" className="text-[11px] text-warm-700">
              URL tujuan (checkout / daftar / info)
            </label>
            <Input
              id="cta-default-url"
              type="url"
              placeholder="https://checkout.contoh.com/produk-x"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={500}
              className="h-9 font-mono text-[11px]"
            />
          </div>
          <Button
            size="sm"
            type="button"
            onClick={handleApply}
            disabled={!url.trim() || nonWaCount === 0}
            className="bg-primary-500 text-xs text-white hover:bg-primary-600"
          >
            Terapkan ke {nonWaCount} tombol non-WA
          </Button>
          <p className="text-[10px] leading-relaxed text-warm-500">
            Semua tombol/link yang BUKAN WhatsApp akan diarahkan ke URL ini,
            otomatis dibuka di tab baru. Tombol WhatsApp tidak terpengaruh.
            Untuk edit per-tombol, klik tombolnya di preview di bawah.
          </p>
        </div>
      )}
    </div>
  )
}
