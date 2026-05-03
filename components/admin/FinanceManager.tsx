'use client'

// Panel verifikasi manual payment untuk role ADMIN & FINANCE.
// Filter tab: Semua / Menunggu / Dikonfirmasi / Ditolak.
// Aksi per row: Lihat Bukti, Konfirmasi, Tolak.
import type { ManualPaymentStatus } from '@prisma/client'
import {
  CheckCircle2,
  Clock,
  ImageIcon,
  Loader2,
  XCircle,
} from 'lucide-react'
import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
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
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { formatNumber, formatRupiah } from '@/lib/format'

interface ManualPaymentRow {
  id: string
  amount: number
  tokenAmount: number
  uniqueCode: number
  totalAmount: number
  status: ManualPaymentStatus
  proofUrl: string | null
  proofNote: string | null
  rejectionReason: string | null
  createdAt: string
  confirmedAt: string | null
  user: { id: string; name: string | null; email: string }
  package: { id: string; name: string }
  confirmer: { id: string; name: string | null; email: string } | null
}

type FilterValue = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'ALL'

const FILTER_TABS: { value: FilterValue; label: string }[] = [
  { value: 'PENDING', label: 'Menunggu Konfirmasi' },
  { value: 'CONFIRMED', label: 'Dikonfirmasi' },
  { value: 'REJECTED', label: 'Ditolak' },
  { value: 'ALL', label: 'Semua' },
]

const STATUS_LABEL: Record<ManualPaymentStatus, string> = {
  PENDING: 'Menunggu',
  CONFIRMED: 'Dikonfirmasi',
  REJECTED: 'Ditolak',
}

const STATUS_VARIANT: Record<
  ManualPaymentStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  PENDING: 'secondary',
  CONFIRMED: 'default',
  REJECTED: 'destructive',
}

const STATUS_ICON: Record<ManualPaymentStatus, typeof Clock> = {
  PENDING: Clock,
  CONFIRMED: CheckCircle2,
  REJECTED: XCircle,
}

