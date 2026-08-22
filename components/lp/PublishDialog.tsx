'use client'

// PublishDialog — modal konfirmasi sebelum publish/unpublish LP.
// Validasi: htmlContent ≥ 100 chars, slug ada (selalu ada karena required di schema).
// Setelah publish sukses: tampilan berubah jadi success state dengan URL & tombol copy.
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  PackageOpen,
  Send,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

const MIN_HTML_LENGTH = 100

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Mode: publish (currently draft → going live) atau unpublish (live → draft)
  mode: 'publish' | 'unpublish'
  lpId: string
  slug: string
  lpTitle: string
  htmlLength: number
  onConfirm: () => Promise<boolean> // return true kalau sukses
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

export function PublishDialog({
  open,
  onOpenChange,
  mode,
  lpId,
  slug,
  lpTitle,
  htmlLength,
  onConfirm,
}: Props) {
  const [isWorking, setWorking] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const fullUrl = `${getBaseUrl()}/p/${slug}`

  // Validasi (hanya untuk publish — unpublish tidak butuh validasi).
  const validationError =
    mode === 'publish' && htmlLength < MIN_HTML_LENGTH
      ? `HTML konten terlalu pendek (${htmlLength} karakter). Minimal ${MIN_HTML_LENGTH} karakter — generate atau tulis HTML dulu sebelum publish.`
      : null

  function copyUrl() {
    void navigator.clipboard.writeText(fullUrl)
    toast.success('URL disalin')
  }

  function handleClose() {
    setShowSuccess(false)
    onOpenChange(false)
  }

  async function handleConfirm() {
    if (validationError) return
    setWorking(true)
    try {
      const ok = await onConfirm()
      if (ok && mode === 'publish') {
        setShowSuccess(true)
      } else if (ok && mode === 'unpublish') {
        // Unpublish — langsung tutup, no success state
        onOpenChange(false)
      }
    } finally {
      setWorking(false)
    }
  }

  // Success state setelah publish berhasil — celebration + push ke post-publish.
  // NB: jangan re-check `mode === 'publish'` di sini. Setelah `confirmPublishToggle`
  // sukses, parent re-render dgn `isPublished=true` sehingga prop `mode` flip ke
  // 'unpublish' sebelum render success ini sempat tampil. `showSuccess` sendiri
  // hanya pernah di-set true di `handleConfirm` saat mode masih 'publish', jadi
  // cukup gate di flag itu saja.
  if (showSuccess) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-xl">
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-full',
                  TONES.success.bg,
                  TONES.success.text,
                )}
              >
                <Check className="size-5" strokeWidth={3} />
              </span>
              <span>Selamat! LP Kamu Live</span>
            </DialogTitle>
            <DialogDescription className="text-sm">
              Landing page <strong>{lpTitle}</strong> sekarang bisa dipakai
              jualan. Tinggal datengin pembeli.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* URL public */}
            <div className="border-warm-200 bg-warm-50 rounded-lg border p-3">
              <div className="text-warm-500 text-xs font-medium tracking-wider uppercase">
                URL Public
              </div>
              <div className="text-warm-900 mt-1 font-mono text-sm font-semibold break-all">
                {fullUrl}
              </div>
              <div className="mt-2 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-xs"
                  onClick={copyUrl}
                >
                  <Copy className="mr-1.5 size-3.5" />
                  Copy
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 text-xs"
                >
                  <a href={fullUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-1.5 size-3.5" />
                    Buka LP
                  </a>
                </Button>
              </div>
            </div>

            {/* CTA utama: topup token → otomatis dibawa ke generator setelah berhasil */}
            <div className="border-primary-200 bg-primary-50 overflow-hidden rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <span className="bg-primary-500 flex size-10 shrink-0 items-center justify-center rounded-full text-white">
                  <Sparkles className="size-5" />
                </span>
                <div className="flex-1">
                  <div className="font-display text-warm-900 text-base font-semibold">
                    Mau saya bantu datengin pembeli?
                  </div>
                  <p className="text-warm-700 mt-1 text-xs leading-relaxed">
                    Saya buatkan <strong>15 status WhatsApp siap pakai</strong>{' '}
                    dari LP kamu — tinggal salin, posting Status, chat masuk
                    dalam hitungan jam. Butuh saldo token dulu.
                  </p>
                  <div
                    className={cn(
                      'mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                      TONES.success.bg,
                      TONES.success.text,
                    )}
                  >
                    Setelah top-up berhasil, kamu langsung dibawa ke generator
                  </div>
                </div>
              </div>
              <Button
                asChild
                size="lg"
                className="mt-3 w-full rounded-full font-semibold"
              >
                <Link
                  href={`/billing?from=post-publish&lpId=${lpId}`}
                  onClick={handleClose}
                >
                  <Send className="mr-2 size-4" />
                  Top-up Token & Lanjut
                </Link>
              </Button>
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-warm-600 hover:text-primary-700 mt-1.5 w-full text-xs"
              >
                <Link
                  href={`/content/post-publish/${lpId}`}
                  onClick={handleClose}
                >
                  Coba 3 sample gratis dulu →
                </Link>
              </Button>
            </div>
          </div>

          <DialogFooter className="sm:justify-start">
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Lain kali saja
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Default state: konfirmasi
  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'publish' ? (
              <>
                <Globe className={cn('size-5', TONES.success.text)} />
                Publish Landing Page?
              </>
            ) : (
              <>
                <PackageOpen className="text-warm-600 size-5" />
                Unpublish Landing Page?
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === 'publish'
              ? 'LP akan langsung bisa diakses oleh siapapun di internet.'
              : 'LP tidak lagi bisa diakses publik. Link yang sudah disebar akan return 404.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="border-warm-200 bg-warm-50 rounded-lg border p-3">
            <div className="text-warm-500 text-xs font-medium tracking-wider uppercase">
              URL
            </div>
            <div className="text-warm-900 mt-1 font-mono text-sm break-all">
              {fullUrl}
            </div>
          </div>

          {validationError ? (
            <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div>{validationError}</div>
            </div>
          ) : mode === 'publish' ? (
            <div
              className={cn(
                'flex items-start gap-2 rounded-md border p-3 text-sm',
                TONES.success.bg,
                TONES.success.border,
                TONES.success.text,
              )}
            >
              <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                HTML konten cukup ({htmlLength.toLocaleString('id-ID')}{' '}
                karakter) — siap untuk dipublish.
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isWorking}>
            Batal
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isWorking || Boolean(validationError)}
            variant={mode === 'publish' ? 'default' : 'secondary'}
          >
            {isWorking && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === 'publish' ? 'Ya, Publish Sekarang' : 'Ya, Unpublish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
