'use client'

// List user + top-up + edit (nama/role/saldo) + hapus user.
//
// Aturan keamanan client:
// - Tombol edit role / hapus disabled untuk diri sendiri.
// - Validasi server tetap jadi sumber kebenaran (cek admin-terakhir, dll.)
//   — UI hanya mengurangi friksi, bukan satu-satunya gate.
import { Coins, Loader2, Pencil, Search, Shield, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatNumber } from '@/lib/format'

interface UserRow {
  id: string
  email: string
  name: string | null
  role: 'USER' | 'ADMIN' | 'FINANCE'
  createdAt: string
  tokenBalance: { balance: number; totalUsed: number; totalPurchased: number } | null
  _count: { waSessions: number; contacts: number }
}

type EditableRole = 'USER' | 'ADMIN'

export function UsersManager() {
  const { data: session } = useSession()
  const currentUserId = session?.user?.id ?? null

  const [users, setUsers] = useState<UserRow[]>([])
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [isLoading, setLoading] = useState(true)

  // Top-up dialog state
  const [topupTarget, setTopupTarget] = useState<UserRow | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [isToppingUp, setToppingUp] = useState(false)

  // Edit dialog state
  const [editTarget, setEditTarget] = useState<UserRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<EditableRole>('USER')
  const [editBalance, setEditBalance] = useState('')
  const [isSaving, setSaving] = useState(false)

  // Delete dialog state
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null)
  const [isDeleting, setDeleting] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(id)
  }, [search])

  async function refresh() {
    const params = new URLSearchParams()
    if (debounced) params.set('search', debounced)
    const res = await fetch(`/api/admin/users?${params}`)
    const json = (await res.json()) as { success: boolean; data?: UserRow[] }
    if (json.success && json.data) setUsers(json.data)
  }

  useEffect(() => {
    let aborted = false
    setLoading(true)
    ;(async () => {
      const params = new URLSearchParams()
      if (debounced) params.set('search', debounced)
      const res = await fetch(`/api/admin/users?${params}`)
      const json = (await res.json()) as { success: boolean; data?: UserRow[] }
      if (!aborted && json.success && json.data) setUsers(json.data)
      if (!aborted) setLoading(false)
    })()
    return () => {
      aborted = true
    }
  }, [debounced])

  async function topup() {
    if (!topupTarget) return
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Jumlah harus angka positif')
      return
    }
    setToppingUp(true)
    try {
      const res = await fetch(`/api/admin/users/${topupTarget.id}/topup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: n,
          description: reason.trim() || undefined,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal top-up')
        return
      }
      toast.success(`Top-up ${n} token ke ${topupTarget.email}`)
      setTopupTarget(null)
      setAmount('')
      setReason('')
      void refresh()
    } finally {
      setToppingUp(false)
    }
  }

  function openEdit(u: UserRow) {
    setEditTarget(u)
    setEditName(u.name ?? '')
    // FINANCE tidak bisa diedit dari dialog ini — fallback ke USER supaya
    // dropdown tidak crash. Server tetap akan reject perubahan kalau admin
    // mencoba submit role yang tidak valid.
    setEditRole(u.role === 'ADMIN' ? 'ADMIN' : 'USER')
    setEditBalance(String(u.tokenBalance?.balance ?? 0))
  }

  async function saveEdit() {
    if (!editTarget) return
    const isSelf = currentUserId === editTarget.id

    const body: { name?: string | null; role?: EditableRole; tokenBalance?: number } = {}
    const trimmedName = editName.trim()
    const newName = trimmedName === '' ? null : trimmedName
    if (newName !== editTarget.name) body.name = newName

    if (!isSelf && editRole !== editTarget.role) body.role = editRole

    const newBalance = Number(editBalance)
    if (!Number.isFinite(newBalance) || newBalance < 0) {
      toast.error('Saldo harus angka ≥ 0')
      return
    }
    if (newBalance !== (editTarget.tokenBalance?.balance ?? 0)) {
      body.tokenBalance = newBalance
    }

    if (Object.keys(body).length === 0) {
      toast.info('Tidak ada perubahan')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/admin/users/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menyimpan perubahan')
        return
      }
      toast.success(`User ${editTarget.email} diperbarui`)
      setEditTarget(null)
      void refresh()
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/users/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menghapus user')
        return
      }
      toast.success(`User ${deleteTarget.email} dihapus`)
      setDeleteTarget(null)
      void refresh()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Users
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Lihat user platform, saldo token, top-up manual, edit profil, dan hapus user.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari email atau nama..."
          className="pl-8"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="text-right">Total Beli</TableHead>
              <TableHead className="text-right">Total Pakai</TableHead>
              <TableHead className="text-right">WA / Kontak</TableHead>
              <TableHead>Daftar</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Tidak ada user yang cocok.
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isSelf = currentUserId === u.id
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">
                          {u.name || '—'}
                          {isSelf && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (kamu)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={u.role === 'ADMIN' ? 'default' : 'outline'}
                        className="gap-1"
                      >
                        {u.role === 'ADMIN' && <Shield className="size-3" />}
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(u.tokenBalance?.balance ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatNumber(u.tokenBalance?.totalPurchased ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {formatNumber(u.tokenBalance?.totalUsed ?? 0)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {u._count.waSessions} / {u._count.contacts}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTopupTarget(u)}
                        >
                          <Coins className="mr-2 size-4" />
                          Top-up
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(u)}
                          title="Edit user"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            if (isSelf) {
                              toast.error('Tidak bisa menghapus diri sendiri')
                              return
                            }
                            setDeleteTarget(u)
                          }}
                          disabled={isSelf}
                          title={isSelf ? 'Tidak bisa menghapus diri sendiri' : 'Hapus user'}
                          className="text-destructive hover:text-destructive disabled:text-muted-foreground"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Top-up dialog */}
      <Dialog
        open={Boolean(topupTarget)}
        onOpenChange={(o) => {
          if (!o) {
            setTopupTarget(null)
            setAmount('')
            setReason('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top-up Manual</DialogTitle>
            <DialogDescription>
              Tambah saldo token ke <strong>{topupTarget?.email}</strong>. Tercatat
              sebagai TokenTransaction tipe BONUS.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="topup-amount">Jumlah Token</Label>
              <Input
                id="topup-amount"
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="topup-reason">Alasan (opsional)</Label>
              <Textarea
                id="topup-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Misal: kompensasi gangguan layanan"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTopupTarget(null)}>
              Batal
            </Button>
            <Button onClick={topup} disabled={isToppingUp}>
              {isToppingUp && <Loader2 className="mr-2 size-4 animate-spin" />}
              Top-up
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={Boolean(editTarget)}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null)
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Ubah profil <strong>{editTarget?.email}</strong>. Saldo di sini =
              jumlah <em>absolut</em> (override) — beda dengan top-up yang
              menambah saldo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Nama</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Nama lengkap"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              {editTarget && currentUserId === editTarget.id ? (
                <p className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  Tidak bisa mengubah role diri sendiri.
                </p>
              ) : editTarget?.role === 'FINANCE' ? (
                <p className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  Role FINANCE harus diubah lewat path khusus, tidak via dialog ini.
                </p>
              ) : (
                <Select
                  value={editRole}
                  onValueChange={(v) => setEditRole(v as EditableRole)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">USER</SelectItem>
                    <SelectItem value="ADMIN">ADMIN</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-balance">Saldo Token (absolut)</Label>
              <Input
                id="edit-balance"
                type="number"
                min={0}
                value={editBalance}
                onChange={(e) => setEditBalance(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Selisih akan dicatat sebagai TokenTransaction tipe ADJUSTMENT.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditTarget(null)}
              disabled={isSaving}
            >
              Batal
            </Button>
            <Button onClick={saveEdit} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => {
          if (!o && !isDeleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus user ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah kamu yakin ingin menghapus user{' '}
              <strong>{deleteTarget?.name || deleteTarget?.email}</strong>? Semua
              data termasuk kontak, percakapan, dan sesi WA akan ikut terhapus.
              Tindakan ini tidak bisa dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Cegah Radix auto-close supaya loading state kelihatan
                // dan toast error tidak hilang bareng dialog.
                e.preventDefault()
                void confirmDelete()
              }}
              disabled={isDeleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Ya, Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
