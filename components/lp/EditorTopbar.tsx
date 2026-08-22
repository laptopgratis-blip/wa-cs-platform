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

import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TONES } from '@/lib/ui-tones'
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
      <span className="text-warm-500 flex items-center gap-1.5 text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        Menyimpan…
      </span>
    )
  }
  if (status === 'unsaved') {
    return (
      <span
        className={cn('flex items-center gap-1.5 text-xs', TONES.warning.text)}
      >
        <CircleAlert className="size-3.5" />
        Belum disimpan
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="text-destructive flex items-center gap-1.5 text-xs">
        <CircleAlert className="size-3.5" />
        Gagal menyimpan
      </span>
    )
  }
  // saved | idle
  return (
    <span
      className={cn('flex items-center gap-1.5 text-xs', TONES.success.text)}
    >
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
      <div className="text-warm-500 mt-0.5 flex items-center gap-1 px-2 text-xs">
        <Globe className="size-3" />
        {isPublished ? (
          <a
            href={livePath}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'flex items-center gap-1 truncate font-mono hover:underline',
              TONES.success.text,
            )}
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
          className="text-warm-500 hover:bg-warm-100 hover:text-warm-800 ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
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
      <Globe className="text-warm-500 size-3" />
      <span className="text-warm-500 font-mono">/p/</span>
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
        <span className="absolute top-1/2 right-2 -translate-y-1/2">
          {slugChanged && status === 'checking' && (
            <Loader2 className="text-warm-400 size-3.5 animate-spin" />
          )}
          {slugChanged && status === 'available' && (
            <Check className={cn('size-3.5', TONES.success.text)} />
          )}
          {slugChanged &&
            (status === 'unavailable' || status === 'invalid') && (
              <X className="text-destructive size-3.5" />
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
        className="h-7 px-2 text-xs"
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
        className="h-7 px-2 text-xs"
      >
        Batal
      </Button>
      {slugChanged && msg && (
        <span
          className={cn(
            'ml-1 text-xs',
            status === 'available' ? TONES.success.text : 'text-destructive',
          )}
        >
          {msg}
        </span>
      )}
      {slugChanged && isPublished && (
        <span className={cn('ml-1 text-xs', TONES.warning.text)}>
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
    <header className="border-warm-200 bg-card flex flex-col gap-2 border-b px-4 py-2.5 sm:flex-row sm:items-center sm:gap-4">
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
            className="font-display text-warm-900 focus-visible:bg-warm-50 h-8 border-transparent bg-transparent px-2 text-base font-bold shadow-none focus-visible:ring-1"
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
      <div className="border-warm-200 bg-warm-50 flex shrink-0 items-center gap-1 rounded-lg border p-0.5">
        <Button
          variant={viewport === 'desktop' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => onViewportChange('desktop')}
          className={cn(
            'h-7 gap-1.5 px-2.5 text-xs',
            viewport === 'desktop' &&
              'bg-card text-warm-900 hover:bg-card shadow-sm',
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
            viewport === 'mobile' &&
              'bg-card text-warm-900 hover:bg-card shadow-sm',
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
          variant={isPublished ? 'outline' : 'default'}
          onClick={onPublishClick}
          disabled={saveStatus === 'saving'}
        >
          {isPublished ? (
            <>
              Unpublish
              <StatusBadge tone="success" label="Live" className="ml-2" />
            </>
          ) : (
            <>
              Publish
              <StatusBadge tone="neutral" label="Draft" className="ml-2" />
            </>
          )}
        </Button>
      </div>
    </header>
  )
}
