'use client'

// CRUD zona ongkir untuk Order System Phase 2.
// Match type: ALL (semua wilayah), CITY (pilih kota), PROVINCE (pilih provinsi).
// Subsidy type: NONE | FLAT_AMOUNT (rupiah) | PERCENT (%) | FREE (gratis ongkir).
import { Edit3, MapPin, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { formatNumber } from '@/lib/format'
import {
  type PickedDestination,
  DestinationPicker,
} from '@/components/order-system/DestinationPicker'

interface ShippingZone {
  id: string
  name: string
  matchType: string
  cityIds: string[]
  provinceIds: string[]
  cityNames: string[]
  provinceNames: string[]
  subsidyType: string
  subsidyValue: number
  minimumOrder: number | null
  startsAt: string | null
  endsAt: string | null
  isActive: boolean
  priority: number
  createdAt: string
}

interface ShippingZonesClientProps {
  initialZones: ShippingZone[]
  limit: number
}

const EMPTY_FORM = {
  name: '',
  matchType: 'CITY' as 'ALL' | 'CITY' | 'PROVINCE',
  cityIds: [] as string[],
  cityNames: [] as string[],
  provinceIds: [] as string[],
  provinceNames: [] as string[],
  subsidyType: 'FLAT_AMOUNT' as 'NONE' | 'FLAT_AMOUNT' | 'PERCENT' | 'FREE',
  subsidyValue: 0,
  minimumOrder: '' as string | number,
  isActive: true,
  priority: 0,
}

function describeSubsidy(z: ShippingZone) {
  if (z.subsidyType === 'FREE') return '🎁 Gratis Ongkir'
  if (z.subsidyType === 'FLAT_AMOUNT')
    return `Subsidi Rp ${formatNumber(z.subsidyValue)}`
  if (z.subsidyType === 'PERCENT') return `Subsidi ${z.subsidyValue}%`
  return 'Tidak ada subsidi'
}

function describeMatch(z: ShippingZone) {
  if (z.matchType === 'ALL') return 'Semua wilayah'
  if (z.matchType === 'CITY')
    return `${z.cityNames.length} kota: ${z.cityNames.slice(0, 3).join(', ')}${z.cityNames.length > 3 ? '…' : ''}`
  return `${z.provinceNames.length} provinsi: ${z.provinceNames.slice(0, 3).join(', ')}${z.provinceNames.length > 3 ? '…' : ''}`
}

export function ShippingZonesClient({
  initialZones,
  limit,
}: ShippingZonesClientProps) {
  const [zones, setZones] = useState<ShippingZone[]>(initialZones)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [picker, setPicker] = useState<PickedDestination | null>(null)
  const [saving, setSaving] = useState(false)

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setPicker(null)
    setDialogOpen(true)
  }

  function openEdit(z: ShippingZone) {
    setEditingId(z.id)
    setForm({
      name: z.name,
      matchType: z.matchType as 'ALL' | 'CITY' | 'PROVINCE',
      cityIds: z.cityIds,
      cityNames: z.cityNames,
      provinceIds: z.provinceIds,
      provinceNames: z.provinceNames,
      subsidyType: z.subsidyType as 'NONE' | 'FLAT_AMOUNT' | 'PERCENT' | 'FREE',
      subsidyValue: z.subsidyValue,
      minimumOrder: z.minimumOrder ?? '',
      isActive: z.isActive,
      priority: z.priority,
    })
    setPicker(null)
    setDialogOpen(true)
  }

  // Saat user pilih destination dari picker → tambah ke list city/province
  // berdasarkan matchType. Reset picker agar bisa pilih lagi.
  useEffect(() => {
    if (!picker) return
    if (form.matchType === 'CITY') {
      const cityName = picker.city_name
      if (!form.cityNames.includes(cityName)) {
        setForm((f) => ({
          ...f,
          cityIds: [...f.cityIds, String(picker.id)],
          cityNames: [...f.cityNames, cityName],
        }))
      } else {
        toast.info('Kota sudah ada di list')
      }
    } else if (form.matchType === 'PROVINCE') {
      const provName = picker.province_name
      if (!form.provinceNames.includes(provName)) {
        setForm((f) => ({
          ...f,
          provinceIds: [...f.provinceIds, String(picker.id)],
          provinceNames: [...f.provinceNames, provName],
        }))
      } else {
        toast.info('Provinsi sudah ada di list')
      }
    }
    setPicker(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker])

  function removeCity(idx: number) {
    setForm((f) => ({
      ...f,
      cityIds: f.cityIds.filter((_, i) => i !== idx),
      cityNames: f.cityNames.filter((_, i) => i !== idx),
    }))
  }

  function removeProvince(idx: number) {
    setForm((f) => ({
      ...f,
      provinceIds: f.provinceIds.filter((_, i) => i !== idx),
      provinceNames: f.provinceNames.filter((_, i) => i !== idx),
    }))
  }

  async function refreshList() {
    const res = await fetch('/api/shipping-zones')
    const data = await res.json()
    if (data.success) setZones(data.data.items)
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error('Nama zona wajib diisi')
      return
    }
    if (form.matchType === 'CITY' && form.cityNames.length === 0) {
      toast.error('Pilih minimal 1 kota')
      return
    }
    if (form.matchType === 'PROVINCE' && form.provinceNames.length === 0) {
      toast.error('Pilih minimal 1 provinsi')
      return
    }
    if (form.subsidyType === 'FLAT_AMOUNT' && form.subsidyValue <= 0) {
      toast.error('Nominal subsidi minimal Rp 1')
      return
    }
    if (
      form.subsidyType === 'PERCENT' &&
      (form.subsidyValue <= 0 || form.subsidyValue > 100)
    ) {
      toast.error('Persentase subsidi harus 1-100')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        matchType: form.matchType,
        cityIds: form.cityIds,
        cityNames: form.cityNames,
        provinceIds: form.provinceIds,
        provinceNames: form.provinceNames,
        subsidyType: form.subsidyType,
        subsidyValue: Number(form.subsidyValue) || 0,
        minimumOrder:
          form.minimumOrder === '' ? null : Number(form.minimumOrder) || 0,
        isActive: form.isActive,
        priority: Number(form.priority) || 0,
      }
      const url = editingId
        ? `/api/shipping-zones/${editingId}`
        : '/api/shipping-zones'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menyimpan zona')
        return
      }
      await refreshList()
      toast.success(editingId ? 'Zona diperbarui' : 'Zona ditambahkan')
      setDialogOpen(false)
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Hapus zona "${name}"?`)) return
    try {
      const res = await fetch(`/api/shipping-zones/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menghapus')
        return
      }
      await refreshList()
      toast.success('Zona dihapus')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    }
  }

  async function handleToggleActive(id: string, isActive: boolean) {
    try {
      const res = await fetch(`/api/shipping-zones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal update')
        return
      }
      await refreshList()
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    }
  }

  return (
    <div className="container mx-auto max-w-5xl px-4 py-6 md:py-8">
      <div className="mb-6 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-warm-900 md:text-3xl">
            Zona Ongkir
          </h1>
          <p className="mt-1 text-sm text-warm-600">
            Aturan subsidi ongkir per zona — Bandung, Jawa, Luar Jawa, atau
            gratis ongkir penuh.
            <span className="ml-1 text-warm-500">
              ({zones.length}/{limit})
            </span>
          </p>
        </div>
        <Button onClick={openCreate} disabled={zones.length >= limit}>
          <Plus className="mr-2 size-4" />
          Tambah Aturan
        </Button>
      </div>

      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <strong>Cara kerja:</strong> Saat customer pilih alamat, sistem cek
        zona dengan priority tertinggi yang match dulu. Mis. zona &ldquo;Bandung&rdquo; (priority 10) lebih spesifik daripada &ldquo;Jawa Barat&rdquo; (priority
        5), jadi yang menang Bandung kalau alamat customer di Bandung.
      </div>

      {zones.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <MapPin className="mb-3 size-10 text-warm-400" />
            <p className="font-medium text-warm-700">Belum ada zona ongkir</p>
            <p className="mt-1 text-sm text-warm-500">
              Buat aturan pertama untuk subsidi ongkir customer di kota tertentu.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {zones.map((z) => (
            <Card key={z.id} className={z.isActive ? '' : 'opacity-60'}>
              <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-warm-900">{z.name}</p>
                    <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
                      {describeSubsidy(z)}
                    </Badge>
                    {z.priority > 0 && (
                      <Badge variant="secondary">P{z.priority}</Badge>
                    )}
                    {!z.isActive && <Badge variant="secondary">Off</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-warm-600">
                    {describeMatch(z)}
                  </p>
                  {z.minimumOrder ? (
                    <p className="text-xs text-warm-500">
                      Min order Rp {formatNumber(z.minimumOrder)}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 rounded-lg border bg-warm-50 px-2.5 py-1.5">
                    <Switch
                      checked={z.isActive}
                      onCheckedChange={(v) => handleToggleActive(z.id, v)}
                    />
                    <span className="text-xs text-warm-600">Aktif</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openEdit(z)}>
                    <Edit3 className="mr-1 size-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(z.id, z.name)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Zona Ongkir' : 'Tambah Zona Ongkir'}
            </DialogTitle>
            <DialogDescription>
              Atur subsidi ongkir berdasarkan kota / provinsi tujuan customer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="z-name">Nama Aturan</Label>
              <Input
                id="z-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="Bandung & sekitarnya"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Berlaku Untuk</Label>
              <Select
                value={form.matchType}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    matchType: v as 'ALL' | 'CITY' | 'PROVINCE',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua wilayah</SelectItem>
                  <SelectItem value="CITY">Kota tertentu</SelectItem>
                  <SelectItem value="PROVINCE">Provinsi tertentu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(form.matchType === 'CITY' || form.matchType === 'PROVINCE') && (
              <div className="space-y-1.5">
                <Label>
                  {form.matchType === 'CITY'
                    ? 'Pilih Kota'
                    : 'Pilih Provinsi'}
                </Label>
                <DestinationPicker value={picker} onChange={setPicker} />
                <p className="text-xs text-warm-500">
                  Cari nama daerah, sistem ambil{' '}
                  {form.matchType === 'CITY' ? 'kota' : 'provinsi'} dari hasil.
                </p>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(form.matchType === 'CITY'
                    ? form.cityNames
                    : form.provinceNames
                  ).map((name, idx) => (
                    <Badge
                      key={`${name}-${idx}`}
                      variant="secondary"
                      className="gap-1 pr-1"
                    >
                      {name}
                      <button
                        type="button"
                        onClick={() =>
                          form.matchType === 'CITY'
                            ? removeCity(idx)
                            : removeProvince(idx)
                        }
                        className="rounded hover:bg-destructive/10"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Tipe Subsidi</Label>
              <Select
                value={form.subsidyType}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    subsidyType: v as
                      | 'NONE'
                      | 'FLAT_AMOUNT'
                      | 'PERCENT'
                      | 'FREE',
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Tidak ada subsidi</SelectItem>
                  <SelectItem value="FLAT_AMOUNT">
                    Diskon nominal tetap (Rp)
                  </SelectItem>
                  <SelectItem value="PERCENT">Diskon persentase (%)</SelectItem>
                  <SelectItem value="FREE">Gratis ongkir penuh</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(form.subsidyType === 'FLAT_AMOUNT' ||
              form.subsidyType === 'PERCENT') && (
              <div className="space-y-1.5">
                <Label htmlFor="z-value">
                  {form.subsidyType === 'FLAT_AMOUNT'
                    ? 'Nominal Subsidi (Rp)'
                    : 'Persentase Subsidi (%)'}
                </Label>
                <Input
                  id="z-value"
                  type="number"
                  min={0}
                  max={form.subsidyType === 'PERCENT' ? 100 : undefined}
                  value={form.subsidyValue}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      subsidyValue: Number(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="z-min">Minimum Order (Rp, opsional)</Label>
              <Input
                id="z-min"
                type="number"
                min={0}
                placeholder="0 = tanpa minimum"
                value={form.minimumOrder}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minimumOrder: e.target.value }))
                }
              />
              <p className="text-xs text-warm-500">
                Subsidi hanya aktif kalau subtotal produk ≥ minimum order.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="z-priority">Priority</Label>
              <Input
                id="z-priority"
                type="number"
                min={0}
                max={1000}
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({ ...f, priority: Number(e.target.value) || 0 }))
                }
              />
              <p className="text-xs text-warm-500">
                Lebih tinggi = lebih spesifik. Mis. zona Bandung (10) menang
                vs zona Jawa Barat (5).
              </p>
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-warm-50 px-3 py-2">
              <Label className="cursor-pointer text-sm">
                Aktif
              </Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isActive: v }))
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
