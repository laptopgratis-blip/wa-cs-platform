'use client'

// CRUD Paket Upgrade Landing Page. Pola Sheet form sama dengan PackagesManager.
import type { LpTier } from '@prisma/client'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatNumber, formatRupiah } from '@/lib/format'

interface LpPackageRow {
  id: string
  name: string
  description: string | null
  tier: LpTier
  maxLp: number
  maxStorageMB: number
  price: number
  isPopular: boolean
  isActive: boolean
  sortOrder: number
}

const TIER_OPTIONS: { value: LpTier; label: string }[] = [
  { value: 'STARTER', label: 'STARTER' },
  { value: 'POPULAR', label: 'POPULAR' },
  { value: 'POWER', label: 'POWER' },
]

export function LpPackagesManager() {
  const [rows, setRows] = useState<LpPackageRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<LpPackageRow | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tier, setTier] = useState<LpTier>('STARTER')
  const [maxLp, setMaxLp] = useState('')
  const [maxStorageMB, setMaxStorageMB] = useState('')
  const [price, setPrice] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isPopular, setIsPopular] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [isSaving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lp-packages')
      const json = (await res.json()) as { success: boolean; data?: LpPackageRow[] }
      if (json.success && json.data) setRows(json.data)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditing(null)
    setName('')
    setDescription('')
    setTier('STARTER')
    setMaxLp('3')
    setMaxStorageMB('20')
    setPrice('')
    setSortOrder(String(rows.length))
    setIsPopular(false)
    setIsActive(true)
    setOpen(true)
  }
  function openEdit(p: LpPackageRow) {
    setEditing(p)
    setName(p.name)
    setDescription(p.description ?? '')
    setTier(p.tier as LpTier)
    setMaxLp(String(p.maxLp))
    setMaxStorageMB(String(p.maxStorageMB))
    setPrice(String(p.price))
    setSortOrder(String(p.sortOrder))
    setIsPopular(p.isPopular)
    setIsActive(p.isActive)
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        tier,
        maxLp: Number(maxLp),
        maxStorageMB: Number(maxStorageMB),
        price: Number(price),
        sortOrder: Number(sortOrder),
        isPopular,
        isActive,
      }
      const res = await fetch(
        editing
          ? `/api/admin/lp-packages/${editing.id}`
          : '/api/admin/lp-packages',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menyimpan')
        return
      }
      toast.success(editing ? 'Paket diperbarui' : 'Paket dibuat')
      setOpen(false)
      void load()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: LpPackageRow) {
    const res = await fetch(`/api/admin/lp-packages/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (!res.ok || !json.success) toast.error(json.error || 'Gagal toggle')
    void load()
  }

  async function remove(p: LpPackageRow) {
    if (!confirm(`Hapus paket "${p.name}"?`)) return
    const res = await fetch(`/api/admin/lp-packages/${p.id}`, { method: 'DELETE' })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal menghapus')
      return
    }
    toast.success('Paket dihapus')
    void load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            Paket Upgrade Landing Page
          </h1>
          <p className="mt-1 text-sm text-warm-500">
            Atur paket yang user bisa beli untuk upgrade kuota LP & storage.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
        >
          <Plus className="mr-2 size-4" /> Tambah Paket
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead className="text-right">Max LP</TableHead>
              <TableHead className="text-right">Storage</TableHead>
              <TableHead className="text-right">Harga</TableHead>
              <TableHead className="text-right">Order</TableHead>
              <TableHead>Populer</TableHead>
              <TableHead>Aktif</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                  Belum ada paket.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    {p.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {p.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.tier}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.maxLp >= 999 ? '∞' : formatNumber(p.maxLp)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.maxStorageMB} MB
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRupiah(p.price)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {p.sortOrder}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={p.isPopular}
                      onCheckedChange={async () => {
                        await fetch(`/api/admin/lp-packages/${p.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ isPopular: !p.isPopular }),
                        })
                        void load()
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={p.isActive}
                      onCheckedChange={() => toggleActive(p)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(p)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-md px-6"
        >
          <SheetHeader className="px-0">
            <SheetTitle>{editing ? 'Edit Paket LP' : 'Tambah Paket LP'}</SheetTitle>
            <SheetDescription>
              Paket ini muncul di halaman /pricing (subscription LP via token).
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="lpp-name">Nama</Label>
              <Input
                id="lpp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lpp-desc">Deskripsi</Label>
              <Textarea
                id="lpp-desc"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lpp-tier">Tier</Label>
              <Select value={tier} onValueChange={(v) => setTier(v as LpTier)}>
                <SelectTrigger id="lpp-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIER_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lpp-lp">Max LP</Label>
                <Input
                  id="lpp-lp"
                  type="number"
                  min={1}
                  value={maxLp}
                  onChange={(e) => setMaxLp(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lpp-storage">Storage (MB)</Label>
                <Input
                  id="lpp-storage"
                  type="number"
                  min={1}
                  value={maxStorageMB}
                  onChange={(e) => setMaxStorageMB(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="lpp-price">Harga (Rp)</Label>
                <Input
                  id="lpp-price"
                  type="number"
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lpp-order">Sort Order</Label>
                <Input
                  id="lpp-order"
                  type="number"
                  min={0}
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Populer (badge "Paling Populer")</Label>
              <Switch checked={isPopular} onCheckedChange={setIsPopular} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Aktif</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={save} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Simpan
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
