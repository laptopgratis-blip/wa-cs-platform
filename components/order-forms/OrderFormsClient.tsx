'use client'

// CRUD form order publik. User pilih produk dari list yg sudah ada di /products,
// generate slug, dapat shareable link.
import {
  Activity,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  MessageSquare,
  Plus,
  ShoppingBag,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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

interface OrderForm {
  id: string
  slug: string
  name: string
  description: string | null
  productIds: string[]
  acceptCod: boolean
  acceptTransfer: boolean
  shippingFlatCod: number | null
  requireShipping: boolean
  showFlashSaleCounter: boolean
  showShippingPromo: boolean
  socialProofEnabled: boolean
  // Disimpan di DB sebagai String free-form. UI normalize ke 'top'|'bottom'
  // saat openEdit() — selain dua nilai itu jatuh ke 'bottom'.
  socialProofPosition: string
  socialProofIntervalSec: number
  socialProofShowTime: boolean
  enabledPixelIds: string[]
  isActive: boolean
  views: number
  submissions: number
  createdAt: string
}

interface ProductLite {
  id: string
  name: string
  price: number
  imageUrl: string | null
}

interface PixelLite {
  id: string
  platform: string
  displayName: string
  serverSideEnabled: boolean
}

interface OrderFormsClientProps {
  initialForms: OrderForm[]
  products: ProductLite[]
  pixels: PixelLite[]
  limit: number
}

const PIXEL_PLATFORM_EMOJI: Record<string, string> = {
  META: '📘',
  GOOGLE_ADS: '🎯',
  GA4: '📊',
  TIKTOK: '🎵',
}

const EMPTY_FORM = {
  name: '',
  description: '',
  productIds: [] as string[],
  acceptCod: true,
  acceptTransfer: true,
  shippingFlatCod: '' as string | number,
  requireShipping: true,
  showFlashSaleCounter: true,
  showShippingPromo: true,
  socialProofEnabled: false,
  socialProofPosition: 'bottom' as 'top' | 'bottom',
  socialProofIntervalSec: 8,
  socialProofShowTime: true,
  enabledPixelIds: [] as string[],
  isActive: true,
}

export function OrderFormsClient({
  initialForms,
  products,
  pixels,
  limit,
}: OrderFormsClientProps) {
  const [forms, setForms] = useState<OrderForm[]>(initialForms)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(f: OrderForm) {
    setEditingId(f.id)
    setForm({
      name: f.name,
      description: f.description ?? '',
      productIds: f.productIds,
      acceptCod: f.acceptCod,
      acceptTransfer: f.acceptTransfer,
      shippingFlatCod: f.shippingFlatCod ?? '',
      requireShipping: f.requireShipping,
      showFlashSaleCounter: f.showFlashSaleCounter,
      showShippingPromo: f.showShippingPromo,
      socialProofEnabled: f.socialProofEnabled,
      socialProofPosition: f.socialProofPosition === 'top' ? 'top' : 'bottom',
      socialProofIntervalSec: f.socialProofIntervalSec,
      socialProofShowTime: f.socialProofShowTime,
      enabledPixelIds: f.enabledPixelIds,
      isActive: f.isActive,
    })
    setDialogOpen(true)
  }

  function togglePixel(id: string) {
    setForm((f) => ({
      ...f,
      enabledPixelIds: f.enabledPixelIds.includes(id)
        ? f.enabledPixelIds.filter((x) => x !== id)
        : [...f.enabledPixelIds, id],
    }))
  }

  function toggleProduct(id: string) {
    setForm((f) => ({
      ...f,
      productIds: f.productIds.includes(id)
        ? f.productIds.filter((x) => x !== id)
        : [...f.productIds, id],
    }))
  }

  async function refreshList() {
    const res = await fetch('/api/order-forms')
    const data = await res.json()
    if (data.success) setForms(data.data.items)
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error('Nama form wajib diisi')
      return
    }
    if (!form.acceptCod && !form.acceptTransfer) {
      toast.error('Pilih minimal 1 metode pembayaran')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        productIds: form.productIds,
        acceptCod: form.acceptCod,
        acceptTransfer: form.acceptTransfer,
        shippingFlatCod:
          form.shippingFlatCod === ''
            ? null
            : Number(form.shippingFlatCod) || 0,
        requireShipping: form.requireShipping,
        showFlashSaleCounter: form.showFlashSaleCounter,
        showShippingPromo: form.showShippingPromo,
        socialProofEnabled: form.socialProofEnabled,
        socialProofPosition: form.socialProofPosition,
        socialProofIntervalSec: form.socialProofIntervalSec,
        socialProofShowTime: form.socialProofShowTime,
        enabledPixelIds: form.enabledPixelIds,
        isActive: form.isActive,
      }
      const url = editingId
        ? `/api/order-forms/${editingId}`
        : '/api/order-forms'
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
      toast.success(editingId ? 'Form diperbarui' : 'Form ditambahkan')
      setDialogOpen(false)
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Hapus form "${name}"?`)) return
    try {
      const res = await fetch(`/api/order-forms/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menghapus')
        return
      }
      await refreshList()
      toast.success('Form dihapus')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    }
  }

  function copyLink(slug: string) {
    const url = `${window.location.origin}/order/${slug}`
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('Link disalin'))
      .catch(() => toast.error('Gagal menyalin'))
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 md:py-8">
      <div className="mb-6 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-warm-900 md:text-3xl">
            Form Order
          </h1>
          <p className="mt-1 text-sm text-warm-600">
            Buat form publik untuk customer order — share link, mereka isi,
            kamu dapat invoice otomatis.
            <span className="ml-1 text-warm-500">
              ({forms.length}/{limit})
            </span>
          </p>
        </div>
        <Button
          onClick={openCreate}
          disabled={forms.length >= limit || products.length === 0}
        >
          <Plus className="mr-2 size-4" />
          Buat Form Order
        </Button>
      </div>

      {products.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Kamu belum punya produk aktif. Tambahkan produk dulu di{' '}
          <a href="/products" className="font-semibold underline">
            /products
          </a>{' '}
          sebelum bikin form order.
        </div>
      )}

      {forms.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <FileText className="mb-3 size-10 text-warm-400" />
            <p className="font-medium text-warm-700">Belum ada form order</p>
            <p className="mt-1 text-sm text-warm-500">
              Buat form pertama untuk dijual via link share ke customer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {forms.map((f) => {
            const linkedCount =
              f.productIds.length === 0
                ? products.length
                : f.productIds.length
            return (
              <Card key={f.id} className={f.isActive ? '' : 'opacity-60'}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-warm-900">{f.name}</p>
                        {!f.isActive && <Badge variant="secondary">Off</Badge>}
                        {f.acceptCod && (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            COD
                          </Badge>
                        )}
                        {f.acceptTransfer && (
                          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                            Transfer
                          </Badge>
                        )}
                      </div>
                      {f.description && (
                        <p className="mt-1 line-clamp-2 text-sm text-warm-600">
                          {f.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-warm-500">
                        <span className="flex items-center gap-1">
                          <ShoppingBag className="size-3.5" />
                          {linkedCount} produk
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="size-3.5" />
                          {f.views} kunjungan
                        </span>
                        <span>{f.submissions} order</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyLink(f.slug)}
                      >
                        <Copy className="mr-1 size-3.5" /> Salin Link
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <a
                          href={`/order/${f.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-1 size-3.5" /> Buka
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(f)}
                      >
                        <Edit3 className="mr-1 size-3.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(f.id, f.name)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-warm-50 px-3 py-2 font-mono text-xs text-warm-700">
                    {typeof window !== 'undefined'
                      ? `${window.location.origin}/order/${f.slug}`
                      : `/order/${f.slug}`}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl lg:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Form Order' : 'Buat Form Order'}
            </DialogTitle>
            <DialogDescription>
              Form akan tampil publik di link /order/&lt;slug&gt;. Customer
              order tanpa perlu daftar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="of-name">Nama Form</Label>
              <Input
                id="of-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Order Cleanoz"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="of-desc">Deskripsi (opsional)</Label>
              <Textarea
                id="of-desc"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Promo bulan ini, gratis ongkir Bandung minimal Rp 100K…"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Produk yang Ditampilkan</Label>
              <div className="max-h-56 overflow-y-auto rounded-lg border">
                {products.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-warm-500">
                    Belum ada produk aktif.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {products.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-warm-50">
                          <Checkbox
                            checked={form.productIds.includes(p.id)}
                            onCheckedChange={() => toggleProduct(p.id)}
                          />
                          <span className="flex-1 text-sm">
                            {p.name}{' '}
                            <span className="text-warm-500">
                              · Rp {formatNumber(p.price)}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <p className="text-xs text-warm-500">
                Centang produk yang mau ditampilkan di form ini. Kosongkan
                semua = tampilkan semua produk aktif.
              </p>
            </div>

            <div className="space-y-2 rounded-lg border bg-warm-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Label className="cursor-pointer text-sm">
                    Butuh alamat pengiriman
                  </Label>
                  <p className="text-xs text-warm-500">
                    Matikan untuk produk digital (e-book, voucher, lisensi).
                    Customer tidak diminta alamat & ongkir di-skip.
                  </p>
                </div>
                <Switch
                  checked={form.requireShipping}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, requireShipping: v }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-warm-50 px-3 py-2">
                <Checkbox
                  checked={form.acceptCod}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, acceptCod: !!v }))
                  }
                  disabled={!form.requireShipping}
                />
                <span className="text-sm font-medium">
                  Terima COD
                  {!form.requireShipping && (
                    <span className="ml-1 text-xs font-normal text-warm-500">
                      (tidak relevan untuk produk digital)
                    </span>
                  )}
                </span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-warm-50 px-3 py-2">
                <Checkbox
                  checked={form.acceptTransfer}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, acceptTransfer: !!v }))
                  }
                />
                <span className="text-sm font-medium">Terima Transfer</span>
              </label>
            </div>

            {form.acceptCod && form.requireShipping && (
              <div className="space-y-1.5">
                <Label htmlFor="of-cod-flat">
                  Ongkir Flat untuk COD (Rp, opsional)
                </Label>
                <Input
                  id="of-cod-flat"
                  type="number"
                  min={0}
                  placeholder="Kosongkan untuk pakai RajaOngkir"
                  value={form.shippingFlatCod}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, shippingFlatCod: e.target.value }))
                  }
                />
                <p className="text-xs text-warm-500">
                  Banyak seller pakai flat untuk COD karena kurir COD beda.
                  Kosongkan kalau mau pakai ongkir RajaOngkir untuk semua
                  payment.
                </p>
              </div>
            )}

            <div className="space-y-2 rounded-lg border bg-warm-50 p-3">
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer text-sm">
                  Tampilkan counter Flash Sale
                </Label>
                <Switch
                  checked={form.showFlashSaleCounter}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, showFlashSaleCounter: v }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer text-sm">
                  Tampilkan info promo ongkir
                </Label>
                <Switch
                  checked={form.showShippingPromo}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, showShippingPromo: v }))
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer text-sm">
                  Aktif (terima order baru)
                </Label>
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, isActive: v }))
                  }
                />
              </div>
            </div>

            {/* Social Proof section */}
            <div className="space-y-3 rounded-lg border-2 border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Label className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                    <MessageSquare className="size-4" />
                    Social Proof
                  </Label>
                  <p className="mt-1 text-xs text-emerald-800">
                    Tampilkan popup pembeli sebelumnya untuk meyakinkan
                    customer (mis. &ldquo;Budi - Surabaya - telah melakukan
                    pembelian&rdquo;). Data otomatis dari order PAID.
                  </p>
                </div>
                <Switch
                  checked={form.socialProofEnabled}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, socialProofEnabled: v }))
                  }
                />
              </div>

              {form.socialProofEnabled && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-emerald-900">
                      Posisi Popup
                    </Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({ ...f, socialProofPosition: 'top' }))
                        }
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          form.socialProofPosition === 'top'
                            ? 'border-emerald-500 bg-white font-semibold text-emerald-900'
                            : 'border-emerald-200 bg-white/60 text-emerald-700 hover:bg-white'
                        }`}
                      >
                        Atas
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            socialProofPosition: 'bottom',
                          }))
                        }
                        className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                          form.socialProofPosition === 'bottom'
                            ? 'border-emerald-500 bg-white font-semibold text-emerald-900'
                            : 'border-emerald-200 bg-white/60 text-emerald-700 hover:bg-white'
                        }`}
                      >
                        Bawah
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="of-sp-interval"
                      className="text-xs text-emerald-900"
                    >
                      Kecepatan Tampil (detik antar popup)
                    </Label>
                    <Input
                      id="of-sp-interval"
                      type="number"
                      min={3}
                      max={30}
                      step={1}
                      value={form.socialProofIntervalSec}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          socialProofIntervalSec: Math.max(
                            3,
                            Math.min(30, Number(e.target.value) || 8),
                          ),
                        }))
                      }
                    />
                    <p className="text-xs text-emerald-800">
                      Range 3-30 detik. Lebih kecil = lebih sering muncul.
                      Recommended: 6-10 detik supaya tidak mengganggu.
                    </p>
                  </div>

                  <div className="rounded-md border border-emerald-300 bg-white px-3 py-2">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="checkbox"
                        checked={form.socialProofShowTime}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            socialProofShowTime: e.target.checked,
                          }))
                        }
                        className="mt-0.5 size-4 cursor-pointer accent-emerald-600"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-emerald-900">
                          Tampilkan waktu pembelian
                        </p>
                        <p className="text-xs text-emerald-800">
                          Saat <strong>ON</strong>: muncul &quot;… ·{' '}
                          <span className="font-mono">2 hari lalu</span>&quot;.
                          Saat <strong>OFF</strong>: tanpa timestamp — cocok
                          kalau pembeli terakhirnya sudah lama (supaya tidak
                          counter-productive untuk konversi).
                        </p>
                      </div>
                    </label>
                  </div>

                  <p className="rounded border border-dashed border-emerald-300 bg-white/70 px-3 py-2 text-xs text-emerald-800">
                    Privacy: hanya nama depan + nama kota yang ditampilkan.
                    Order yang tampil: status PAID dari 60 hari terakhir.
                  </p>
                </div>
              )}
            </div>

            {/* Pixel Tracking section */}
            <div className="space-y-2 rounded-lg border-2 border-purple-200 bg-purple-50 p-3">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-purple-700" />
                <Label className="text-sm font-semibold text-purple-900">
                  Pixel Tracking
                </Label>
              </div>
              <p className="text-xs text-purple-800">
                Pilih pixel yang akan track form ini. Customer akan otomatis
                ter-track di Meta/Google/TikTok yang kamu centang.
              </p>
              {pixels.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-white p-3 text-center text-sm text-warm-600">
                  Belum ada pixel.{' '}
                  <Link
                    href="/integrations/pixels"
                    className="font-semibold text-primary-600 underline"
                  >
                    Setup pixel di sini →
                  </Link>
                </div>
              ) : (
                <ul className="space-y-1">
                  {pixels.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 hover:bg-purple-100">
                        <Checkbox
                          checked={form.enabledPixelIds.includes(p.id)}
                          onCheckedChange={() => togglePixel(p.id)}
                        />
                        <span className="text-sm">
                          {PIXEL_PLATFORM_EMOJI[p.platform] ?? '📊'}{' '}
                          <span className="font-medium">{p.displayName}</span>
                          {p.serverSideEnabled && (
                            <Badge className="ml-1 bg-emerald-100 text-emerald-800 text-[10px] hover:bg-emerald-100">
                              CAPI
                            </Badge>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
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
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
