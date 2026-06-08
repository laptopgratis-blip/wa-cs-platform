'use client'

// HostImageGallery — galeri kandidat gambar host (dipakai TTS & Klip Live).
// Flow: generate host (opsi tanpa produk) → download → edit/composite produk di
// luar → upload kembali → "Pakai ini" untuk jadikan source aktif (yg dipakai
// semua generate video). sourceImageUrl tetap source-of-truth tunggal.
//
// Backend:
//   GET    /api/host-templates/[id]/image-variants            → list
//   POST   /api/host-templates/[id]/image-variants/generate   → { withProduct, prompt? }
//   POST   /api/host-templates/[id]/image-variants/upload     → multipart file
//   PATCH  /api/host-templates/[id]/image-variants            → { action, variantId }

import {
  CheckCircle2,
  Download,
  ImagePlus,
  Loader2,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

interface ImageVariant {
  id: string
  url: string
  source: 'GENERATED' | 'UPLOADED'
  label?: string
  withProduct?: boolean
  createdAt: string
}

export function HostImageGallery({
  hostId,
  defaultPromptImage,
  // Dipanggil setelah variant aktif berubah → parent refetch host (sourceImageUrl).
  onActiveChanged,
}: {
  hostId: string
  defaultPromptImage?: string
  onActiveChanged?: () => void
}) {
  const [variants, setVariants] = useState<ImageVariant[] | null>(null)
  const [activeUrl, setActiveUrl] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showGen, setShowGen] = useState(false)
  const [withProduct, setWithProduct] = useState(false)
  const [prompt, setPrompt] = useState(defaultPromptImage ?? '')
  const uploadRef = useRef<HTMLInputElement | null>(null)

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/host-templates/${hostId}/image-variants`)
    const json = (await res.json()) as {
      success: boolean
      data?: {
        variants: ImageVariant[]
        activeUrl: string | null
        promptImage?: string
      }
    }
    if (json.success && json.data) {
      setVariants(json.data.variants)
      setActiveUrl(json.data.activeUrl)
      // Prefill prompt dari server kalau belum ada prop & textarea masih kosong.
      if (json.data.promptImage) {
        setPrompt((p) => p || defaultPromptImage || json.data!.promptImage!)
      }
    } else {
      setVariants([])
    }
  }, [hostId, defaultPromptImage])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (defaultPromptImage && !prompt) setPrompt(defaultPromptImage)
  }, [defaultPromptImage, prompt])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch(
        `/api/host-templates/${hostId}/image-variants/generate`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            withProduct,
            prompt: prompt.trim() || undefined,
          }),
        },
      )
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!json.success) throw new Error(json.error ?? 'Generate gagal')
      toast.success(
        withProduct
          ? 'Kandidat baru (dengan produk) dibuat.'
          : 'Kandidat baru (tanpa produk) dibuat — download untuk edit di luar.',
      )
      setShowGen(false)
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(
        `/api/host-templates/${hostId}/image-variants/upload`,
        { method: 'POST', body: fd },
      )
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!json.success) throw new Error(json.error ?? 'Upload gagal')
      toast.success('Gambar di-upload sebagai kandidat. Klik "Pakai ini" untuk aktifkan.')
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
      if (uploadRef.current) uploadRef.current.value = ''
    }
  }

  async function handleActivate(v: ImageVariant) {
    if (
      !confirm(
        'Jadikan gambar ini sebagai gambar aktif?\n\nSemua generate video/scene/klip berikutnya akan pakai gambar ini. Vision-analysis akan di-segarkan.',
      )
    )
      return
    setBusyId(v.id)
    try {
      const res = await fetch(`/api/host-templates/${hostId}/image-variants`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'activate', variantId: v.id }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { staleWarning: string | null }
        error?: string
      }
      if (!json.success) throw new Error(json.error ?? 'Gagal aktifkan')
      toast.success('Gambar aktif diperbarui.')
      if (json.data?.staleWarning) {
        toast.warning(json.data.staleWarning, { duration: 8000 })
      }
      await refresh()
      onActiveChanged?.()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(v: ImageVariant) {
    if (!confirm('Hapus kandidat gambar ini? File tetap di disk.')) return
    setBusyId(v.id)
    try {
      const res = await fetch(`/api/host-templates/${hostId}/image-variants`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', variantId: v.id }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!json.success) throw new Error(json.error ?? 'Gagal hapus')
      toast.success('Kandidat dihapus.')
      await refresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  // Download via blob — /uploads disajikan nginx cross-origin, atribut `download`
  // polos tak memaksa unduh. Fetch → object URL → klik sintetis.
  async function handleDownload(v: ImageVariant) {
    setBusyId(v.id)
    try {
      const res = await fetch(v.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = v.url.split('/').pop() ?? 'host-image.png'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objUrl)
    } catch (e) {
      toast.error(`Download gagal: ${(e as Error).message}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Galeri Gambar Host</h3>
          <p className="text-[11px] text-muted-foreground">
            Generate (opsi tanpa produk) → download → edit ukuran produk di luar →
            upload → <strong>Pakai ini</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowGen((s) => !s)}
            className="h-8"
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5 text-orange-500" /> Generate
          </Button>
          <input
            ref={uploadRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void handleUpload(f)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => uploadRef.current?.click()}
            disabled={uploading}
            className="h-8"
          >
            {uploading ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="mr-1.5 h-3.5 w-3.5" />
            )}
            Upload edit
          </Button>
        </div>
      </div>

      {/* Generate panel */}
      {showGen ? (
        <div className="rounded-lg border border-warm-200 bg-warm-50/50 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-warm-500">
              Produk:
            </span>
            <button
              type="button"
              onClick={() => setWithProduct(false)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                !withProduct
                  ? 'bg-orange-500 text-white'
                  : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
              }`}
            >
              Tanpa produk (rekomen)
            </button>
            <button
              type="button"
              onClick={() => setWithProduct(true)}
              className={`rounded-full px-2.5 py-1 text-[11px] transition ${
                withProduct
                  ? 'bg-orange-500 text-white'
                  : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
              }`}
            >
              Dengan produk
            </button>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            spellCheck={false}
            placeholder="Prompt gambar untuk Gemini (editable)…"
            className="w-full rounded-md border border-warm-200 bg-white px-3 py-2 font-mono text-[11px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <p className="text-[10px] text-warm-500">
            {withProduct
              ? '💡 Foto produk dikirim sebagai referensi — ukuran bisa kurang presisi.'
              : '💡 Host tampil tangan kosong. Composite produk ukuran pas di luar lalu upload.'}
          </p>
          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              onClick={handleGenerate}
              disabled={generating}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {generating ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Generate…
                </>
              ) : (
                <>
                  <ImagePlus className="mr-1.5 h-4 w-4" /> Generate kandidat
                </>
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Grid kandidat */}
      {variants === null ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat galeri…
        </div>
      ) : variants.length === 0 ? (
        <p className="rounded-lg border border-dashed border-warm-300 bg-warm-50/60 p-4 text-center text-xs text-warm-600">
          Belum ada gambar. Klik <strong>Generate</strong> atau <strong>Upload edit</strong>.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {variants.map((v) => {
            const isActive = v.url === activeUrl
            const busy = busyId === v.id
            return (
              <div
                key={v.id}
                className={`overflow-hidden rounded-lg border bg-white shadow-sm ${
                  isActive ? 'border-orange-500 ring-2 ring-orange-200' : 'border-warm-200'
                }`}
              >
                <div className="relative aspect-[9/16] bg-warm-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.url} alt={v.label ?? 'kandidat'} className="h-full w-full object-cover" />
                  {isActive ? (
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                      <Star className="h-2.5 w-2.5 fill-white" /> AKTIF
                    </span>
                  ) : null}
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] text-white">
                    {v.source === 'UPLOADED' ? '📎 upload' : '⚡ generate'}
                  </span>
                  {busy ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <Loader2 className="h-6 w-6 animate-spin text-white" />
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1.5 p-2">
                  {v.label ? (
                    <p className="truncate text-[10px] text-warm-600">{v.label}</p>
                  ) : null}
                  <div className="flex items-center gap-1">
                    {isActive ? (
                      <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-orange-50 py-1 text-[10px] font-medium text-orange-700">
                        <CheckCircle2 className="h-3 w-3" /> Dipakai
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleActivate(v)}
                        disabled={busy}
                        className="h-7 flex-1 px-1.5 text-[10px]"
                      >
                        Pakai ini
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDownload(v)}
                      disabled={busy}
                      title="Download"
                      className="h-7 w-7 text-warm-500 hover:text-orange-600"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    {!isActive ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(v)}
                        disabled={busy}
                        title="Hapus"
                        className="h-7 w-7 text-warm-400 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
