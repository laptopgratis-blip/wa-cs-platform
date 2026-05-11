'use client'

// EditorTopbar — judul inline-editable, slug inline-editable, viewport toggle,
// status save, tombol Simpan Draft & Publish/Unpublish.
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Globe,
  Loader2,
  Monitor,
  Pencil,
  Save,
  Settings,
  Smartphone,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type Viewport = 'desktop' | 'mobile'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'unsaved' | 'error'

type SlugStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'invalid'

interface Props {
  lpId: string
  title: string
  onTitleChange: (v: string) => void
  slug: string
  // Dipanggil setelah PATCH slug sukses.
  onSlugSaved: (nextSlug: string) => void
  isPublished: boolean
  saveStatus: SaveStatus
  lastSavedAt: string
  viewport: Viewport
  onViewportChange: (v: Viewport) => void
  onSaveDraft: () => void
  // Diganti dari onTogglePublish: parent yang buka PublishDialog & handle confirm.
  onPublishClick: () => void
  // Buka SeoSettingsSheet.
  onSeoClick: () => void
}

// Slugify identik dengan SeoSettingsSheet/CreateLpModal — supaya input slug di
// topbar berperilaku konsisten.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function StatusIndicator({
  status,
  lastSavedAt,
}: {
  status: SaveStatus
  lastSavedAt: string
}) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-warm-500">
        <Loader2 className="size-3.5 animate-spin" />
        Menyimpan…
      </span>
    )
  }
  if (status === 'unsaved') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-amber-600">
        <CircleAlert className="size-3.5" />
        Belum disimpan
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-destructive">
        <CircleAlert className="size-3.5" />
        Gagal menyimpan
      </span>
    )
  }
  // saved | idle
  return (
    <span className="flex items-center gap-1.5 text-xs text-emerald-600">
      <CheckCircle2 className="size-3.5" />
      Tersimpan{' '}
      <span className="text-warm-400">
        {new Date(lastSavedAt).toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>
    </span>
  )
}

