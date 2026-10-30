'use client'

// ImageManager — panel kiri editor LP. Fetch & manage gambar user.
// Fitur: upload (auto-attach ke lpId), grid thumbnail, copy URL per item,
// hapus per item, dan box "Prompt untuk AI" (semua URL dijadikan template
// label:URL siap copy ke AI generator).
//
// Dua varian layout:
//   - 'sidebar' (default): kolom kiri desktop, tinggi penuh, grid scroll sendiri.
//   - 'inline': di dalam panel lipat layar < lg (MobileImagePanel). Judul
//     disembunyikan (sudah ada di header panel). Grid TANPA scroll sendiri
//     (nested scroll di HP membingungkan): saat dilipat tampil tepat 2 baris
//     gambar terbaru (lib/lp/image-preview) + tombol "Tampilkan semua". Kolom
//     ikut lebar panel via container
//     query (bukan viewport — sidebar dashboard ikut memakan lebar di tablet).
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Copy,
  HardDrive,
  ImageIcon,
  Loader2,
  Upload,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'

import { ImageTile } from '@/components/lp/ImageTile'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { copyText } from '@/lib/clipboard'
import {
  INLINE_PREVIEW_MAX,
  previewTileClass,
  previewToggleClass,
} from '@/lib/lp/image-preview'
import { cn } from '@/lib/utils'

export type ImageManagerVariant = 'sidebar' | 'inline'

interface LpImageRow {
  id: string
  filename: string
  originalName: string
  url: string
  size: number
  mimeType: string
  lpId: string | null
  createdAt: string
}

interface QuotaInfo {
  storageUsedMB: number
  maxStorageMB: number
}

function absoluteUrl(path: string): string {
  return `${typeof window !== 'undefined' ? window.location.origin : ''}${path}`
}

