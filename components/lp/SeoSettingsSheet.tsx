'use client'

// SeoSettingsSheet — sheet untuk edit meta title, meta desc, slug, & toggle
// publish dari editor LP. Validasi slug realtime via /api/lp/check-slug.
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

const META_TITLE_MAX = 60
const META_DESC_MAX = 160

type SlugStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  lpId: string
  // Initial values + current published state. Sheet jadi single source saat open.
  initial: {
    metaTitle: string | null
    metaDesc: string | null
    slug: string
    isPublished: boolean
  }
  // Setelah save sukses, parent perlu update state-nya supaya snapshot
  // dirty-check tetap konsisten.
  onSaved: (next: {
    metaTitle: string | null
    metaDesc: string | null
    slug: string
    isPublished: boolean
  }) => void
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

// Slugify identik dengan CreateLpModal.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

export function SeoSettingsSheet({
  open,
  onOpenChange,
  lpId,
  initial,
  onSaved,
}: Props) {
  const [metaTitle, setMetaTitle] = useState(initial.metaTitle ?? '')
  const [metaDesc, setMetaDesc] = useState(initial.metaDesc ?? '')
  const [slug, setSlug] = useState(initial.slug)
  const [isPublished, setIsPublished] = useState(initial.isPublished)
  const [slugStatus, setSlugStatus] = useState<SlugStatus>('idle')
  const [slugMsg, setSlugMsg] = useState('')
  const [isSaving, setSaving] = useState(false)

  // Reset form tiap kali sheet dibuka — supaya kalau user batal, tidak persist
  // perubahan lokal yang gak jadi disimpan.
  useEffect(() => {
    if (open) {
      setMetaTitle(initial.metaTitle ?? '')
      setMetaDesc(initial.metaDesc ?? '')
      setSlug(initial.slug)
      setIsPublished(initial.isPublished)
      setSlugStatus('idle')
      setSlugMsg('')
    }
  }, [open, initial])

  // Slug check debounced — skip kalau slug == initial (artinya tidak diubah).
  const checkSeq = useRef(0)
  useEffect(() => {
    if (!open) return
    if (slug === initial.slug) {
      setSlugStatus('idle')
      setSlugMsg('')
      return
    }
    if (!slug) {
      setSlugStatus('invalid')
      setSlugMsg('Slug tidak boleh kosong')
      return
    }
    setSlugStatus('checking')
    setSlugMsg('')
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
        if (seq !== checkSeq.current) return
        if (!res.ok || !json.success || !json.data) {
          setSlugStatus('idle')
          return
        }
        if (json.data.available) {
          setSlugStatus('available')
          setSlugMsg('Slug tersedia')
        } else {
          const isFormat = /minimal|maksimal|huruf/.test(
            (json.data.reason ?? '').toLowerCase(),
          )
          setSlugStatus(isFormat ? 'invalid' : 'unavailable')
          setSlugMsg(json.data.reason ?? 'Slug tidak tersedia')
        }
      } catch {
        if (seq === checkSeq.current) setSlugStatus('idle')
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [slug, initial.slug, open])

  const slugChanged = slug !== initial.slug
  const slugInvalid =
    slugChanged && (slugStatus === 'invalid' || slugStatus === 'unavailable')

  async function handleSave() {
    if (slugInvalid) {
      toast.error(slugMsg || 'Slug tidak valid')
      return
    }
    if (slugChanged && slugStatus === 'checking') {
      toast.error('Tunggu pengecekan slug selesai')
      return
    }
    setSaving(true)
    try {
      // PATCH dengan field yang berubah saja — backend support partial update.
      const body: Record<string, unknown> = {}
      const trimmedTitle = metaTitle.trim()
      const trimmedDesc = metaDesc.trim()
      if (trimmedTitle !== (initial.metaTitle ?? '')) {
        body.metaTitle = trimmedTitle || null
      }
      if (trimmedDesc !== (initial.metaDesc ?? '')) {
        body.metaDesc = trimmedDesc || null
      }
      if (slug !== initial.slug) body.slug = slug
      if (isPublished !== initial.isPublished) body.isPublished = isPublished

      if (Object.keys(body).length === 0) {
        toast.info('Tidak ada perubahan untuk disimpan')
        onOpenChange(false)
        return
      }

      const res = await fetch(`/api/lp/${lpId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menyimpan settings')
        return
      }

      toast.success('Settings tersimpan')
      onSaved({
        metaTitle: trimmedTitle || null,
        metaDesc: trimmedDesc || null,
        slug,
        isPublished,
      })
      onOpenChange(false)
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  const previewUrl = `${getBaseUrl()}/p/${slug || initial.slug}`

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md px-6">
        <SheetHeader className="px-0">
          <SheetTitle>SEO &amp; Settings</SheetTitle>
          <SheetDescription>
            Atur judul, deskripsi, URL, dan status publish landing page.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 py-4">
          {/* Meta Title */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="meta-title">Judul Halaman (meta title)</Label>
              <span
                className={
                  metaTitle.length > META_TITLE_MAX
                    ? 'text-xs text-destructive'
                    : 'text-xs text-warm-500'
                }
              >
                {metaTitle.length}/{META_TITLE_MAX}
              </span>
            </div>
            <Input
              id="meta-title"
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              placeholder="Mis. Sepatu Sneakers Wanita Brand Lokal"
              maxLength={META_TITLE_MAX + 20}
            />
            <p className="text-xs text-warm-500">
              Tampil di tab browser & hasil pencarian Google. Disarankan ≤ 60
              karakter.
            </p>
          </div>

          {/* Meta Desc */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="meta-desc">Deskripsi (meta description)</Label>
              <span
                className={
                  metaDesc.length > META_DESC_MAX
                    ? 'text-xs text-destructive'
                    : 'text-xs text-warm-500'
                }
              >
                {metaDesc.length}/{META_DESC_MAX}
              </span>
            </div>
            <Textarea
              id="meta-desc"
              rows={3}
              value={metaDesc}
              onChange={(e) => setMetaDesc(e.target.value)}
              placeholder="Sneakers wanita ringan, nyaman, dan tahan lama. Cocok untuk gaya kasual sehari-hari. Pesan sekarang via WA."
              maxLength={META_DESC_MAX + 40}
            />
            <p className="text-xs text-warm-500">
              Tampil sebagai snippet di hasil pencarian Google. Disarankan ≤ 160
              karakter.
            </p>
          </div>

          {/* Slug */}
          <div className="space-y-1.5">
            <Label htmlFor="lp-slug">Slug URL</Label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-warm-500">/p/</span>
              <div className="relative flex-1">
                <Input
                  id="lp-slug"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  className="pr-9"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                  {slugStatus === 'checking' && (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  )}
                  {slugStatus === 'available' && (
                    <Check className="size-4 text-emerald-600" />
                  )}
                  {(slugStatus === 'unavailable' || slugStatus === 'invalid') && (
                    <X className="size-4 text-destructive" />
                  )}
                </span>
              </div>
            </div>
            {slugMsg && slugChanged && (
              <p
                className={
                  slugStatus === 'available'
                    ? 'text-xs text-emerald-600'
                    : 'text-xs text-destructive'
                }
              >
                {slugMsg}
              </p>
            )}
            <div className="rounded-md border border-warm-200 bg-warm-50 p-2 font-mono text-xs text-warm-700 break-all">
              {previewUrl}
            </div>
            {slugChanged && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <div>
                  URL lama (
                  <span className="font-mono font-semibold">/p/{initial.slug}</span>
                  ) akan tidak aktif begitu setting ini disimpan. Update link di
                  iklan / sosmed kalau perlu.
                </div>
              </div>
            )}
          </div>

          {/* Publish toggle */}
          <div className="flex items-center justify-between rounded-md border border-warm-200 p-3">
            <div>
              <Label className="text-sm font-semibold">Publish</Label>
              <p className="text-xs text-warm-500">
                Aktifkan supaya LP bisa diakses publik di URL di atas.
              </p>
            </div>
            <Switch checked={isPublished} onCheckedChange={setIsPublished} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || slugInvalid || slugStatus === 'checking'}
            className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
          >
            {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Simpan Settings
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
