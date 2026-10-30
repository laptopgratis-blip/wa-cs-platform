'use client'

// MobileImagePanel — akses ImageManager di layar < lg (HP, tablet, mode
// "situs desktop" Chrome Android yang viewport-nya 980px). Di desktop,
// ImageManager tampil sebagai kolom kiri; di bawah lg kolom itu disembunyikan
// sehingga user HP sama sekali tidak bisa upload gambar. Panel ini mengisi
// celah itu dengan pola lipat yang sama dengan panel Warna/Link.
//
// ImageManager baru di-mount saat panel pertama kali dibuka, lalu tetap
// ter-mount walau dilipat supaya upload yang sedang berjalan tidak terputus.
// `active` (dari EditorShell, false saat >= lg) melepas instance ini supaya
// hanya instance sidebar yang hidup di desktop.
import { ChevronDown, ChevronUp, ImageIcon } from 'lucide-react'
import { useId, useState } from 'react'

import { ImageManager } from '@/components/lp/ImageManager'
import { cn } from '@/lib/utils'

export function MobileImagePanel({
  lpId,
  active,
}: {
  lpId: string
  active: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hasOpened, setHasOpened] = useState(false)
  const contentId = useId()

  function toggle() {
    setOpen((prev) => !prev)
    setHasOpened(true)
  }

  return (
    <div className="border-warm-200 bg-card border-b lg:hidden">
      <button
        type="button"
        className="hover:bg-warm-50 flex min-h-11 w-full items-center justify-between px-4 py-2 text-left"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={hasOpened && active ? contentId : undefined}
      >
        <div className="flex items-center gap-2">
          <ImageIcon className="text-primary-500 size-4" />
          <span className="font-display text-warm-900 text-sm font-semibold">
            Gambar
          </span>
          <span className="text-warm-500 text-xs">
            upload & salin URL untuk AI
          </span>
        </div>
        {open ? (
          <ChevronUp className="text-warm-500 size-4" />
        ) : (
          <ChevronDown className="text-warm-500 size-4" />
        )}
      </button>

      {hasOpened && active && (
        <div
          id={contentId}
          className={cn('border-warm-200 border-t', !open && 'hidden')}
        >
          <ImageManager lpId={lpId} variant="inline" />
        </div>
      )}
    </div>
  )
}
