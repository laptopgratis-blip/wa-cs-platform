'use client'

// List user + top-up manual.
import { Coins, Loader2, Search, Shield } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

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
  role: 'USER' | 'ADMIN'
  createdAt: string
  tokenBalance: { balance: number; totalUsed: number; totalPurchased: number } | null
  _count: { waSessions: number; contacts: number }
}

export function UsersManager() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [isLoading, setLoading] = useState(true)
  const [topupTarget, setTopupTarget] = useState<UserRow | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [isToppingUp, setToppingUp] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 300)
    return () => clearTimeout(id)
  }, [search])

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
      // Refresh
      const params = new URLSearchParams()
      if (debounced) params.set('search', debounced)
      const r = await fetch(`/api/admin/users?${params}`)
      const j = (await r.json()) as { success: boolean; data?: UserRow[] }
      if (j.success && j.data) setUsers(j.data)
    } finally {
      setToppingUp(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Users
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Lihat user platform, saldo token, dan top-up manual.
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
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{u.name || '—'}</p>
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
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setTopupTarget(u)}>
                      <Coins className="mr-2 size-4" />
                      Top-up
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
    </div>
  )
}
