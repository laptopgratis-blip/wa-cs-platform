'use client'

// Panel verifikasi manual payment untuk role ADMIN & FINANCE.
// Filter tab: Semua / Menunggu / Dikonfirmasi / Ditolak.
// Aksi per row: Lihat Bukti, Konfirmasi, Tolak.
import type { ManualPaymentStatus } from '@prisma/client'
import { CheckCircle2, Clock, ImageIcon, Loader2, XCircle } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { TableSkeleton } from '@/components/shared/skeletons'
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
import { manualPaymentMeta, statusMeta } from '@/lib/status'
import { TONES } from '@/lib/ui-tones'

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
  // Nullable: schema polymorphic — token purchase punya package, LP upgrade
  // punya lpPackage. Endpoint /api/admin/finance filter purpose=TOKEN_PURCHASE
  // jadi seharusnya selalu non-null, tapi tetap null-guarded di render untuk
  // ketahanan kalau data lama anomali.
  package: { id: string; name: string } | null
  confirmer: { id: string; name: string | null; email: string } | null
}

type FilterValue = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'ALL'

const PAGE_SIZE = 20

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

const STATUS_ICON: Record<ManualPaymentStatus, typeof Clock> = {
  PENDING: Clock,
  CONFIRMED: CheckCircle2,
  REJECTED: XCircle,
}

export function FinanceManager() {
  const [rows, setRows] = useState<ManualPaymentRow[]>([])
  const [filter, setFilter] = useState<FilterValue>('PENDING')
  const [isLoading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  const [proofTarget, setProofTarget] = useState<ManualPaymentRow | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<ManualPaymentRow | null>(
    null,
  )
  const [rejectTarget, setRejectTarget] = useState<ManualPaymentRow | null>(
    null,
  )
  const [rejectReason, setRejectReason] = useState('')
  const [isActing, setActing] = useState(false)

  async function load(activeFilter: FilterValue = filter) {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/admin/finance?status=${activeFilter}&page=${page}&pageSize=${PAGE_SIZE}`,
      )
      const json = (await res.json()) as {
        success: boolean
        data?: { rows: ManualPaymentRow[]; total: number }
      }
      if (json.success && json.data) {
        setRows(json.data.rows)
        setTotal(json.data.total)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(filter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page])

  async function doConfirm() {
    if (!confirmTarget) return
    setActing(true)
    try {
      const res = await fetch(
        `/api/admin/finance/${confirmTarget.id}/confirm`,
        {
          method: 'POST',
        },
      )
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
      <PageHeader
        title="Verifikasi Pembayaran Manual"
        description="Cocokkan bukti transfer dengan total + kode unik, lalu konfirmasi atau tolak."
      />

      <Tabs
        value={filter}
        onValueChange={(v) => {
          setFilter(v as FilterValue)
          setPage(1)
        }}
      >
        <TabsList>
          {FILTER_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {filter === t.value && t.value !== 'ALL' && total > 0 && (
                <span className="bg-primary-100 text-primary-700 ml-1.5 rounded-full px-1.5 text-xs font-semibold">
                  {total}
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
              <TableSkeleton rows={5} cols={7} />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState
                    icon={Clock}
                    title="Tidak ada data"
                    description="Pembayaran manual yang masuk bakal tampil di tab ini."
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const StatusIcon = STATUS_ICON[r.status]
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.user.name ?? '—'}</div>
                      <div className="text-muted-foreground text-xs">
                        {r.user.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {r.package?.name ?? '—'}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {formatNumber(r.tokenAmount)} token
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-semibold tabular-nums">
                        {formatRupiah(r.totalAmount)}
                      </div>
                      <div className="text-muted-foreground text-xs tabular-nums">
                        {formatRupiah(r.amount)} + {r.uniqueCode}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {r.uniqueCode}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(r.createdAt).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={statusMeta(manualPaymentMeta, r.status).tone}
                        label={STATUS_LABEL[r.status]}
                        icon={StatusIcon}
                      />
                      {r.confirmer && r.status !== 'PENDING' && (
                        <div className="text-muted-foreground mt-1 text-[10px]">
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
                              className={TONES.success.solid}
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

      {total > PAGE_SIZE && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          isLoading={isLoading}
          onPageChange={setPage}
          noun="pembayaran"
        />
      )}

      {/* Modal preview bukti */}
      <Dialog
        open={proofTarget !== null}
        onOpenChange={(open) => !open && setProofTarget(null)}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Bukti Transfer</DialogTitle>
            <DialogDescription>
              {proofTarget?.user.email} — {proofTarget?.package?.name ?? '—'} —{' '}
              {proofTarget && formatRupiah(proofTarget.totalAmount)}
            </DialogDescription>
          </DialogHeader>
          {proofTarget?.proofUrl ? (
            <div className="space-y-3">
              <div className="bg-warm-50 relative h-[60vh] w-full overflow-hidden rounded-lg border">
                <Image
                  src={proofTarget.proofUrl}
                  alt="Bukti transfer"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
              {proofTarget.proofNote && (
                <div className="bg-warm-50 rounded-md border p-3 text-sm">
                  <div className="text-warm-500 text-xs font-semibold uppercase">
                    Catatan user
                  </div>
                  <div className="text-warm-700 mt-1">
                    {proofTarget.proofNote}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground py-8 text-center text-sm">
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
              Token akan langsung ditambahkan ke saldo user dan tidak bisa
              dibatalkan.
            </DialogDescription>
          </DialogHeader>
          {confirmTarget && (
            <div className="bg-warm-50 space-y-2 rounded-md border p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-warm-500">User</span>
                <span className="font-medium">{confirmTarget.user.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-warm-500">Paket</span>
                <span className="font-medium">
                  {confirmTarget.package?.name ?? '—'}
                </span>
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
              className={TONES.success.solid}
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
            <Button
              variant="destructive"
              onClick={doReject}
              disabled={isActing}
            >
              {isActing && <Loader2 className="mr-2 size-4 animate-spin" />}
              Ya, Tolak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
