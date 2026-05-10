'use client'

// InlineProductAdd — form simple buat 1 produk pertama langsung di wizard.
// Field minimal: nama, harga, berat (gram), foto utama (1), deskripsi opsional.
// POST /api/products/upload (multipart) → POST /api/products (JSON dengan
// images: [url]). Field advanced (varian, multi-foto, flash sale) di-defer
// ke halaman lengkap via fallbackHref.

import {
  CheckCircle2,
  ImagePlus,
  Loader2,
  Save,
  X,
} from 'lucide-react'
import Image from 'next/image'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type { InlineTaskCommonProps } from './InlineTaskHost'

export function InlineProductAdd({
  onCompleted,
  fallbackHref,
}: InlineTaskCommonProps) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [weight, setWeight] = useState('500')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/products/upload', {
        method: 'POST',
        body: fd,
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { url: string }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Upload gagal')
        return
      }
      setImageUrl(json.data.url)
    } catch (err) {
      console.error('[InlineProductAdd upload]', err)
      toast.error('Tidak bisa upload foto')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (name.trim().length < 1) {
      toast.error('Nama produk wajib diisi')
      return
    }
    const priceNum = Number(price)
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error('Harga harus angka > 0')
      return
    }
    const weightNum = Number(weight)
    if (!Number.isInteger(weightNum) || weightNum < 1) {
      toast.error('Berat minimal 1 gram')
      return
    }
    if (!imageUrl) {
      toast.error('Upload minimal 1 foto produk')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          price: priceNum,
          weightGrams: weightNum,
          description: description.trim() || null,
          images: [imageUrl],
          isActive: true,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal simpan produk')
        setSubmitting(false)
        return
      }
      toast.success('Produk tersimpan')
      setDone(true)
      setTimeout(() => onCompleted(), 800)
    } catch (err) {
      console.error('[InlineProductAdd submit]', err)
      toast.error('Tidak bisa hubungi server')
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="font-display text-base font-bold text-emerald-900">
          Produk pertama tersimpan
        </p>
        <p className="text-xs text-emerald-700">Lanjut ke step berikutnya…</p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border-2 border-primary-200 bg-card p-5"
    >
      <div className="space-y-1.5">
        <Label htmlFor="ob-prod-name" className="text-xs">
          Nama produk
        </Label>
        <Input
          id="ob-prod-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="mis. Sepatu Sneakers Hitam"
          className="h-9 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ob-prod-price" className="text-xs">
            Harga (Rp)
          </Label>
          <Input
            id="ob-prod-price"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="350000"
            className="h-9 font-mono text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ob-prod-weight" className="text-xs">
            Berat (gram)
          </Label>
          <Input
            id="ob-prod-weight"
            inputMode="numeric"
            value={weight}
            onChange={(e) => setWeight(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="500"
            className="h-9 font-mono text-sm"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ob-prod-desc" className="text-xs">
          Deskripsi singkat (opsional)
        </Label>
        <Textarea
          id="ob-prod-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          placeholder="Bahan, ukuran, atau highlight singkat."
          className="text-xs"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Foto utama</Label>
        {imageUrl ? (
          <div className="relative inline-block">
            <Image
              src={imageUrl}
              alt="Foto produk"
              width={120}
              height={120}
              className="size-28 rounded-lg border-2 border-warm-200 object-cover"
              unoptimized
            />
            <button
              type="button"
              onClick={() => setImageUrl(null)}
              className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full bg-red-500 text-white shadow"
              title="Hapus foto"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
              id="ob-prod-photo"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-9"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Upload…
                </>
              ) : (
                <>
                  <ImagePlus className="mr-2 size-4" />
                  Pilih foto
                </>
              )}
            </Button>
            <p className="mt-1 text-[10px] text-warm-500">
              JPG / PNG / WebP, maks 8 MB. Otomatis di-resize.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="submit"
          disabled={submitting || uploading}
          className="bg-primary-500 hover:bg-primary-600"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Menyimpan…
            </>
          ) : (
            <>
              <Save className="mr-2 size-4" />
              Simpan produk
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