export function ImageManager({
  lpId,
  variant = 'sidebar',
}: {
  lpId: string
  variant?: ImageManagerVariant
}) {
  const isInline = variant === 'inline'
  const [images, setImages] = useState<LpImageRow[]>([])
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [isUploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<LpImageRow | null>(null)
  const [showAll, setShowAll] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  async function loadAll() {
    setLoading(true)
    try {
      // Ambil quota dari endpoint /api/lp (sudah include quota), dan list image.
      const [imgRes, lpRes] = await Promise.all([
        fetch('/api/lp/images'),
        fetch('/api/lp'),
      ])
      const imgJson = (await imgRes.json()) as {
        success: boolean
        data?: LpImageRow[]
      }
      const lpJson = (await lpRes.json()) as {
        success: boolean
        data?: { quota: { storageUsedMB: number; maxStorageMB: number } }
      }
      if (imgJson.success && imgJson.data) setImages(imgJson.data)
      if (lpJson.success && lpJson.data?.quota) {
        setQuota({
          storageUsedMB: lpJson.data.quota.storageUsedMB,
          maxStorageMB: lpJson.data.quota.maxStorageMB,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    setUploading(true)
    let successCount = 0
    let failCount = 0
    for (const file of list) {
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('lpId', lpId)
        const res = await fetch('/api/lp/images', { method: 'POST', body: fd })
        const json = (await res.json()) as { success: boolean; error?: string }
        if (!res.ok || !json.success) {
          failCount++
          toast.error(`${file.name}: ${json.error || 'gagal upload'}`)
        } else {
          successCount++
        }
      } catch {
        failCount++
        toast.error(`${file.name}: kesalahan jaringan`)
      }
    }
    setUploading(false)
    if (successCount > 0) {
      toast.success(`${successCount} gambar berhasil diupload`)
    }
    if (successCount > 0 || failCount > 0) {
      void loadAll()
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeletingId(deleteTarget.id)
    try {
      const res = await fetch(`/api/lp/images/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menghapus')
        return
      }
      toast.success('Gambar dihapus')
      setDeleteTarget(null)
      void loadAll()
    } finally {
      setDeletingId(null)
    }
  }

  // Clipboard bisa ditolak (browser in-app / WebView HP, izin diblok) —
  // copyText punya fallback; kalau tetap gagal jangan tampilkan "disalin".
  async function copyToClipboard(text: string, label: string) {
    if (await copyText(text)) {
      toast.success(`${label} disalin`)
      return
    }
    console.error('[lp image copy] clipboard API & fallback gagal')
    toast.error(
      'Gagal menyalin otomatis. Tahan lama teks di kotak "Prompt untuk AI" untuk salin manual.',
    )
  }

  // Build prompt template untuk AI generator: list semua URL gambar dengan
  // label generic. User bisa edit kalau perlu spesifik.
  const aiPromptText = useMemo(() => {
    if (images.length === 0) return ''
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    return images
      .map((img, i) => {
        const label = i === 0 ? 'Gambar hero' : `Gambar produk ${i}`
        return `${label}: ${origin}${img.url}`
      })
      .join('\n')
  }, [images])

  const storagePct =
    quota && quota.maxStorageMB > 0
      ? Math.min(100, (quota.storageUsedMB / quota.maxStorageMB) * 100)
      : 0

  // API mengurutkan terbaru dulu → hasil upload barusan selalu di preview.
  const toggleClass = isInline ? previewToggleClass(images.length) : null
  const isCollapsed = toggleClass !== null && !showAll
  const visibleImages = isCollapsed
    ? images.slice(0, INLINE_PREVIEW_MAX)
    : images

  function toggleShowAll() {
    if (!showAll) {
      setShowAll(true)
      return
    }
    // Saat dilipat lagi, grid menyusut & user tertinggal jauh di bawah (di
    // tengah panel AI). flushSync → DOM sudah menyusut sebelum di-scroll.
    flushSync(() => setShowAll(false))
    gridRef.current?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col',
        isInline ? '@container' : 'h-full',
      )}
    >
      {/* Header + storage — inline pakai px-4 supaya sejajar header panel */}
      <div
        className={cn(
          'border-warm-200 border-b',
          isInline ? 'px-4 py-3' : 'p-3',
        )}
      >
        {!isInline && (
          <div className="flex items-center justify-between">
            <h3 className="font-display text-warm-900 text-sm font-semibold">
              Gambar
            </h3>
            <span className="text-warm-500 text-xs">{images.length} file</span>
          </div>
        )}
        {quota && (
          <div className={cn('space-y-1', !isInline && 'mt-2')}>
            <div className="flex items-center justify-between text-xs">
              <span className="text-warm-500 flex items-center gap-1">
                <HardDrive className="size-3" />
                Storage
              </span>
              <span className="font-medium tabular-nums">
                {quota.storageUsedMB.toFixed(1)} / {quota.maxStorageMB} MB
              </span>
            </div>
            <Progress value={storagePct} className="h-1" />
          </div>
        )}
        <Button
          size={isInline ? 'default' : 'sm'}
          className={cn('mt-3 w-full', isInline && 'h-11')}
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2
              className={cn('animate-spin', !isInline && 'mr-1.5 size-3.5')}
              aria-hidden
            />
          ) : (
            <Upload
              className={cn(!isInline && 'mr-1.5 size-3.5')}
              aria-hidden
            />
          )}
          Upload Gambar
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <p className="text-warm-500 mt-1.5 text-xs">
          JPG/PNG/WebP/GIF, max 2 MB per file
          {isInline && !isLoading && ` · ${images.length} file`}
        </p>
      </div>

      {/* Grid gambar */}
      <div
        ref={gridRef}
        className={cn(isInline ? 'px-4 py-3' : 'flex-1 overflow-y-auto p-3')}
      >
        {/* Spinner penuh hanya saat muat pertama. Refresh sesudah upload/hapus
            tetap menampilkan grid lama (diredupkan) — kalau grid diganti
            spinner, tinggi panel kolaps & scroll halaman di HP melompat. */}
        {isLoading && images.length === 0 ? (
          <div
            className={cn('flex justify-center', isInline ? 'py-6' : 'py-12')}
          >
            <Loader2 className="text-muted-foreground size-4 animate-spin" />
          </div>
        ) : images.length === 0 ? (
          <div
            className={cn(
              'text-warm-500 flex flex-col items-center gap-2 text-center text-xs',
              isInline ? 'py-6' : 'py-12',
            )}
          >
            <ImageIcon className="size-6" aria-hidden />
            <span className="text-warm-700 font-medium">Belum ada gambar</span>
            <span>Upload foto produk, lalu salin URL-nya ke AI Generator.</span>
          </div>
        ) : (
          <>
            <div
              aria-busy={isLoading}
              className={cn(
                'grid gap-2 transition-opacity',
                isInline
                  ? 'grid-cols-2 @md:grid-cols-3 @xl:grid-cols-4 @3xl:grid-cols-5'
                  : 'grid-cols-2',
                isLoading && 'pointer-events-none opacity-60',
              )}
            >
              {visibleImages.map((img, i) => (
                <ImageTile
                  key={img.id}
                  className={isCollapsed ? previewTileClass(i) : undefined}
                  image={img}
                  variant={variant}
                  isDeleting={deletingId === img.id}
                  onCopyUrl={() =>
                    void copyToClipboard(absoluteUrl(img.url), 'URL')
                  }
                  onDelete={() => setDeleteTarget(img)}
                />
              ))}
            </div>
            {toggleClass !== null && (
              <Button
                variant="outline"
                className={cn('mt-3 h-11 w-full', toggleClass)}
                onClick={toggleShowAll}
                aria-expanded={showAll}
              >
                {showAll ? (
                  <ChevronUp aria-hidden />
                ) : (
                  <ChevronDown aria-hidden />
                )}
                {showAll
                  ? 'Tampilkan lebih sedikit'
                  : `Tampilkan semua ${images.length} gambar`}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Prompt untuk AI */}
      {images.length > 0 && (
        <div
          className={cn(
            'border-warm-200 bg-warm-50/50 border-t',
            isInline ? 'px-4 py-3' : 'p-3',
          )}
        >
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-warm-700 flex items-center gap-1 text-xs font-semibold">
              <ClipboardList className="size-3.5" aria-hidden />
              Prompt untuk AI
            </h4>
          </div>
          <p className="text-warm-500 mb-2 text-xs">
            Copy template ini ke kolom &quot;URL gambar&quot; di AI Generator.
          </p>
          <pre
            className={cn(
              'border-warm-200 bg-card text-warm-700 mb-2 max-h-24 overflow-auto rounded border p-1.5 font-mono text-xs',
              // HP: URL dibungkus, jangan scroll horizontal di dalam kotak kecil
              isInline && 'wrap-anywhere whitespace-pre-wrap',
            )}
          >
            {aiPromptText}
          </pre>
          <Button
            size={isInline ? 'default' : 'sm'}
            variant="outline"
            className={cn('w-full', isInline ? 'h-11' : 'text-xs')}
            onClick={() =>
              void copyToClipboard(aiPromptText, 'Semua URL untuk AI')
            }
          >
            <Copy className={cn(!isInline && 'mr-1.5 size-3')} aria-hidden />
            Copy Semua URL untuk AI
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        title="Hapus gambar ini?"
        description={
          <>
            Hapus gambar <strong>{deleteTarget?.originalName}</strong>? Tindakan
            ini tidak bisa dibatalkan.
          </>
        }
        isLoading={deletingId !== null}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
