'use client'

// CRUD produk untuk Order System. Phase 2: tanpa flash sale UI (field di DB
// disiapkan, UI input masuk Phase 4).
import {
  Edit3,
  Image as ImageIcon,
  Package,
  Plus,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react'
import Image from 'next/image'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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

interface Product {
  id: string
  name: string
  description: string | null
  price: number
  weightGrams: number
  imageUrl: string | null
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
  imageUrl: null as string | null,
  stock: null as number | null,
  isActive: true,
  flashSaleActive: false,
  flashSalePrice: 0,
  flashSaleStartLocal: '',
  flashSaleEndLocal: '',
  flashSaleQuota: '' as string | number,
}

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
      imageUrl: p.imageUrl,
      stock: p.stock,
      isActive: p.isActive,
      flashSaleActive: p.flashSaleActive,
      flashSalePrice: p.flashSalePrice ?? 0,
      flashSaleStartLocal: isoToLocalInput(p.flashSaleStartAt),
      flashSaleEndLocal: isoToLocalInput(p.flashSaleEndAt),
      flashSaleQuota: p.flashSaleQuota ?? '',
    })
    setUnlimitedStock(p.stock === null)
    setDialogOpen(true)
  }

  async function refreshList() {
    const res = await fetch('/api/products')
    const data = await res.json()
    if (data.success) setProducts(data.data.items)
  }

  async function handleUpload(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Ukuran maksimal 8 MB')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/products/upload', {
        method: 'POST',
        body: fd,
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal upload')
        return
      }
      setForm((f) => ({ ...f, imageUrl: data.data.url }))
      toast.success('Foto diupload')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setUploading(false)
    }
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
    // Validasi flash sale di client supaya error message kelihatan langsung.
    if (form.flashSaleActive) {
      if (
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
        new Date(form.flashSaleStartLocal) >=
        new Date(form.flashSaleEndLocal)
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
        imageUrl: form.imageUrl,
        stock: unlimitedStock ? null : Number(form.stock ?? 0),
        isActive: form.isActive,
        flashSaleActive: form.flashSaleActive,
        flashSalePrice: form.flashSaleActive
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
      }
      const url = editingId
        ? `/api/products/${editingId}`
        : '/api/products'
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

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Hapus produk "${name}"?`)) return
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menghapus')
        return
      }
      await refreshList()
      toast.success('Produk dihapus')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    }
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 md:py-8">
      <div className="mb-6 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-warm-900 md:text-3xl">
            Produk
          </h1>
          <p className="mt-1 text-sm text-warm-600">
            Kelola produk yang tampil di Form Order kamu.
            <span className="ml-1 text-warm-500">
              ({products.length}/{limit})
            </span>
          </p>
        </div>
        <Button onClick={openCreate} disabled={products.length >= limit}>
          <Plus className="mr-2 size-4" />
          Tambah Produk
        </Button>
      </div>

      {products.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Package className="mb-3 size-10 text-warm-400" />
            <p className="font-medium text-warm-700">Belum ada produk</p>
            <p className="mt-1 text-sm text-warm-500">
              Tambahkan produk pertama untuk dijual via Form Order.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {products.map((p) => (
            <Card key={p.id} className={p.isActive ? '' : 'opacity-60'}>
              <CardContent className="flex gap-3 p-4">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-warm-100">
                  {p.imageUrl ? (
                    <Image
                      src={p.imageUrl}
                      alt={p.name}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-warm-400">
                      <ImageIcon className="size-6" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-semibold text-warm-900 truncate">
                      {p.name}
                    </p>
                    <div className="flex flex-wrap gap-1">
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
                        <p className="text-xs text-warm-500 line-through">
                          Rp {formatNumber(p.price)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-medium text-primary-600">
                        Rp {formatNumber(p.price)}
                      </p>
                    )}
                  </div>
                  <p className="text-xs text-warm-500">
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
                      onClick={() => handleDelete(p.id, p.name)}
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
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
                    setForm((f) => ({ ...f, price: Number(e.target.value) || 0 }))
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

            <div className="space-y-1.5">
              <Label>Foto Produk</Label>
              <div className="flex items-start gap-3">
                <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border bg-warm-50">
                  {form.imageUrl ? (
                    <Image
                      src={form.imageUrl}
                      alt="preview"
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-warm-400">
                      <ImageIcon className="size-7" />
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleUpload(f)
                      e.target.value = ''
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="mr-1 size-3.5" />
                    {uploading ? 'Mengunggah…' : 'Pilih Foto'}
                  </Button>
                  {form.imageUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm((f) => ({ ...f, imageUrl: null }))}
                      className="text-destructive hover:bg-destructive/10"
                    >
                      Hapus foto
                    </Button>
                  )}
                  <p className="text-xs text-warm-500">
                    JPG / PNG / WebP, max 8 MB. Otomatis dikompres ke WebP.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border bg-warm-50 p-3">
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer text-sm">
                  Stok Unlimited
                </Label>
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
                    setForm((f) => ({ ...f, stock: Number(e.target.value) || 0 }))
                  }
                  placeholder="Jumlah stok"
                />
              )}
              <p className="text-xs text-warm-500">
                Stok akan auto-kurang saat order PAID. Set unlimited untuk
                produk digital atau pre-order.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-warm-50 px-3 py-2">
              <Label className="cursor-pointer text-sm">
                Aktif (tampil di Form Order)
              </Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isActive: v }))
                }
              />
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
                          {formatNumber(form.price - Number(form.flashSalePrice))}{' '}
                          (
                          {Math.round(
                            (1 - Number(form.flashSalePrice) / form.price) * 100,
                          )}
                          %)
                        </p>
                      )}
                  </div>

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
    </div>
  )
}