// Inline editor slug di topbar. Read-only mode: `/p/{slug}` + icon pencil.
// Klik → editable input + tombol save/cancel + indikator validasi realtime.
function SlugInlineEditor({
  lpId,
  slug,
  isPublished,
  onSaved,
}: {
  lpId: string
  slug: string
  isPublished: boolean
  onSaved: (next: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(slug)
  const [status, setStatus] = useState<SlugStatus>('idle')
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const seqRef = useRef(0)

  // Sync draft ke slug eksternal saat tidak editing (mis. user save lewat sheet).
  useEffect(() => {
    if (!editing) setDraft(slug)
  }, [slug, editing])

  // Focus input saat masuk mode edit.
  useEffect(() => {
    if (editing) {
      // Tunda 1 tick supaya layout settle dulu.
      const id = setTimeout(() => inputRef.current?.select(), 0)
      return () => clearTimeout(id)
    }
  }, [editing])

  // Validasi debounced.
  useEffect(() => {
    if (!editing) return
    if (draft === slug) {
      setStatus('idle')
      setMsg('')
      return
    }
    if (!draft) {
      setStatus('invalid')
      setMsg('Slug tidak boleh kosong')
      return
    }
    setStatus('checking')
    setMsg('')
    const seq = ++seqRef.current
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/lp/check-slug?slug=${encodeURIComponent(draft)}`,
        )
        const json = (await res.json()) as {
          success: boolean
          data?: { available: boolean; reason?: string }
        }
        if (seq !== seqRef.current) return
        if (!res.ok || !json.success || !json.data) {
          setStatus('idle')
          return
        }
        if (json.data.available) {
          setStatus('available')
          setMsg('Slug tersedia')
        } else {
          const isFormat = /minimal|maksimal|huruf/.test(
            (json.data.reason ?? '').toLowerCase(),
          )
          setStatus(isFormat ? 'invalid' : 'unavailable')
          setMsg(json.data.reason ?? 'Slug tidak tersedia')
        }
      } catch {
        if (seq === seqRef.current) setStatus('idle')
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [draft, slug, editing])

  const livePath = `/p/${slug}`

  function cancel() {
    setDraft(slug)
    setStatus('idle')
    setMsg('')
    setEditing(false)
  }

  async function save() {
    if (draft === slug) {
      setEditing(false)
      return
    }
    if (!draft) {
      toast.error('Slug tidak boleh kosong')
      return
    }
    if (status === 'invalid' || status === 'unavailable') {
      toast.error(msg || 'Slug tidak valid')
      return
    }
    if (status === 'checking') {
      toast.error('Tunggu pengecekan slug selesai')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/lp/${lpId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: draft }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal mengubah slug')
        return
      }
      toast.success(
        isPublished
          ? `URL berubah ke /p/${draft}. URL lama tidak aktif lagi.`
          : 'Slug tersimpan',
      )
      onSaved(draft)
      setEditing(false)
    } catch (err) {
      console.error('[slug save]', err)
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="mt-0.5 flex items-center gap-1 px-2 text-xs text-warm-500">
        <Globe className="size-3" />
        {isPublished ? (
          <a
            href={livePath}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 truncate font-mono text-emerald-600 hover:underline"
            title="Buka LP live di tab baru"
          >
            {livePath}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          <span className="truncate font-mono">{livePath}</span>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-warm-500 hover:bg-warm-100 hover:text-warm-800"
          title="Edit permalink"
        >
          <Pencil className="size-3" />
          Edit
        </button>
      </div>
    )
  }

  const slugChanged = draft !== slug
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 px-2 text-xs">
      <Globe className="size-3 text-warm-500" />
      <span className="font-mono text-warm-500">/p/</span>
      <div className="relative">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(slugify(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void save()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          className="h-7 w-48 pr-7 font-mono text-xs"
          placeholder="slug-url"
          maxLength={50}
          autoFocus
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2">
          {slugChanged && status === 'checking' && (
            <Loader2 className="size-3.5 animate-spin text-warm-400" />
          )}
          {slugChanged && status === 'available' && (
            <Check className="size-3.5 text-emerald-600" />
          )}
          {slugChanged &&
            (status === 'unavailable' || status === 'invalid') && (
              <X className="size-3.5 text-destructive" />
            )}
        </span>
      </div>
      <Button
        size="sm"
        onClick={() => void save()}
        disabled={
          saving ||
          status === 'checking' ||
          status === 'invalid' ||
          status === 'unavailable'
        }
        className="h-7 bg-primary-500 px-2 text-[11px] text-white hover:bg-primary-600"
      >
        {saving ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Save className="size-3" />
        )}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={cancel}
        disabled={saving}
        className="h-7 px-2 text-[11px]"
      >
        Batal
      </Button>
      {slugChanged && msg && (
        <span
          className={cn(
            'ml-1 text-[10px]',
            status === 'available' ? 'text-emerald-600' : 'text-destructive',
          )}
        >
          {msg}
        </span>
      )}
      {slugChanged && isPublished && (
        <span className="ml-1 text-[10px] text-amber-700">
          URL lama akan tidak aktif setelah disimpan
        </span>
      )}
    </div>
  )
}

export function EditorTopbar({
  lpId,
  title,
  onTitleChange,
  slug,
  onSlugSaved,
  isPublished,
  saveStatus,
  lastSavedAt,
  viewport,
  onViewportChange,
  onSaveDraft,
  onPublishClick,
  onSeoClick,
}: Props) {
  return (
    <header className="flex flex-col gap-2 border-b border-warm-200 bg-card px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
      {/* Kiri: tombol kembali + judul + slug */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Button asChild variant="ghost" size="icon" className="shrink-0">
          <Link href="/landing-pages" aria-label="Kembali ke daftar LP">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <Input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Judul landing page"
            maxLength={120}
            className="h-8 border-transparent bg-transparent px-2 font-display text-base font-bold text-warm-900 shadow-none focus-visible:bg-warm-50 focus-visible:ring-1"
          />
          <SlugInlineEditor
            lpId={lpId}
            slug={slug}
            isPublished={isPublished}
            onSaved={onSlugSaved}
          />
        </div>
      </div>

      {/* Tengah: viewport toggle */}
      <div className="flex shrink-0 items-center gap-1 rounded-lg border border-warm-200 bg-warm-50 p-0.5">
        <Button
          variant={viewport === 'desktop' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewportChange('desktop')}
          className={cn(
            'h-7 gap-1.5 px-2.5 text-xs',
            viewport === 'desktop' && 'bg-card text-warm-900 shadow-sm hover:bg-card',
          )}
          aria-pressed={viewport === 'desktop'}
        >
          <Monitor className="size-3.5" />
          Desktop
        </Button>
        <Button
          variant={viewport === 'mobile' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewportChange('mobile')}
          className={cn(
            'h-7 gap-1.5 px-2.5 text-xs',
            viewport === 'mobile' && 'bg-card text-warm-900 shadow-sm hover:bg-card',
          )}
          aria-pressed={viewport === 'mobile'}
        >
          <Smartphone className="size-3.5" />
          Mobile
        </Button>
      </div>

      {/* Kanan: status + tombol */}
      <div className="flex shrink-0 items-center gap-2">
        <StatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />

        <Button
          variant="ghost"
          size="sm"
          onClick={onSeoClick}
          title="Atur SEO, URL, dan publish"
        >
          <Settings className="mr-1.5 size-3.5" />
          SEO &amp; Settings
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onSaveDraft}
          disabled={saveStatus === 'saving' || saveStatus === 'saved'}
        >
          <Save className="mr-1.5 size-3.5" />
          Simpan Draft
        </Button>

        <Button
          size="sm"
          onClick={onPublishClick}
          disabled={saveStatus === 'saving'}
          className={
            isPublished
              ? 'bg-warm-100 text-warm-700 hover:bg-warm-200'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }
        >
          {isPublished ? (
            <>
              Unpublish
              <Badge
                variant="outline"
                className="ml-2 border-emerald-600 text-emerald-700"
              >
                Live
              </Badge>
            </>
          ) : (
            <>
              Publish
              <Badge variant="outline" className="ml-2">
                Draft
              </Badge>
            </>
          )}
        </Button>
      </div>
    </header>
  )
}
