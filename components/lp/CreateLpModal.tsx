'use client'

// Modal create LP — auto-generate slug dari judul, validasi slug realtime via API.
import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (lp: { id: string; slug: string }) => void
}

// Generate slug: lowercase, ganti non-alfanumerik dengan strip, trim strip ganda.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

type SlugStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid'

export function CreateLpModal({ open, onOpenChange, onCreated }: Props) {
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [status, setStatus] = useState<SlugStatus>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [isCreating, setCreating] = useState(false)

  // Reset saat modal dibuka.
  useEffect(() => {
    if (open) {
      setTitle('')
      setSlug('')
      setSlugTouched(false)
      setStatus('idle')
      setStatusMsg('')
    }
  }, [open])

  // Auto-generate slug dari title kalau user belum override slug manual.
  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(title))
    }
  }, [title, slugTouched])

  // Debounced check ke /api/lp/check-slug.
  const checkSeq = useRef(0)
  useEffect(() => {
    if (!slug) {
      setStatus('idle')
      setStatusMsg('')
      return
    }
    setStatus('checking')
    setStatusMsg('')
    const seq = ++checkSeq.current
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/lp/check-slug?slug=${encodeURIComponent(slug)}`,
        )
        const json = (await res.json()) as {
          success: boolean
          data?: { available: boolean; reason?: string }
        }
        if (seq !== checkSeq.current) return // user sudah ketik lagi
        if (!res.ok || !json.success || !json.data) {
          setStatus('idle')
          return
        }
        if (json.data.available) {
          setStatus('available')
          setStatusMsg('Slug tersedia')
        } else {
          // Bedakan invalid format vs taken supaya UX jelas.
          if (
            json.data.reason &&
            json.data.reason.toLowerCase().includes('slug')
          ) {
            const isFormat = /minimal|maksimal|huruf/.test(
              json.data.reason.toLowerCase(),
            )
            setStatus(isFormat ? 'invalid' : 'unavailable')
          } else {
            setStatus('unavailable')
          }
          setStatusMsg(json.data.reason ?? 'Slug tidak tersedia')
        }
      } catch {
        if (seq === checkSeq.current) setStatus('idle')
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [slug])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (status !== 'available') {
      toast.error(statusMsg || 'Periksa kembali judul & slug')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/lp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), slug }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { id: string; slug: string }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal membuat LP')
        return
      }
      toast.success('Landing page berhasil dibuat')
      onCreated(json.data)
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat Landing Page Baru</DialogTitle>
          <DialogDescription>
            Slug jadi URL public LP kamu — bisa diubah lagi nanti.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="lp-title">Judul</Label>
            <Input
              id="lp-title"
              autoFocus
              placeholder="Promo Akhir Tahun"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="lp-slug">Slug (URL)</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-warm-500">/lp/</span>
              <div className="relative flex-1">
                <Input
                  id="lp-slug"
                  placeholder="promo-akhir-tahun"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true)
                    setSlug(slugify(e.target.value))
                  }}
                  className="pr-9"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                  {status === 'checking' && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                  {status === 'available' && (
                    <Check className="size-4 text-emerald-600" />
                  )}
                  {(status === 'unavailable' || status === 'invalid') && (
                    <X className="size-4 text-destructive" />
                  )}
                </span>
              </div>
            </div>
            {statusMsg && (
              <p
                className={
                  status === 'available'
                    ? 'text-xs text-emerald-600'
                    : status === 'idle'
                      ? 'text-xs text-muted-foreground'
                      : 'text-xs text-destructive'
                }
              >
                {statusMsg}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Hanya huruf kecil, angka, dan strip. 3–50 karakter.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isCreating || status !== 'available' || !title.trim()}
              className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
            >
              {isCreating && <Loader2 className="mr-2 size-4 animate-spin" />}
              Buat
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
