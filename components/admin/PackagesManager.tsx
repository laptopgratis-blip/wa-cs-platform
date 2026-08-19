'use client'

// CRUD Token Packages.
import { Box, Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableSkeleton } from '@/components/shared/skeletons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { formatNumber, formatRupiah } from '@/lib/format'

type PackageKind = 'TOKEN' | 'MESSAGE_CREDIT'

interface PackageRow {
  id: string
  name: string
  tokenAmount: number
  price: number
  isPopular: boolean
  isActive: boolean
  sortOrder: number
  kind: PackageKind
}

export function PackagesManager() {
  const [rows, setRows] = useState<PackageRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<PackageRow | null>(null)
  const [name, setName] = useState('')
  const [tokenAmount, setTokenAmount] = useState('')
  const [price, setPrice] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [isPopular, setIsPopular] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [kind, setKind] = useState<PackageKind>('TOKEN')
  const [isSaving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<PackageRow | null>(null)
  const [isDeleting, setDeleting] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/packages')
      const json = (await res.json()) as { success: boolean; data?: PackageRow[] }
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
    setTokenAmount('')
    setPrice('')
    setSortOrder(String(rows.length))
    setIsPopular(false)
    setIsActive(true)
    setKind('TOKEN')
    setOpen(true)
  }
  function openEdit(p: PackageRow) {
    setEditing(p)
    setName(p.name)
    setTokenAmount(String(p.tokenAmount))
    setPrice(String(p.price))
    setSortOrder(String(p.sortOrder))
    setIsPopular(p.isPopular)
    setIsActive(p.isActive)
    setKind(p.kind ?? 'TOKEN')
    setOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      const body = {
        name: name.trim(),
        tokenAmount: Number(tokenAmount),
        price: Number(price),
        sortOrder: Number(sortOrder),
        isPopular,
        isActive,
        kind,
      }
      const res = await fetch(
        editing ? `/api/admin/packages/${editing.id}` : '/api/admin/packages',
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

  async function toggleActive(p: PackageRow) {
    const res = await fetch(`/api/admin/packages/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !p.isActive }),
    })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (!res.ok || !json.success) toast.error(json.error || 'Gagal toggle')
    void load()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/packages/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menghapus')
        return
      }
      toast.success('Paket dihapus')
      setDeleteTarget(null)
      void load()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Token Packages"
        description="Atur paket token yang bisa dibeli user."
        actions={
          <Button
            onClick={openCreate}
            className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
          >
            <Plus className="mr-2 size-4" /> Tambah Paket
          </Button>
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead className="text-right">Token / Kredit</TableHead>
              <TableHead className="text-right">Harga</TableHead>
              <TableHead className="text-right">Per token / Harga%</TableHead>
              <TableHead className="text-right">Order</TableHead>
              <TableHead>Populer</TableHead>
              <TableHead>Aktif</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={5} cols={8} />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <EmptyState
                    icon={Box}
                    title="Belum ada paket"
                    description="Tambahkan paket token pertama supaya user bisa top-up."
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.kind === 'MESSAGE_CREDIT' && (
                      <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">
                        Kredit Pesan WA
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.kind === 'MESSAGE_CREDIT' ? formatRupiah(p.tokenAmount) : formatNumber(p.tokenAmount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRupiah(p.price)}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {p.kind === 'MESSAGE_CREDIT'
                      ? `${Math.round((p.price / Math.max(p.tokenAmount, 1)) * 100)}%`
                      : p.tokenAmount > 0
                        ? formatRupiah(Math.round(p.price / p.tokenAmount))
                        : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {p.sortOrder}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={p.isPopular}
                      onCheckedChange={async () => {
                        await fetch(`/api/admin/packages/${p.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ isPopular: !p.isPopular }),
                        })
                        void load()
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Switch checked={p.isActive} onCheckedChange={() => toggleActive(p)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" aria-label="Edit paket" onClick={() => openEdit(p)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Hapus paket"
                      onClick={() => setDeleteTarget(p)}
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
        <SheetContent side="right" className="w-full sm:max-w-md px-6">
          <SheetHeader className="px-0">
            <SheetTitle>{editing ? 'Edit Paket' : 'Tambah Paket'}</SheetTitle>
            <SheetDescription>Atur paket token yang muncul di halaman Billing.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Nama</Label>
              <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-kind">Jenis paket</Label>
              <select
                id="p-kind"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value as PackageKind)}
              >
                <option value="TOKEN">Token AI</option>
                <option value="MESSAGE_CREDIT">Kredit Pesan WA (Rp, untuk template Meta)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="p-tok">{kind === 'MESSAGE_CREDIT' ? 'Kredit diterima (Rp)' : 'Jumlah Token'}</Label>
                <Input
                  id="p-tok"
                  type="number"
                  min={1}
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-price">Harga (Rp)</Label>
                <Input
                  id="p-price"
                  type="number"
                  min={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-order">Sort Order</Label>
              <Input
                id="p-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
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

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        title="Hapus paket ini?"
        description={
          <>
            Hapus paket <strong>{deleteTarget?.name}</strong>? Tindakan ini tidak
            bisa dibatalkan.
          </>
        }
        isLoading={isDeleting}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
