'use client'

// CRUD produk untuk Order System. Phase 2: tanpa flash sale UI (field di DB
// disiapkan, UI input masuk Phase 4). Phase 5 (2026-05-08): tambah editor varian.
import {
  ArrowLeft,
  ArrowRight,
  Edit3,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Package,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import Image from 'next/image'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { OnboardingHint } from '@/components/onboarding/OnboardingHint'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { formatNumber } from '@/lib/format'

interface ProductVariant {
  id: string
  name: string
  sku: string | null
  price: number
  flashSalePrice: number | null
  weightGrams: number
  stock: number | null
  imageUrl: string | null
  isActive: boolean
  sortOrder: number
}

import { EbookSection } from '@/components/products/EbookSection'

interface Product {
  id: string
  name: string
  description: string | null
  price: number
  weightGrams: number
  imageUrl: string | null
  // Galeri foto produk (max 10). Item pertama = cover.
  images: string[]
  stock: number | null
  isActive: boolean
  order: number
  createdAt: string
  flashSaleActive: boolean
  flashSalePrice: number | null
  flashSaleStartAt: string | null
  flashSaleEndAt: string | null
  flashSaleQuota: number | null
  flashSaleSold: number
  variants?: ProductVariant[]
  // E-Book (2026-08-06) — id aset e-book yang terhubung (null = produk biasa).
  ebookId?: string | null
}

const MAX_IMAGES = 10

// Variant row state di form (sebelum disubmit). Pakai `tempKey` untuk React
// `key` saat varian belum ada `id` dari server. Sengaja tidak pakai array
// index karena tabrakan saat user delete row tengah.
interface VariantFormRow {
  tempKey: string
  id?: string
  name: string
  sku: string
  price: number
  // Harga flash per varian — null = tidak ikut flash sale.
  flashSalePrice: number | null
  weightGrams: number
  stock: number | null
  imageUrl: string | null
  isActive: boolean
}

function makeVariantKey(): string {
  return `v_${Math.random().toString(36).slice(2, 10)}`
}

interface ProductsClientProps {
  initialProducts: Product[]
  limit: number
}

// Format ISO datetime → string yang dipakai di <input type="datetime-local">.
// Konversi UTC → local time supaya user lihat jam yang sesuai timezone-nya.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const tz = d.getTimezoneOffset() * 60_000
  return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}

function localInputToIso(local: string): string | null {
  if (!local) return null
  return new Date(local).toISOString()
}

const EMPTY_FORM = {
  name: '',
  description: '',
  price: 0,
  weightGrams: 500,
  // Galeri foto utama. Cover di-derive dari index 0 di server. UI hanya
  // mengelola array ini — tidak perlu state imageUrl terpisah.
  images: [] as string[],
  stock: null as number | null,
  isActive: true,
  flashSaleActive: false,
  flashSalePrice: 0,
  flashSaleStartLocal: '',
  flashSaleEndLocal: '',
  flashSaleQuota: '' as string | number,
  // Phase 5 (2026-05-08) — varian. Kalau kosong = produk single (pakai
  // harga/stok di field utama). Kalau ada ≥1 varian = customer wajib pilih
  // varian di form order, harga utama produk diabaikan.
  variants: [] as VariantFormRow[],
  // E-Book (2026-08-06) — link ke aset e-book digital.
  ebookId: null as string | null,
}

const VARIANT_LIMIT = 50

