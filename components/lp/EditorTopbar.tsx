'use client'

// EditorTopbar — judul inline-editable, slug, viewport toggle, status save,
// tombol Simpan Draft & Publish/Unpublish.
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Globe,
  Loader2,
  Monitor,
  Save,
  Settings,
  Smartphone,
} from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export type Viewport = 'desktop' | 'mobile'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'unsaved' | 'error'

interface Props {
  title: string
  onTitleChange: (v: string) => void
  slug: string
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

export function EditorTopbar({
  title,
  onTitleChange,
  slug,
  isPublished,
  saveStatus,
  lastSavedAt,
  viewport,
  onViewportChange,
  onSaveDraft,
  onPublishClick,
  onSeoClick,
}: Props) {
  // Live URL — hanya tampil kalau sudah published. window.location.origin
  // tidak available di SSR; kita pakai relative path saja untuk href, dan
  // tampilkan path-nya yang udah cukup informatif.
  const livePath = `/p/${slug}`
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
          <div className="mt-0.5 flex items-center gap-2 px-2 text-xs text-warm-500">
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
          </div>
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
