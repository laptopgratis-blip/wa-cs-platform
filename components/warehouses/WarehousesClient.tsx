'use client'

// Client component untuk halaman /warehouses (multi-gudang, Fase 1).
// CRUD gudang + set default. Origin gudang dipilih via DestinationPicker
// (reuse pencari destinasi Komerce). regionCode di-derive server-side dari
// provinsi. Saat customer isi alamat, selector otomatis pilih gudang termurah.
import {
  Edit3,
  MapPin,
  Plus,
  Star,
  Trash2,
  Warehouse as WarehouseIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import {
  DestinationPicker,
  type PickedDestination,
} from '@/components/order-system/DestinationPicker'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
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

interface Warehouse {
  id: string
  name: string
  originId: number
  cityName: string
  provinceName: string
  regionCode: string
  isActive: boolean
  isDefault: boolean
  createdAt: string
}

interface WarehousesClientProps {
  initialWarehouses: Warehouse[]
  limit: number
}

export function WarehousesClient({
  initialWarehouses,
  limit,
}: WarehousesClientProps) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>(initialWarehouses)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [origin, setOrigin] = useState<PickedDestination | null>(null)
  const [isActive, setIsActive] = useState(true)
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  async function refresh() {
    const res = await fetch('/api/warehouses').then((r) => r.json())
    if (res.success) setWarehouses(res.data.items)
  }

  function openCreate() {
    setEditingId(null)
    setName('')
    setOrigin(null)
    setIsActive(true)
    setIsDefault(warehouses.length === 0)
    setDialogOpen(true)
  }

  function openEdit(w: Warehouse) {
    setEditingId(w.id)
    setName(w.name)
    setOrigin({
      id: w.originId,
      label: w.cityName,
      province_name: w.provinceName,
      city_name: '',
      district_name: '',
      subdistrict_name: '',
      zip_code: '',
    })
    setIsActive(w.isActive)
    setIsDefault(w.isDefault)
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error('Nama gudang wajib diisi')
      return
    }
    if (!origin) {
      toast.error('Pilih kota asal gudang dulu')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        originId: origin.id,
        cityName: origin.label || origin.city_name,
        provinceName: origin.province_name,
        isActive,
        isDefault,
      }
      const url = editingId ? `/api/warehouses/${editingId}` : '/api/warehouses'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menyimpan gudang')
        return
      }
      await refresh()
      toast.success(editingId ? 'Gudang diperbarui' : 'Gudang ditambahkan')
      setDialogOpen(false)
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Hapus gudang "${label}"?`)) return
    try {
      const res = await fetch(`/api/warehouses/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menghapus')
        return
      }
      await refresh()
      toast.success('Gudang dihapus')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    }
  }

  async function handleSetDefault(id: string) {
    try {
      const res = await fetch(`/api/warehouses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal set default')
        return
      }
      await refresh()
      toast.success('Gudang default diperbarui')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        icon={WarehouseIcon}
        title="Gudang"
        description={
          <>
            Tambahkan gudang di beberapa kota. Saat customer isi alamat, sistem
            otomatis pilih gudang terdekat/termurah supaya ongkir lebih hemat.
            <span className="text-warm-500 ml-1">
              ({warehouses.length}/{limit})
            </span>
          </>
        }
        actions={
          <Button onClick={openCreate} disabled={warehouses.length >= limit}>
            <Plus className="mr-2 size-4" />
            Tambah Gudang
          </Button>
        }
      />

      {warehouses.length === 0 ? (
        <EmptyState
          bordered
          icon={WarehouseIcon}
          title="Belum ada gudang"
          description="Tambahkan minimal 1 gudang (kota asal pengiriman). Kalau punya lebih dari 1, sistem otomatis pilih yang termurah per order."
        />
      ) : (
        <div className="space-y-3">
          {warehouses.map((w) => (
            <Card key={w.id} className={w.isActive ? '' : 'opacity-60'}>
              <CardContent className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className="bg-primary-50 text-primary-600 flex size-10 shrink-0 items-center justify-center rounded-lg">
                    <WarehouseIcon className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-warm-900 font-semibold">{w.name}</p>
                      {w.isDefault && (
                        <StatusBadge tone="brand" icon={Star} label="Default" />
                      )}
                      {!w.isActive && (
                        <Badge variant="secondary">Tidak aktif</Badge>
                      )}
                    </div>
                    <p className="text-warm-600 flex items-center gap-1 text-sm">
                      <MapPin className="size-3.5 shrink-0" />
                      <span className="truncate">{w.cityName}</span>
                    </p>
                    {w.provinceName && (
                      <p className="text-warm-500 text-xs">{w.provinceName}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!w.isDefault && w.isActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSetDefault(w.id)}
                    >
                      <Star className="mr-1 size-3.5" />
                      Set Default
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEdit(w)}
                  >
                    <Edit3 className="mr-1 size-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(w.id, w.name)}
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
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl lg:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Gudang' : 'Tambah Gudang'}
            </DialogTitle>
            <DialogDescription>
              Gudang = titik asal pengiriman. Ongkir dihitung dari kota gudang
              ke alamat customer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wh-name">Nama Gudang</Label>
              <Input
                id="wh-name"
                placeholder="mis. Gudang Bandung"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                Kota Asal Gudang
              </Label>
              <DestinationPicker value={origin} onChange={setOrigin} />
              <p className="text-warm-500 text-xs">
                Cari nama kota / kecamatan / kelurahan tempat gudang ini kirim
                paket.
              </p>
            </div>

            <div className="bg-warm-50 flex items-center justify-between rounded-lg border px-3 py-2">
              <Label className="cursor-pointer text-sm" htmlFor="wh-active">
                Aktif (dipakai untuk hitung ongkir)
              </Label>
              <Switch
                id="wh-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>

            <div className="bg-warm-50 flex items-center justify-between rounded-lg border px-3 py-2">
              <Label className="cursor-pointer text-sm" htmlFor="wh-default">
                Jadikan gudang default
              </Label>
              <Switch
                id="wh-default"
                checked={isDefault}
                onCheckedChange={setIsDefault}
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
    </PageContainer>
  )
}