export function ProductsClient({
  initialProducts,
  limit,
}: ProductsClientProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [unlimitedStock, setUnlimitedStock] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
  } | null>(null)
  const [isDeleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setUnlimitedStock(true)
    setDialogOpen(true)
  }

  function openEdit(p: Product) {
    setEditingId(p.id)
    setForm({
      name: p.name,
      description: p.description ?? '',
      price: p.price,
      weightGrams: p.weightGrams,
      // Backwards compat — kalau produk lama belum punya `images` populated tapi
      // ada `imageUrl`, tampilkan sebagai single-item gallery.
      images:
        p.images && p.images.length > 0
          ? p.images
          : p.imageUrl
            ? [p.imageUrl]
            : [],
      stock: p.stock,
      isActive: p.isActive,
      flashSaleActive: p.flashSaleActive,
      flashSalePrice: p.flashSalePrice ?? 0,
      flashSaleStartLocal: isoToLocalInput(p.flashSaleStartAt),
      flashSaleEndLocal: isoToLocalInput(p.flashSaleEndAt),
      flashSaleQuota: p.flashSaleQuota ?? '',
      variants: (p.variants ?? []).map((v) => ({
        tempKey: makeVariantKey(),
        id: v.id,
        name: v.name,
        sku: v.sku ?? '',
        price: v.price,
        flashSalePrice: v.flashSalePrice ?? null,
        weightGrams: v.weightGrams,
        stock: v.stock,
        imageUrl: v.imageUrl,
        isActive: v.isActive,
      })),
      ebookId: p.ebookId ?? null,
    })
    setUnlimitedStock(p.stock === null)
    setDialogOpen(true)
  }

  function addVariant() {
    setForm((f) => {
      if (f.variants.length >= VARIANT_LIMIT) return f
      // Default field varian baru pakai field utama produk supaya user gak
      // perlu re-isi semua dari nol.
      return {
        ...f,
        variants: [
          ...f.variants,
          {
            tempKey: makeVariantKey(),
            name: '',
            sku: '',
            price: f.price,
            flashSalePrice: null,
            weightGrams: f.weightGrams,
            stock: f.stock,
            imageUrl: null,
            isActive: true,
          },
        ],
      }
    })
  }

  function updateVariant(tempKey: string, patch: Partial<VariantFormRow>) {
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v) =>
        v.tempKey === tempKey ? { ...v, ...patch } : v,
      ),
    }))
  }

  function removeVariant(tempKey: string) {
    setForm((f) => ({
      ...f,
      variants: f.variants.filter((v) => v.tempKey !== tempKey),
    }))
  }

  async function handleVariantUpload(tempKey: string, file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Ukuran maksimal 8 MB')
      return
    }
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/products/upload', {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal upload foto varian')
        return
      }
      updateVariant(tempKey, { imageUrl: data.data.url })
      toast.success('Foto varian diupload')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    }
  }

  async function refreshList() {
    const res = await fetch('/api/products')
    const data = await res.json()
    if (data.success) setProducts(data.data.items)
  }

  async function uploadOne(file: File): Promise<string | null> {
    if (file.size > 8 * 1024 * 1024) {
      toast.error(`File "${file.name}" melebihi 8 MB`)
      return null
    }
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/products/upload', {
      method: 'POST',
      body: fd,
    })
    const data = await res.json()
    if (!res.ok || !data.success) {
      toast.error(data.error ?? `Gagal upload "${file.name}"`)
      return null
    }
    return data.data.url as string
  }

  async function handleUpload(files: FileList) {
    if (files.length === 0) return
    setUploading(true)
    try {
      // Hitung sisa slot supaya tidak melebihi MAX_IMAGES total.
      const slots = MAX_IMAGES - form.images.length
      if (slots <= 0) {
        toast.error(`Maksimal ${MAX_IMAGES} foto`)
        return
      }
      const list = Array.from(files).slice(0, slots)
      if (files.length > slots) {
        toast.error(
          `Hanya ${slots} foto yang ditambahkan (sisa slot dari ${MAX_IMAGES}).`,
        )
      }
      const urls: string[] = []
      for (const file of list) {
        const url = await uploadOne(file)
        if (url) urls.push(url)
      }
      if (urls.length > 0) {
        setForm((f) => ({ ...f, images: [...f.images, ...urls] }))
        toast.success(`${urls.length} foto diupload`)
      }
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setUploading(false)
    }
  }

  function removeImage(index: number) {
    setForm((f) => ({
      ...f,
      images: f.images.filter((_, i) => i !== index),
    }))
  }

  function moveImage(index: number, direction: -1 | 1) {
    setForm((f) => {
      const next = [...f.images]
      const target = index + direction
      if (target < 0 || target >= next.length) return f
      ;[next[index], next[target]] = [next[target], next[index]]
      return { ...f, images: next }
    })
  }

  function setCover(index: number) {
    setForm((f) => {
      if (index === 0 || index >= f.images.length) return f
      const next = [...f.images]
      const [chosen] = next.splice(index, 1)
      next.unshift(chosen)
      return { ...f, images: next }
    })
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error('Nama produk wajib diisi')
      return
    }
    if (form.price < 0) {
      toast.error('Harga tidak boleh negatif')
      return
    }
    if (form.weightGrams < 1) {
      toast.error('Berat minimal 1 gram')
      return
    }
    // Validasi varian — semua row harus punya nama + harga ≥0 + berat ≥1.
    for (let i = 0; i < form.variants.length; i++) {
      const v = form.variants[i]
      if (!v.name.trim()) {
        toast.error(`Varian #${i + 1}: nama wajib diisi`)
        return
      }
      if (v.price < 0) {
        toast.error(`Varian "${v.name}": harga tidak boleh negatif`)
        return
      }
      if (v.weightGrams < 1) {
        toast.error(`Varian "${v.name}": berat minimal 1 gram`)
        return
      }
    }
    // Validasi flash sale di client supaya error message kelihatan langsung.
    if (form.flashSaleActive) {
      const hasVariants = form.variants.length > 0
      if (hasVariants) {
        // Produk bervarian: harga flash diisi per varian (minimal satu).
        const withFlash = form.variants.filter(
          (v) => v.flashSalePrice != null && v.flashSalePrice > 0,
        )
        if (withFlash.length === 0) {
          toast.error(
            'Isi "Harga Flash" minimal di satu varian (kolom di tiap varian)',
          )
          return
        }
        for (const v of withFlash) {
          if ((v.flashSalePrice ?? 0) >= v.price) {
            toast.error(
              `Varian "${v.name}": harga flash harus < harga normal varian`,
            )
            return
          }
        }
      } else if (
        !form.flashSalePrice ||
        Number(form.flashSalePrice) <= 0 ||
        Number(form.flashSalePrice) >= Number(form.price)
      ) {
        toast.error('Harga flash sale harus > 0 dan < harga normal')
        return
      }
      if (!form.flashSaleStartLocal || !form.flashSaleEndLocal) {
        toast.error('Tanggal mulai & selesai flash sale wajib diisi')
        return
      }
      if (
        new Date(form.flashSaleStartLocal) >= new Date(form.flashSaleEndLocal)
      ) {
        toast.error('Tanggal mulai harus sebelum selesai')
        return
      }
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: Number(form.price),
        weightGrams: Number(form.weightGrams),
        // Server akan derive cover (imageUrl) dari images[0] secara otomatis.
        images: form.images,
        stock: unlimitedStock ? null : Number(form.stock ?? 0),
        isActive: form.isActive,
        flashSaleActive: form.flashSaleActive,
        // Produk bervarian: harga flash per varian — level produk dikirim
        // null supaya tidak membingungkan pricing engine.
        flashSalePrice:
          form.flashSaleActive && form.variants.length === 0
            ? Number(form.flashSalePrice)
            : null,
        flashSaleStartAt: form.flashSaleActive
          ? localInputToIso(form.flashSaleStartLocal)
          : null,
        flashSaleEndAt: form.flashSaleActive
          ? localInputToIso(form.flashSaleEndLocal)
          : null,
        flashSaleQuota:
          form.flashSaleActive && form.flashSaleQuota !== ''
            ? Number(form.flashSaleQuota)
            : null,
        variants: form.variants.map((v, idx) => ({
          ...(v.id ? { id: v.id } : {}),
          name: v.name.trim(),
          sku: v.sku.trim() || null,
          price: Number(v.price),
          // Kirim null kalau kosong/0 ATAU flash sale produk sedang off —
          // supaya tidak ada harga flash "nyangkut" saat toggle dimatikan.
          flashSalePrice:
            form.flashSaleActive &&
            v.flashSalePrice != null &&
            v.flashSalePrice > 0
              ? Number(v.flashSalePrice)
              : null,
          weightGrams: Number(v.weightGrams),
          stock: v.stock == null ? null : Number(v.stock),
          imageUrl: v.imageUrl,
          isActive: v.isActive,
          sortOrder: idx,
        })),
        ebookId: form.ebookId,
      }
      const url = editingId ? `/api/products/${editingId}` : '/api/products'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menyimpan')
        return
      }
      await refreshList()
      toast.success(editingId ? 'Produk diperbarui' : 'Produk ditambahkan')
      setDialogOpen(false)
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/products/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menghapus')
        return
      }
      await refreshList()
      toast.success('Produk dihapus')
      setDeleteTarget(null)
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mt-4">
      <div className="mb-4">
        <OnboardingHint
          hintId="products"
          relevantFor={['SELL_LP', 'SELL_WA', 'LMS']}
          matchMessage="Tambahkan produk pertamamu di sini — bisa fisik (skincare, fashion) atau digital (course, e-book). Foto + harga + berat aja udah cukup buat mulai."
          mismatchMessage="Halaman ini buat yang jualan produk. Kalau cuma butuh CS AI menjawab WhatsApp, kamu bisa skip menu ini."
        />
      </div>

      <PageHeader
        className="mb-6"
        title="Produk"
        description={
          <>
            Kelola produk yang tampil di Form Order kamu.
            <span className="text-warm-500 ml-1">
              ({products.length}/{limit})
            </span>
          </>
        }
        actions={
          <Button onClick={openCreate} disabled={products.length >= limit}>
            <Plus className="mr-2 size-4" />
            Tambah Produk
          </Button>
        }
      />

      {products.length === 0 ? (
        <EmptyState
          bordered
          icon={Package}
          title="Belum ada produk"
          description="Tambahkan produk pertama untuk dijual via Form Order."
          action={
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              Tambah Produk Pertama
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {products.map((p) => (
            <Card key={p.id} className={p.isActive ? '' : 'opacity-60'}>
              <CardContent className="flex gap-3 p-4">
                <div className="bg-warm-100 relative size-20 shrink-0 overflow-hidden rounded-lg">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="text-warm-400 flex size-full items-center justify-center">
                      <ImageIcon className="size-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-warm-900 truncate font-semibold">
                      {p.name}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {p.variants && p.variants.length > 0 && (
                        <Badge className="bg-primary-100 text-primary-800 hover:bg-primary-100">
                          <Layers className="mr-0.5 size-3" />
                          {p.variants.length} varian
                        </Badge>
                      )}
                      {p.flashSaleActive && (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          <Zap className="mr-0.5 size-3" /> Flash
                        </Badge>
                      )}
                      {!p.isActive && <Badge variant="secondary">Off</Badge>}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    {p.flashSaleActive && p.flashSalePrice ? (
                      <>
                        <p className="text-sm font-medium text-amber-700">
                          Rp {formatNumber(p.flashSalePrice)}
                        </p>
                        <p className="text-warm-500 text-xs line-through">
                          Rp {formatNumber(p.price)}
                        </p>
                      </>
                    ) : (
                      <p className="text-primary-600 text-sm font-medium">
                        Rp {formatNumber(p.price)}
                      </p>
                    )}
                  </div>
                  <p className="text-warm-500 text-xs">
                    {p.weightGrams} g ·{' '}
                    {p.stock === null
                      ? 'Stok unlimited'
                      : `Stok: ${formatNumber(p.stock)}`}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(p)}
                    >
                      <Edit3 className="mr-1 size-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() =>
                        setDeleteTarget({ id: p.id, name: p.name })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl lg:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Produk' : 'Tambah Produk'}
            </DialogTitle>
            <DialogDescription>
              Atur nama, harga, berat, stok, dan foto produk untuk dijual via
              Form Order.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Nama Produk</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Cleanoz 12ml"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="p-desc">Deskripsi (opsional)</Label>
              <Textarea
                id="p-desc"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Detail singkat produk yang tampil di form"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-price">Harga (Rp)</Label>
                <Input
                  id="p-price"
                  type="number"
                  min={0}
                  step={500}
                  value={form.price}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      price: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-weight">Berat (gram)</Label>
                <Input
                  id="p-weight"
                  type="number"
                  min={1}
                  step={50}
                  value={form.weightGrams}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      weightGrams: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Foto Produk</Label>
                <span className="text-warm-500 text-xs">
                  {form.images.length}/{MAX_IMAGES}
                </span>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleUpload(e.target.files)
                  }
                  e.target.value = ''
                }}
              />
              {form.images.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="bg-warm-50 text-warm-500 hover:bg-warm-100 flex h-32 w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors disabled:opacity-60"
                >
                  <Upload className="size-6" />
                  <span className="text-sm">
                    {uploading
                      ? 'Mengunggah…'
                      : 'Pilih foto (bisa pilih banyak sekaligus)'}
                  </span>
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                  {form.images.map((url, idx) => (
                    <div
                      key={`${url}-${idx}`}
                      className={`group bg-warm-50 relative aspect-square overflow-hidden rounded-lg border ${
                        idx === 0 ? 'ring-primary-500 ring-2' : ''
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Foto produk #${idx + 1}`}
                        className="size-full object-cover"
                      />
                      {idx === 0 && (
                        <span className="bg-primary-600 absolute top-1 left-1 rounded px-1.5 py-0.5 text-xs font-bold tracking-wide text-white uppercase">
                          Cover
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/55 p-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          aria-label="Geser kiri"
                          onClick={() => moveImage(idx, -1)}
                          disabled={idx === 0}
                          className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-40"
                        >
                          <ArrowLeft className="size-3.5" />
                        </button>
                        {idx !== 0 && (
                          <button
                            type="button"
                            aria-label="Jadikan cover"
                            title="Jadikan cover"
                            onClick={() => setCover(idx)}
                            className="rounded p-1 text-white hover:bg-white/20"
                          >
                            <Star className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label="Hapus foto"
                          onClick={() => removeImage(idx)}
                          className="rounded p-1 text-red-200 hover:bg-red-500/40"
                        >
                          <X className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Geser kanan"
                          onClick={() => moveImage(idx, 1)}
                          disabled={idx === form.images.length - 1}
                          className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-40"
                        >
                          <ArrowRight className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {form.images.length < MAX_IMAGES && (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="bg-warm-50 text-warm-500 hover:bg-warm-100 flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed transition-colors disabled:opacity-60"
                    >
                      <Plus className="size-5" />
                      <span className="text-xs">
                        {uploading ? 'Upload…' : 'Tambah'}
                      </span>
                    </button>
                  )}
                </div>
              )}
              <p className="text-warm-500 text-xs">
                JPG / PNG / WebP, max 8 MB per foto. Maksimal {MAX_IMAGES} foto.
                Foto pertama jadi cover di list & invoice. Klik bintang untuk
                set sebagai cover.
              </p>
            </div>

            <div className="bg-warm-50 space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer text-sm">Stok Unlimited</Label>
                <Switch
                  checked={unlimitedStock}
                  onCheckedChange={setUnlimitedStock}
                />
              </div>
              {!unlimitedStock && (
                <Input
                  type="number"
                  min={0}
                  value={form.stock ?? 0}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      stock: Number(e.target.value) || 0,
                    }))
                  }
                  placeholder="Jumlah stok"
                />
              )}
              <p className="text-warm-500 text-xs">
                Stok akan auto-kurang saat order PAID. Set unlimited untuk
                produk digital atau pre-order.
              </p>
            </div>

            <div className="bg-warm-50 flex items-center justify-between rounded-lg border px-3 py-2">
              <Label className="cursor-pointer text-sm">
                Aktif (tampil di Form Order)
              </Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>

            {/* E-Book section (2026-08-06) */}
            <EbookSection
              productId={editingId}
              ebookId={form.ebookId}
              onChange={(id) => setForm((f) => ({ ...f, ebookId: id }))}
            />

            {/* Varian section (Phase 5) */}
            <div className="border-primary-200 bg-primary-50 space-y-3 rounded-lg border-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Label className="text-primary-900 flex items-center gap-2 text-sm font-semibold">
                    <Layers className="size-4" />
                    Varian Produk
                  </Label>
                  <p className="text-primary-800 mt-1 text-xs">
                    Optional. Kalau diisi, customer harus pilih salah satu di
                    Form Order. Harga & stok utama di atas akan diabaikan.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addVariant}
                  disabled={form.variants.length >= VARIANT_LIMIT}
                  className="shrink-0"
                >
                  <Plus className="mr-1 size-3.5" />
                  Tambah Varian
                </Button>
              </div>

              {form.variants.length === 0 ? (
                <p className="border-primary-300 text-primary-800 rounded border border-dashed bg-white/60 px-3 py-4 text-center text-xs">
                  Belum ada varian. Klik &ldquo;Tambah Varian&rdquo; untuk bikin
                  opsi seperti ukuran (12ml/30ml), warna+ukuran (Putih M), atau
                  paket bundling.
                </p>
              ) : (
                <ul className="space-y-3">
                  {form.variants.map((v, idx) => (
                    <li
                      key={v.tempKey}
                      className="border-primary-200 rounded-lg border bg-white p-3"
                    >
                      <div className="flex items-start gap-2">
                        <div className="text-primary-300 mt-2 hidden md:block">
                          <GripVertical className="size-4" />
                        </div>

                        {/* Foto varian (96px) */}
                        <div className="bg-warm-50 size-20 shrink-0 overflow-hidden rounded-lg border">
                          {v.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={v.imageUrl}
                              alt={`Foto varian ${v.name || idx + 1}`}
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="text-warm-400 flex size-full items-center justify-center">
                              <ImageIcon className="size-6" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-primary-900 text-xs">
                                Nama Varian
                              </Label>
                              <Input
                                value={v.name}
                                onChange={(e) =>
                                  updateVariant(v.tempKey, {
                                    name: e.target.value,
                                  })
                                }
                                placeholder="Contoh: 30ml / Putih M / Paket 2 botol"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-primary-900 text-xs">
                                SKU (opsional)
                              </Label>
                              <Input
                                value={v.sku}
                                onChange={(e) =>
                                  updateVariant(v.tempKey, {
                                    sku: e.target.value,
                                  })
                                }
                                placeholder="CLN-30"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-primary-900 text-xs">
                                Harga (Rp)
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                step={500}
                                value={v.price}
                                onChange={(e) =>
                                  updateVariant(v.tempKey, {
                                    price: Number(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-primary-900 text-xs">
                                Berat (g)
                              </Label>
                              <Input
                                type="number"
                                min={1}
                                step={50}
                                value={v.weightGrams}
                                onChange={(e) =>
                                  updateVariant(v.tempKey, {
                                    weightGrams: Number(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-primary-900 text-xs">
                                Stok
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                value={v.stock ?? ''}
                                placeholder="∞"
                                onChange={(e) =>
                                  updateVariant(v.tempKey, {
                                    stock:
                                      e.target.value === ''
                                        ? null
                                        : Number(e.target.value) || 0,
                                  })
                                }
                              />
                            </div>
                          </div>

                          {form.flashSaleActive && (
                            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2">
                              <Label className="flex items-center gap-1 text-xs font-semibold text-amber-900">
                                <Zap className="size-3" />
                                Harga Flash (Rp)
                              </Label>
                              <Input
                                type="number"
                                min={0}
                                step={500}
                                value={v.flashSalePrice ?? ''}
                                placeholder="Kosongkan = tidak ikut flash"
                                onChange={(e) =>
                                  updateVariant(v.tempKey, {
                                    flashSalePrice:
                                      e.target.value === ''
                                        ? null
                                        : Number(e.target.value) || 0,
                                  })
                                }
                              />
                              {v.flashSalePrice != null &&
                                v.flashSalePrice > 0 &&
                                v.flashSalePrice < v.price && (
                                  <p className="text-xs text-amber-800">
                                    Hemat Rp{' '}
                                    {formatNumber(v.price - v.flashSalePrice)} (
                                    {Math.round(
                                      (1 - v.flashSalePrice / v.price) * 100,
                                    )}
                                    %)
                                  </p>
                                )}
                            </div>
                          )}

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-2">
                              <Label className="text-primary-900 cursor-pointer text-xs">
                                Aktif
                              </Label>
                              <Switch
                                checked={v.isActive}
                                onCheckedChange={(c) =>
                                  updateVariant(v.tempKey, { isActive: c })
                                }
                              />
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <label className="inline-flex">
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  className="hidden"
                                  onChange={(e) => {
                                    const f = e.target.files?.[0]
                                    if (f) handleVariantUpload(v.tempKey, f)
                                    e.target.value = ''
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  asChild
                                >
                                  <span className="cursor-pointer">
                                    <Upload className="mr-1 size-3.5" />
                                    {v.imageUrl ? 'Ganti foto' : 'Foto varian'}
                                  </span>
                                </Button>
                              </label>
                              {v.imageUrl && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:bg-destructive/10"
                                  onClick={() =>
                                    updateVariant(v.tempKey, { imageUrl: null })
                                  }
                                >
                                  Hapus foto
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:bg-destructive/10"
                                onClick={() => removeVariant(v.tempKey)}
                              >
                                <Trash2 className="mr-1 size-3.5" />
                                Hapus
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Flash Sale section */}
            <div className="space-y-3 rounded-lg border-2 border-amber-200 bg-amber-50 p-3">
              <div className="flex items-center justify-between">
                <Label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-amber-900">
                  <Zap className="size-4" />
                  Flash Sale
                </Label>
                <Switch
                  checked={form.flashSaleActive}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, flashSaleActive: v }))
                  }
                />
              </div>

              {form.flashSaleActive && (
                <div className="space-y-3">
                  {form.variants.length > 0 ? (
                    <p className="rounded-md border border-amber-300 bg-white/70 px-3 py-2 text-xs text-amber-900">
                      Produk ini punya varian — isi <strong>Harga Flash</strong>{' '}
                      di masing-masing varian (kolom kuning di tiap varian di
                      atas). Varian yang dikosongkan tetap pakai harga normal.
                      Jadwal & kuota di bawah berlaku untuk semua varian.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <Label htmlFor="fs-price" className="text-amber-900">
                        Harga Diskon (Rp)
                      </Label>
                      <Input
                        id="fs-price"
                        type="number"
                        min={0}
                        step={500}
                        value={form.flashSalePrice}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            flashSalePrice: Number(e.target.value) || 0,
                          }))
                        }
                      />
                      {form.flashSalePrice > 0 &&
                        form.flashSalePrice < form.price && (
                          <p className="text-xs text-amber-800">
                            Hemat Rp{' '}
                            {formatNumber(
                              form.price - Number(form.flashSalePrice),
                            )}{' '}
                            (
                            {Math.round(
                              (1 - Number(form.flashSalePrice) / form.price) *
                                100,
                            )}
                            %)
                          </p>
                        )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="fs-start" className="text-amber-900">
                        Mulai
                      </Label>
                      <Input
                        id="fs-start"
                        type="datetime-local"
                        value={form.flashSaleStartLocal}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            flashSaleStartLocal: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="fs-end" className="text-amber-900">
                        Selesai
                      </Label>
                      <Input
                        id="fs-end"
                        type="datetime-local"
                        value={form.flashSaleEndLocal}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            flashSaleEndLocal: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="fs-quota" className="text-amber-900">
                      Kuota (opsional)
                    </Label>
                    <Input
                      id="fs-quota"
                      type="number"
                      min={1}
                      value={form.flashSaleQuota}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          flashSaleQuota: e.target.value,
                        }))
                      }
                      placeholder="Kosongkan = unlimited"
                    />
                    <p className="text-xs text-amber-800">
                      Flash sale otomatis berakhir saat kuota habis atau waktu
                      lewat — mana yang duluan.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={saving || uploading}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        title="Hapus produk ini?"
        description={
          <>
            Hapus produk <strong>{deleteTarget?.name}</strong>? Tindakan ini
            tidak bisa dibatalkan.
          </>
        }
        isLoading={isDeleting}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
