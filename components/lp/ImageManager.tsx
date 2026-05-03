'use client'

// ImageManager — panel kiri editor LP. Fetch & manage gambar user.
// Fitur: upload (auto-attach ke lpId), grid thumbnail, copy URL per item,
// hapus per item, dan box "Prompt untuk AI" (semua URL dijadikan template
// label:URL siap copy ke AI generator).
import {
  Copy,
  HardDrive,
  ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react'
import Image from 'next/image'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function ImageManager({ lpId }: { lpId: string }) {
  const [images, setImages] = useState<LpImageRow[]>([])
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [isLoading, setLoading] = useState(true)
  const [isUploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function handleDelete(img: LpImageRow) {
    if (!confirm(`Hapus gambar "${img.originalName}"?`)) return
    setDeletingId(img.id)
    try {
      const res = await fetch(`/api/lp/images/${img.id}`, { method: 'DELETE' })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menghapus')
        return
      }
      toast.success('Gambar dihapus')
      void loadAll()
    } finally {
      setDeletingId(null)
    }
  }

  function copyToClipboard(text: string, label: string) {
    void navigator.clipboard.writeText(text)
    toast.success(`${label} disalin`)
  }

  // Build prompt template untuk AI generator: list semua URL gambar dengan
  // label generic. User bisa edit kalau perlu spesifik.
  const aiPromptText = useMemo(() => {
    if (images.length === 0) return ''
    const origin =
      typeof window !== 'undefined' ? window.location.origin : ''
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header + storage */}
      <div className="border-b border-warm-200 p-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-bold text-warm-900">
            Gambar
          </h3>
          <span className="text-[10px] text-warm-500">
            {images.length} file
          </span>
        </div>
        {quota && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1 text-warm-500">
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
          size="sm"
          className="mt-3 w-full bg-primary-500 text-white shadow-orange hover:bg-primary-600"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          {isUploading ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Upload className="mr-1.5 size-3.5" />
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
        <p className="mt-1.5 text-[10px] text-warm-500">
          JPG/PNG/WebP/GIF, max 2 MB per file
        </p>
      </div>

      {/* Grid gambar */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-xs text-warm-500">
            <ImageIcon className="size-6" />
            Belum ada gambar.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative overflow-hidden rounded-md border border-warm-200 bg-warm-50"
              >
                <div className="relative aspect-square w-full bg-warm-100">
                  <Image
                    src={img.url}
                    alt={img.originalName}
                    fill
                    sizes="140px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="space-y-1 p-1.5">
                  <div
                    className="truncate text-[10px] font-medium text-warm-800"
                    title={img.originalName}
                  >
                    {img.originalName}
                  </div>
                  <div className="text-[9px] text-warm-500">
                    {formatBytes(img.size)}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 flex-1 px-1 text-[10px]"
                      onClick={() =>
                        copyToClipboard(
                          `${typeof window !== 'undefined' ? window.location.origin : ''}${img.url}`,
                          'URL',
                        )
                      }
                      title="Salin URL gambar"
                    >
                      <Copy className="mr-1 size-3" />
                      URL
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDelete(img)}
                      disabled={deletingId === img.id}
                      title="Hapus gambar"
                    >
                      {deletingId === img.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Prompt untuk AI */}
      {images.length > 0 && (
        <div className="border-t border-warm-200 bg-warm-50/50 p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <h4 className="text-[11px] font-semibold text-warm-700">
              📋 Prompt untuk AI
            </h4>
          </div>
          <p className="mb-2 text-[10px] text-warm-500">
            Copy template ini ke kolom &quot;URL gambar&quot; di AI Generator.
          </p>
          <pre className="mb-2 max-h-24 overflow-auto rounded border border-warm-200 bg-card p-1.5 text-[10px] font-mono text-warm-700">
            {aiPromptText}
          </pre>
          <Button
            size="sm"
            variant="outline"
            className="w-full text-[11px]"
            onClick={() => copyToClipboard(aiPromptText, 'Semua URL untuk AI')}
          >
            <Copy className="mr-1.5 size-3" />
            Copy Semua URL untuk AI
          </Button>
        </div>
      )}
    </div>
  )
}