export function FinanceManager() {
  const [rows, setRows] = useState<ManualPaymentRow[]>([])
  const [filter, setFilter] = useState<FilterValue>('PENDING')
  const [isLoading, setLoading] = useState(true)

  const [proofTarget, setProofTarget] = useState<ManualPaymentRow | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<ManualPaymentRow | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ManualPaymentRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [isActing, setActing] = useState(false)

  async function load(activeFilter: FilterValue = filter) {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/finance?status=${activeFilter}`)
      const json = (await res.json()) as {
        success: boolean
        data?: ManualPaymentRow[]
      }
      if (json.success && json.data) setRows(json.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(filter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const counts = useMemo(() => {
    const c = { PENDING: 0, CONFIRMED: 0, REJECTED: 0 }
    rows.forEach((r) => {
      c[r.status]++
    })
    return c
  }, [rows])

  async function doConfirm() {
    if (!confirmTarget) return
    setActing(true)
    try {
      const res = await fetch(`/api/admin/finance/${confirmTarget.id}/confirm`, {
        method: 'POST',
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal mengkonfirmasi')
        return
      }
      toast.success('Pembayaran dikonfirmasi, token user sudah ditambahkan.')
      setConfirmTarget(null)
      void load()
    } finally {
      setActing(false)
    }
  }

  async function doReject() {
    if (!rejectTarget) return
    if (rejectReason.trim().length < 3) {
      toast.error('Alasan penolakan minimal 3 karakter')
      return
    }
    setActing(true)
    try {
      const res = await fetch(`/api/admin/finance/${rejectTarget.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menolak')
        return
      }
      toast.success('Pembayaran ditolak, user sudah diberi tahu via email.')
      setRejectTarget(null)
      setRejectReason('')
      void load()
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Verifikasi Pembayaran Manual
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Cocokkan bukti transfer dengan total + kode unik, lalu konfirmasi atau
          tolak.
        </p>
      </div>

      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
        <TabsList>
          {FILTER_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {filter === t.value && t.value !== 'ALL' && counts[t.value] > 0 && (
                <span className="ml-1.5 rounded-full bg-primary-100 px-1.5 text-xs font-semibold text-primary-700">
                  {counts[t.value]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Paket</TableHead>
              <TableHead className="text-right">Total Transfer</TableHead>
              <TableHead className="text-right">Kode Unik</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  <Loader2 className="mx-auto size-4 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                  Tidak ada data.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const StatusIcon = STATUS_ICON[r.status]
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.user.name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.user.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.package.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(r.tokenAmount)} token
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-semibold tabular-nums">
                        {formatRupiah(r.totalAmount)}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatRupiah(r.amount)} + {r.uniqueCode}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {r.uniqueCode}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={STATUS_VARIANT[r.status]}
                        className="flex w-fit items-center gap-1"
                      >
                        <StatusIcon className="size-3" />
                        {STATUS_LABEL[r.status]}
                      </Badge>
                      {r.confirmer && r.status !== 'PENDING' && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          oleh {r.confirmer.name ?? r.confirmer.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!r.proofUrl}
                          onClick={() => setProofTarget(r)}
                        >
                          <ImageIcon className="mr-1 size-4" />
                          Bukti
                        </Button>
                        {r.status === 'PENDING' && (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => setConfirmTarget(r)}
                            >
                              Konfirmasi
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setRejectTarget(r)}
                            >
                              Tolak
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Modal preview bukti */}
      <Dialog
        open={proofTarget !== null}
        onOpenChange={(open) => !open && setProofTarget(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bukti Transfer</DialogTitle>
            <DialogDescription>
              {proofTarget?.user.email} — {proofTarget?.package.name} —{' '}
              {proofTarget && formatRupiah(proofTarget.totalAmount)}
            </DialogDescription>
          </DialogHeader>
          {proofTarget?.proofUrl ? (
            <div className="space-y-3">
              <div className="relative h-[60vh] w-full overflow-hidden rounded-lg border bg-warm-50">
                <Image
                  src={proofTarget.proofUrl}
                  alt="Bukti transfer"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
              {proofTarget.proofNote && (
                <div className="rounded-md border bg-warm-50 p-3 text-sm">
                  <div className="text-xs font-semibold uppercase text-warm-500">
                    Catatan user
                  </div>
                  <div className="mt-1 text-warm-700">{proofTarget.proofNote}</div>
                </div>
              )}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              User belum mengupload bukti.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog konfirmasi */}
      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(open) => !open && setConfirmTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Pembayaran?</DialogTitle>
            <DialogDescription>
              Token akan langsung ditambahkan ke saldo user dan tidak bisa dibatalkan.
            </DialogDescription>
          </DialogHeader>
          {confirmTarget && (
            <div className="space-y-2 rounded-md border bg-warm-50 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-warm-500">User</span>
                <span className="font-medium">{confirmTarget.user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-warm-500">Paket</span>
                <span className="font-medium">{confirmTarget.package.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-warm-500">Token akan ditambahkan</span>
                <span className="font-semibold">
                  +{formatNumber(confirmTarget.tokenAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-warm-500">Total transfer</span>
                <span className="font-semibold tabular-nums">
                  {formatRupiah(confirmTarget.totalAmount)}
                </span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmTarget(null)}>
              Batal
            </Button>
            <Button
              onClick={doConfirm}
              disabled={isActing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {isActing && <Loader2 className="mr-2 size-4 animate-spin" />}
              Ya, Konfirmasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog penolakan */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null)
            setRejectReason('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Pembayaran?</DialogTitle>
            <DialogDescription>
              User akan dikirimi email berisi alasan penolakan.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Alasan penolakan</Label>
            <Textarea
              id="reject-reason"
              rows={4}
              placeholder="Misal: nominal transfer tidak sesuai, atau bukti transfer tidak terbaca."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setRejectTarget(null)
                setRejectReason('')
              }}
            >
              Batal
            </Button>
            <Button variant="destructive" onClick={doReject} disabled={isActing}>
              {isActing && <Loader2 className="mr-2 size-4 animate-spin" />}
              Ya, Tolak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
