'use client'

// Client component untuk halaman /bank-accounts.
// Manajemen rekening user (multi-rekening) + setup WA Konfirmasi (nomor +
// template pesan). Server provide initial data; semua mutation lewat /api.
import {
  Building2,
  CreditCard,
  Edit3,
  MapPin,
  MessageCircle,
  Plus,
  Star,
  Trash2,
  Truck,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  DestinationPicker,
  type PickedDestination,
} from '@/components/order-system/DestinationPicker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SUPPORTED_COURIERS } from '@/lib/services/rajaongkir'
import { BANK_OPTIONS } from '@/lib/validations/bank-account'

interface BankAccount {
  id: string
  bankName: string
  accountNumber: string
  accountName: string
  isActive: boolean
  isDefault: boolean
  order: number
  createdAt: string
}

interface Profile {
  waConfirmNumber: string | null
  waConfirmTemplate: string | null
  waConfirmActive: boolean
  originCityId: string | null
  originCityName: string | null
  originProvinceName: string | null
  enabledCouriers: string[]
  defaultWeightGrams: number
}

interface BankAccountsClientProps {
  initialAccounts: BankAccount[]
  initialProfile: Profile
  limit: number
  defaultTemplate: string
}

export function BankAccountsClient({
  initialAccounts,
  initialProfile,
  limit,
  defaultTemplate,
}: BankAccountsClientProps) {
  const [accounts, setAccounts] = useState<BankAccount[]>(initialAccounts)
  const [profile, setProfile] = useState<Profile>(initialProfile)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    bankName: 'BCA',
    accountNumber: '',
    accountName: '',
    isActive: true,
    isDefault: false,
  })
  const [saving, setSaving] = useState(false)

  const [waForm, setWaForm] = useState({
    waConfirmNumber: profile.waConfirmNumber ?? '',
    waConfirmTemplate: profile.waConfirmTemplate ?? defaultTemplate,
    waConfirmActive: profile.waConfirmActive,
  })
  const [savingWa, setSavingWa] = useState(false)

  // Origin shipping state. Hydrate dari initial profile — kalau ada cityId,
  // bangun PickedDestination dari snapshot field yg sudah disimpan.
  const [origin, setOrigin] = useState<PickedDestination | null>(
    profile.originCityId
      ? {
          id: Number(profile.originCityId),
          label: profile.originCityName ?? '',
          province_name: profile.originProvinceName ?? '',
          city_name: '',
          district_name: '',
          subdistrict_name: '',
          zip_code: '',
        }
      : null,
  )
  const [enabledCouriers, setEnabledCouriers] = useState<string[]>(
    profile.enabledCouriers,
  )
  const [defaultWeight, setDefaultWeight] = useState<number>(
    profile.defaultWeightGrams,
  )
  const [savingShipping, setSavingShipping] = useState(false)

  function openCreateDialog() {
    setEditingId(null)
    setForm({
      bankName: 'BCA',
      accountNumber: '',
      accountName: '',
      isActive: true,
      isDefault: accounts.length === 0,
    })
    setDialogOpen(true)
  }

  function openEditDialog(acc: BankAccount) {
    setEditingId(acc.id)
    setForm({
      bankName: acc.bankName,
      accountNumber: acc.accountNumber,
      accountName: acc.accountName,
      isActive: acc.isActive,
      isDefault: acc.isDefault,
    })
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!form.accountNumber.trim() || !form.accountName.trim()) {
      toast.error('Nomor & nama pemilik wajib diisi')
      return
    }
    setSaving(true)
    try {
      const url = editingId
        ? `/api/bank-accounts/${editingId}`
        : '/api/bank-accounts'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menyimpan rekening')
        return
      }

      const refreshed = await fetch('/api/bank-accounts').then((r) => r.json())
      if (refreshed.success) setAccounts(refreshed.data.items)

      toast.success(editingId ? 'Rekening diperbarui' : 'Rekening ditambahkan')
      setDialogOpen(false)
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Hapus rekening ${label}?`)) return
    try {
      const res = await fetch(`/api/bank-accounts/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menghapus')
        return
      }
      const refreshed = await fetch('/api/bank-accounts').then((r) => r.json())
      if (refreshed.success) setAccounts(refreshed.data.items)
      toast.success('Rekening dihapus')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    }
  }

  async function handleSetDefault(id: string) {
    try {
      const res = await fetch(`/api/bank-accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal set default')
        return
      }
      const refreshed = await fetch('/api/bank-accounts').then((r) => r.json())
      if (refreshed.success) setAccounts(refreshed.data.items)
      toast.success('Rekening default diperbarui')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    }
  }

  async function handleSaveShipping() {
    if (!origin) {
      toast.error('Pilih kota asal pengiriman dulu')
      return
    }
    if (enabledCouriers.length === 0) {
      toast.error('Pilih minimal 1 kurir')
      return
    }
    if (!defaultWeight || defaultWeight < 1) {
      toast.error('Berat default minimal 1 gram')
      return
    }
    setSavingShipping(true)
    try {
      const res = await fetch('/api/shipping-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originCityId: String(origin.id),
          originCityName: origin.label || origin.city_name,
          originProvinceName: origin.province_name,
          enabledCouriers,
          defaultWeightGrams: defaultWeight,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menyimpan')
        return
      }
      setProfile((p) => ({
        ...p,
        originCityId: data.data.originCityId,
        originCityName: data.data.originCityName,
        originProvinceName: data.data.originProvinceName,
        enabledCouriers: data.data.enabledCouriers,
        defaultWeightGrams: data.data.defaultWeightGrams,
      }))
      toast.success('Pengaturan pengiriman disimpan')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSavingShipping(false)
    }
  }

  function toggleCourier(code: string) {
    setEnabledCouriers((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    )
  }

  async function handleSaveWa() {
    // Validasi format nomor (62xxx, no '+', no '0' di depan).
    const num = waForm.waConfirmNumber.trim()
    if (num && !/^62\d{8,15}$/.test(num)) {
      toast.error(
        'Format nomor WA harus 62xxx (mis. 6281234567890), tanpa + atau 0 di depan',
      )
      return
    }
    setSavingWa(true)
    try {
      const res = await fetch('/api/shipping-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waConfirmNumber: num || null,
          waConfirmTemplate: waForm.waConfirmTemplate,
          waConfirmActive: waForm.waConfirmActive,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menyimpan')
        return
      }
      setProfile((p) => ({
        ...p,
        waConfirmNumber: data.data.waConfirmNumber,
        waConfirmTemplate: data.data.waConfirmTemplate,
        waConfirmActive: data.data.waConfirmActive,
      }))
      toast.success('Pengaturan WA Konfirmasi disimpan')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSavingWa(false)
    }
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-6 md:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-warm-900 md:text-3xl">
            Rekening Bank
          </h1>
          <p className="mt-1 text-sm text-warm-600">
            Customer akan transfer ke rekening yang kamu set di sini.
            <span className="ml-1 text-warm-500">
              ({accounts.length}/{limit})
            </span>
          </p>
        </div>
        <Button onClick={openCreateDialog} disabled={accounts.length >= limit}>
          <Plus className="mr-2 size-4" />
          Tambah Rekening
        </Button>
      </div>

      {/* List rekening */}
      {accounts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <Building2 className="mb-3 size-10 text-warm-400" />
            <p className="font-medium text-warm-700">Belum ada rekening</p>
            <p className="mt-1 text-sm text-warm-500">
              Tambahkan minimal 1 rekening supaya customer bisa transfer.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {accounts.map((acc) => (
            <Card key={acc.id} className={acc.isActive ? '' : 'opacity-60'}>
              <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
                    <CreditCard className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-warm-900">
                        {acc.bankName}
                      </p>
                      {acc.isDefault && (
                        <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                          <Star className="mr-1 size-3" /> Default
                        </Badge>
                      )}
                      {!acc.isActive && (
                        <Badge variant="secondary">Tidak aktif</Badge>
                      )}
                    </div>
                    <p className="font-mono text-sm text-warm-700">
                      {acc.accountNumber}
                    </p>
                    <p className="text-xs text-warm-500">a.n. {acc.accountName}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!acc.isDefault && acc.isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetDefault(acc.id)}
                    >
                      <Star className="mr-1 size-3.5" />
                      Set Default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditDialog(acc)}
                  >
                    <Edit3 className="mr-1 size-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      handleDelete(
                        acc.id,
                        `${acc.bankName} ${acc.accountNumber}`,
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pengaturan Pengiriman section (Phase 2) */}
      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Truck className="size-5 text-blue-600" />
            <CardTitle className="text-lg">Pengaturan Pengiriman</CardTitle>
          </div>
          <p className="text-sm text-warm-600">
            Kota asal & kurir yang aktif. Sistem pakai data ini untuk hitung
            ongkir otomatis ke alamat customer via RajaOngkir.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              Kota Asal Pengiriman
            </Label>
            <DestinationPicker value={origin} onChange={setOrigin} />
            <p className="text-xs text-warm-500">
              Cari nama kota / kecamatan / kelurahan tempat kamu kirim paket.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Kurir Aktif</Label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {SUPPORTED_COURIERS.map((c) => (
                <label
                  key={c.code}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border bg-warm-50 px-3 py-2 hover:bg-warm-100"
                >
                  <Checkbox
                    checked={enabledCouriers.includes(c.code)}
                    onCheckedChange={() => toggleCourier(c.code)}
                  />
                  <span className="text-sm font-medium">{c.name}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-warm-500">
              Customer akan lihat opsi ongkir hanya dari kurir yang kamu
              centang.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="default-weight">Berat Default Per Order (gram)</Label>
            <Input
              id="default-weight"
              type="number"
              min={1}
              step={50}
              value={defaultWeight}
              onChange={(e) => setDefaultWeight(Number(e.target.value) || 0)}
              className="max-w-xs"
            />
            <p className="text-xs text-warm-500">
              Dipakai kalau produk belum diset berat-nya. Default 500 gram.
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveShipping} disabled={savingShipping}>
              {savingShipping ? 'Menyimpan…' : 'Simpan Pengaturan Pengiriman'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* WA Konfirmasi section */}
      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageCircle className="size-5 text-emerald-600" />
            <CardTitle className="text-lg">WA Konfirmasi Bukti Transfer</CardTitle>
          </div>
          <p className="text-sm text-warm-600">
            Customer bisa langsung kirim bukti transfer via WhatsApp ke nomor
            kamu, lengkap dengan template pesan otomatis.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border bg-warm-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-warm-900">Aktifkan tombol &ldquo;Kirim via WA&rdquo;</p>
              <p className="text-xs text-warm-500">
                Tombol akan tampil di halaman invoice customer.
              </p>
            </div>
            <Switch
              checked={waForm.waConfirmActive}
              onCheckedChange={(v) =>
                setWaForm((f) => ({ ...f, waConfirmActive: v }))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa-number">Nomor WA Penerima Bukti</Label>
            <Input
              id="wa-number"
              placeholder="6281234567890"
              value={waForm.waConfirmNumber}
              onChange={(e) =>
                setWaForm((f) => ({ ...f, waConfirmNumber: e.target.value }))
              }
            />
            <p className="text-xs text-warm-500">
              Format: 62xxx (tanpa + atau 0 di depan). Mis. 6281234567890.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wa-template">Template Pesan Otomatis</Label>
            <Textarea
              id="wa-template"
              rows={6}
              value={waForm.waConfirmTemplate}
              onChange={(e) =>
                setWaForm((f) => ({ ...f, waConfirmTemplate: e.target.value }))
              }
              className="font-mono text-sm"
            />
            <p className="text-xs text-warm-500">
              Variabel yang bisa dipakai:{' '}
              <code className="rounded bg-warm-100 px-1">{'{invoiceNumber}'}</code>{' '}
              <code className="rounded bg-warm-100 px-1">{'{totalRp}'}</code>{' '}
              <code className="rounded bg-warm-100 px-1">{'{bankName}'}</code>{' '}
              <code className="rounded bg-warm-100 px-1">{'{accountName}'}</code>{' '}
              <code className="rounded bg-warm-100 px-1">{'{customerName}'}</code>
            </p>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveWa} disabled={savingWa}>
              {savingWa ? 'Menyimpan…' : 'Simpan Pengaturan WA'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Rekening' : 'Tambah Rekening'}
            </DialogTitle>
            <DialogDescription>
              Customer akan transfer ke rekening ini. Pastikan nama pemilik
              persis dengan rekening bank kamu supaya tidak salah verifikasi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="bank-name">Bank</Label>
              <Select
                value={form.bankName}
                onValueChange={(v) => setForm((f) => ({ ...f, bankName: v }))}
              >
                <SelectTrigger id="bank-name">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BANK_OPTIONS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.bankName === 'Lainnya' && (
                <Input
                  placeholder="Nama bank"
                  value={form.bankName === 'Lainnya' ? '' : form.bankName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, bankName: e.target.value }))
                  }
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc-number">Nomor Rekening</Label>
              <Input
                id="acc-number"
                placeholder="1234567890"
                value={form.accountNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accountNumber: e.target.value }))
                }
                inputMode="numeric"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acc-name">Atas Nama</Label>
              <Input
                id="acc-name"
                placeholder="Nama persis di buku tabungan"
                value={form.accountName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accountName: e.target.value }))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-warm-50 px-3 py-2">
              <Label className="cursor-pointer text-sm" htmlFor="acc-active">
                Aktif (tampil ke customer)
              </Label>
              <Switch
                id="acc-active"
                checked={form.isActive}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isActive: v }))
                }
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-warm-50 px-3 py-2">
              <Label className="cursor-pointer text-sm" htmlFor="acc-default">
                Jadikan rekening default
              </Label>
              <Switch
                id="acc-default"
                checked={form.isDefault}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isDefault: v }))
                }
              />
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
