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
    <div className="border-warm-200 bg-card border-b">
      <button
        type="button"
        className="hover:bg-warm-50 flex w-full items-center justify-between px-4 py-2 text-left"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <Link2 className="text-primary-500 size-4" />
          <span className="font-display text-warm-900 text-sm font-semibold">
            Link Tombol Default
          </span>
          <span className="text-warm-500 text-xs">
            {nonWaCount} tombol non-WA terdeteksi
          </span>
        </div>
        {open ? (
          <ChevronUp className="text-warm-500 size-4" />
        ) : (
          <ChevronDown className="text-warm-500 size-4" />
        )}
      </button>

      {open && (
        <div className="space-y-2 px-4 pt-1 pb-3">
          <div className="space-y-1">
            <label htmlFor="cta-default-url" className="text-warm-700 text-xs">
              URL tujuan (checkout / daftar / info)
            </label>
            <Input
              id="cta-default-url"
              type="url"
              placeholder="https://checkout.contoh.com/produk-x"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={500}
              className="h-9 font-mono text-xs"
            />
          </div>
          <Button
            size="sm"
            type="button"
            onClick={handleApply}
            disabled={!url.trim() || nonWaCount === 0}
            className="bg-primary-500 hover:bg-primary-600 text-xs text-white"
          >
            Terapkan ke {nonWaCount} tombol non-WA
          </Button>
          <p className="text-warm-500 text-xs leading-relaxed">
            Semua tombol/link yang BUKAN WhatsApp akan diarahkan ke URL ini,
            otomatis dibuka di tab baru. Tombol WhatsApp tidak terpengaruh.
            Untuk edit per-tombol, klik tombolnya di preview di bawah.
          </p>
        </div>
      )}
    </div>
  )
}
