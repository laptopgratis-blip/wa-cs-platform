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
} from 'lucide-react'
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

const MIN_HTML_LENGTH = 100

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Mode: publish (currently draft → going live) atau unpublish (live → draft)
  mode: 'publish' | 'unpublish'
  slug: string
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
  slug,
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

  // Success state setelah publish berhasil
  if (showSuccess && mode === 'publish') {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="size-5" />
              </span>
              LP berhasil dipublish!
            </DialogTitle>
            <DialogDescription>
              Landing page kamu sekarang live & bisa diakses publik.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-lg border border-warm-200 bg-warm-50 p-3">
              <div className="text-xs font-medium uppercase tracking-wider text-warm-500">
                URL Public
              </div>
              <div className="mt-1 break-all font-mono text-sm font-semibold text-warm-900">
                {fullUrl}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={copyUrl}
              >
                <Copy className="mr-2 size-4" />
                Copy URL
              </Button>
              <Button
                asChild
                className="flex-1 bg-primary-500 text-white shadow-orange hover:bg-primary-600"
              >
                <a href={fullUrl} target="_blank" rel="noopener noreferrer">
                  Buka LP
                  <ExternalLink className="ml-2 size-4" />
                </a>
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={handleClose}>
              Tutup
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
                <Globe className="size-5 text-emerald-600" />
                Publish Landing Page?
              </>
            ) : (
              <>
                <PackageOpen className="size-5 text-warm-600" />
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
          <div className="rounded-lg border border-warm-200 bg-warm-50 p-3">
            <div className="text-xs font-medium uppercase tracking-wider text-warm-500">
              URL
            </div>
            <div className="mt-1 break-all font-mono text-sm text-warm-900">
              {fullUrl}
            </div>
          </div>

          {validationError ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <div>{validationError}</div>
            </div>
          ) : mode === 'publish' ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              ✓ HTML konten cukup ({htmlLength.toLocaleString('id-ID')}{' '}
              karakter) — siap untuk dipublish.
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
            className={
              mode === 'publish'
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-warm-700 text-white hover:bg-warm-800'
            }
          >
            {isWorking && <Loader2 className="mr-2 size-4 animate-spin" />}
            {mode === 'publish' ? 'Ya, Publish Sekarang' : 'Ya, Unpublish'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
