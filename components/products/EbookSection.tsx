'use client'

// Section E-Book di dialog produk (ProductsClient) — hubungkan produk ke
// aset e-book (Product.ebookId): pilih e-book existing ATAU upload baru
// inline (PDF/EPUB maks 50MB) + pengaturan akses (batas download & masa
// aktif). Diekstrak dari ProductsClient supaya file induk tidak makin gemuk.
import { BookOpen, Loader2, Unlink, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface EbookOption {
  id: string
  title: string
  fileName: string
  fileFormat: 'PDF' | 'EPUB'
  fileSizeBytes: number
  maxDownloads: number
  accessDays: number | null
  isActive: boolean
  product: { id: string; name: string } | null
}

interface EbookSectionProps {
  // Product yang sedang diedit (null = create baru).
  productId: string | null
  // Ebook terpilih di form produk.
  ebookId: string | null
  onChange: (ebookId: string | null) => void
}

const MAX_BYTES = 50 * 1024 * 1024

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function EbookSection({
  productId,
  ebookId,
  onChange,
}: EbookSectionProps) {
  const [ebooks, setEbooks] = useState<EbookOption[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadTitle, setUploadTitle] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // Pengaturan akses e-book terpilih (di-PATCH terpisah dari save produk).
  const [maxDownloads, setMaxDownloads] = useState(20)
  const [accessDays, setAccessDays] = useState<'' | number>('')
  const [savingSettings, setSavingSettings] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ebooks')
      const json = await res.json()
      if (json.success) setEbooks(json.data.items)
    } catch {
      // list gagal = section tetap render dengan pesan kosong
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selected = ebooks.find((e) => e.id === ebookId) ?? null

  // Sinkronkan input pengaturan saat pilihan berubah.
  useEffect(() => {
    if (selected) {
      setMaxDownloads(selected.maxDownloads)
      setAccessDays(selected.accessDays ?? '')
    }
  }, [selected])

  // Opsi yang bisa dipilih: belum terhubung produk lain (atau terhubung ke
  // produk ini sendiri).
  const options = ebooks.filter(
    (e) => !e.product || (productId && e.product.id === productId),
  )

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) {
      toast.error('Pilih file PDF/EPUB dulu')
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error('Ukuran maksimal 50 MB')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const upRes = await fetch('/api/ebooks/upload', {
        method: 'POST',
        body: fd,
      })
      const upJson = await upRes.json()
      if (!upRes.ok || !upJson.success) {
        toast.error(upJson.error ?? 'Upload gagal')
        return
      }
      const createRes = await fetch('/api/ebooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:
            uploadTitle.trim() ||
            file.name.replace(/\.(pdf|epub)$/i, '').slice(0, 150),
          maxDownloads: 20,
          accessDays: null,
          file: upJson.data,
        }),
      })
      const createJson = await createRes.json()
      if (!createRes.ok || !createJson.success) {
        toast.error(createJson.error ?? 'Gagal menyimpan e-book')
        return
      }
      toast.success('E-book ter-upload')
      setShowUpload(false)
      setUploadTitle('')
      if (fileRef.current) fileRef.current.value = ''
      await load()
      onChange(createJson.data.id)
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setUploading(false)
    }
  }

  async function saveSettings() {
    if (!selected) return
    setSavingSettings(true)
    try {
      const res = await fetch(`/api/ebooks/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxDownloads: Number(maxDownloads) || 1,
          accessDays: accessDays === '' ? null : Number(accessDays),
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error ?? 'Gagal menyimpan pengaturan')
        return
      }
      toast.success('Pengaturan akses disimpan')
      await load()
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div className="space-y-3 rounded-lg border-2 border-amber-200 bg-amber-50 p-3">
      <div>
        <Label className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <BookOpen className="size-4" />
          E-Book / Produk Digital
        </Label>
        <p className="mt-1 text-xs text-amber-800">
          Optional. Hubungkan file PDF/EPUB — pembeli otomatis dapat link
          download di Perpustakaan setelah pembayaran dikonfirmasi. COD otomatis
          dinonaktifkan untuk produk ini.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-amber-800">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </div>
      ) : selected ? (
        <div className="space-y-3 rounded-lg border bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-warm-900 font-medium">{selected.title}</p>
              <p className="text-warm-500 text-xs">
                {selected.fileFormat} · {formatSize(selected.fileSizeBytes)} ·{' '}
                {selected.fileName}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange(null)}
            >
              <Unlink className="mr-1 size-3.5" />
              Lepas
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Batas download / pembeli</Label>
              <Input
                type="number"
                min={1}
                max={1000}
                value={maxDownloads}
                onChange={(e) => setMaxDownloads(Number(e.target.value) || 1)}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">
                Masa aktif (hari, kosong = selamanya)
              </Label>
              <Input
                type="number"
                min={1}
                max={3650}
                placeholder="Selamanya"
                value={accessDays}
                onChange={(e) =>
                  setAccessDays(
                    e.target.value === '' ? '' : Number(e.target.value),
                  )
                }
              />
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={savingSettings}
            onClick={() => void saveSettings()}
          >
            {savingSettings ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : null}
            Simpan Pengaturan Akses
          </Button>
          <p className="text-warm-500 text-xs">
            Berlaku untuk pembeli BARU — hak pembeli lama tidak berubah.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {options.length > 0 && (
            <select
              className="w-full rounded-md border bg-white px-3 py-2 text-sm"
              value=""
              onChange={(e) => {
                if (e.target.value) onChange(e.target.value)
              }}
            >
              <option value="">Pilih e-book yang sudah di-upload…</option>
              {options.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} ({e.fileFormat}, {formatSize(e.fileSizeBytes)})
                </option>
              ))}
            </select>
          )}

          {showUpload ? (
            <div className="space-y-2 rounded-lg border bg-white p-3">
              <div className="space-y-1">
                <Label className="text-xs">Judul e-book</Label>
                <Input
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Kosongkan = pakai nama file"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">File PDF / EPUB (maks 50 MB)</Label>
                <Input ref={fileRef} type="file" accept=".pdf,.epub" />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={uploading}
                  onClick={() => void handleUpload()}
                >
                  {uploading ? (
                    <Loader2 className="mr-1 size-3.5 animate-spin" />
                  ) : (
                    <Upload className="mr-1 size-3.5" />
                  )}
                  {uploading ? 'Mengupload…' : 'Upload & Hubungkan'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={uploading}
                  onClick={() => setShowUpload(false)}
                >
                  Batal
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowUpload(true)}
            >
              <Upload className="mr-1 size-3.5" />
              Upload E-Book Baru
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
