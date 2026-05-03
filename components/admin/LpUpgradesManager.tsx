'use client'

// LpUpgradesManager — list manual + Tripay LP upgrade payments dalam satu
// tabel, dengan kolom Method (Manual/Tripay). Tombol konfirmasi/tolak
// hanya muncul untuk MANUAL + PENDING.
import {
  Banknote,
  CheckCircle2,
  Clock,
  CreditCard,
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

type Status = 'PENDING' | 'CONFIRMED' | 'REJECTED'
type FilterValue = Status | 'ALL'

interface PkgInfo {
  name: string
  tier: string
  maxLp: number
  maxStorageMB: number
}
interface ManualRow {
  id: string
  method: 'MANUAL'
  status: Status
  amount: number
  totalAmount: number
  uniqueCode: number
  proofUrl: string | null
  proofNote: string | null
  rejectionReason: string | null
  createdAt: string
  confirmedAt: string | null
  user: { id: string; name: string | null; email: string }
  package: PkgInfo | null
  confirmer: { id: string; name: string | null; email: string } | null
}
interface TripayRow {
  id: string
  orderId: string
  method: 'TRIPAY'
  status: Status
  rawStatus: string
  amount: number
  paymentMethod: string | null
  reference: string | null
  paymentUrl: string | null
  createdAt: string
  paidAt: string | null
  user: { id: string; name: string | null; email: string } | null
  package: PkgInfo | null
}
type Row = ManualRow | TripayRow

const FILTER_TABS: { value: FilterValue; label: string }[] = [
  { value: 'PENDING', label: 'Menunggu' },
  { value: 'CONFIRMED', label: 'Dikonfirmasi' },
  { value: 'REJECTED', label: 'Ditolak' },
  { value: 'ALL', label: 'Semua' },
]

const STATUS_LABEL: Record<Status, string> = {
  PENDING: 'Menunggu',
  CONFIRMED: 'Dikonfirmasi',
  REJECTED: 'Ditolak',
}
const STATUS_VARIANT: Record<
  Status,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  PENDING: 'secondary',
  CONFIRMED: 'default',
  REJECTED: 'destructive',
}
const STATUS_ICON: Record<Status, typeof Clock> = {
  PENDING: Clock,
  CONFIRMED: CheckCircle2,
  REJECTED: XCircle,
}

export function LpUpgradesManager() {
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState<FilterValue>('PENDING')
  const [isLoading, setLoading] = useState(true)

  const [proofTarget, setProofTarget] = useState<ManualRow | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<ManualRow | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ManualRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [isActing, setActing] = useState(false)

  async function load(activeFilter: FilterValue = filter) {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/lp-upgrades?status=${activeFilter}`)
      const json = (await res.json()) as {
        success: boolean
        data?: { manuals: ManualRow[]; tripays: TripayRow[] }
      }
      if (json.success && json.data) {
        // Merge & sort by createdAt desc.
        const merged: Row[] = [...json.data.manuals, ...json.data.tripays]
        merged.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        setRows(merged)
      }
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
      const res = await fetch(
        `/api/admin/lp-upgrades/${confirmTarget.id}/confirm`,
        { method: 'POST' },
      )
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal mengkonfirmasi')
        return
      }
      toast.success('Pembayaran dikonfirmasi & kuota LP user di-upgrade.')
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
      const res = await fetch(
        `/api/admin/lp-upgrades/${rejectTarget.id}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: rejectReason.trim() }),
        },
      )
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menolak')
        return
      }
      toast.success('Pembayaran ditolak.')
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
          Verifikasi Upgrade Landing Page
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Manual: cocokkan bukti dengan total + kode unik, lalu konfirmasi.
          Tripay: status auto-update via webhook (read-only).
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
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Total</TableHead>
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
                const lpLabel = r.package
                  ? r.package.maxLp >= 999
                    ? '∞ LP'
                    : `${formatNumber(r.package.maxLp)} LP`
                  : '—'
                const isManual = r.method === 'MANUAL'
                return (
                  <TableRow key={`${r.method}:${r.id}`}>
                    <TableCell>
                      <div className="font-medium">{r.user?.name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.user?.email ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {r.package?.name ?? '—'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.package?.tier} · {lpLabel} · {r.package?.maxStorageMB} MB
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="flex w-fit items-center gap-1 font-normal"
                      >
                        {isManual ? (
                          <>
                            <Banknote className="size-3" /> Manual
                          </>
                        ) : (
                          <>
                            <CreditCard className="size-3" /> Tripay
                          </>
                        )}
                      </Badge>
                      {isManual && (
                        <div className="mt-0.5 text-[10px] font-mono text-muted-foreground">
                          kode {r.uniqueCode}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="font-semibold">
                        {formatRupiah(isManual ? r.totalAmount : r.amount)}
                      </div>
                      {!isManual && r.paymentMethod && (
                        <div className="text-xs text-muted-foreground">
                          {r.paymentMethod}
                        </div>
                      )}
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
                      {isManual && r.confirmer && r.status !== 'PENDING' && (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          oleh {r.confirmer.name ?? r.confirmer.email}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isManual ? (
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
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          auto via webhook
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Proof modal */}
      <Dialog
        open={proofTarget !== null}
        onOpenChange={(o) => !o && setProofTarget(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bukti Transfer</DialogTitle>
            <DialogDescription>
              {proofTarget?.user.email} — {proofTarget?.package?.name} —{' '}
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

      {/* Confirm dialog */}
      <Dialog
        open={confirmTarget !== null}
        onOpenChange={(o) => !o && setConfirmTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Upgrade LP?</DialogTitle>
            <DialogDescription>
              Kuota LP user akan langsung di-upgrade dan tidak bisa dibatalkan.
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
                <span className="font-medium">
                  {confirmTarget.package?.name} ({confirmTarget.package?.tier})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-warm-500">Kuota baru</span>
                <span className="font-semibold">
                  {confirmTarget.package?.maxLp} LP ·{' '}
                  {confirmTarget.package?.maxStorageMB} MB
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

      {/* Reject dialog */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null)
            setRejectReason('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak Pembayaran?</DialogTitle>
            <DialogDescription>
              Status order menjadi REJECTED. User bisa lihat alasan di
              dashboard checkout.
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
