'use client'

// Admin /admin/subscriptions — 3 tab: active, pending (waiting confirmation),
// history. Approve/reject manual transfer dari sini.
import { CheckCircle2, ExternalLink, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared/EmptyState'
import { Pagination } from '@/components/shared/Pagination'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  statusMeta,
  subscriptionInvoiceStatusMeta,
  subscriptionStatusMeta,
} from '@/lib/status'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface Sub {
  id: string
  status: string
  isLifetime: boolean
  durationMonths: number
  startDate: string
  endDate: string
  priceFinal: number
  user: { id: string; email: string; name: string | null }
  plan: { name: string; tier: string }
  invoices: {
    id: string
    invoiceNumber: string
    status: string
    amount: number
    paymentMethod: string
    createdAt: string
  }[]
  createdAt: string
}

function formatDateId(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function daysRemaining(endDate: string): number {
  const ms = new Date(endDate).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

const PAGE_SIZE = 50

export function AdminSubscriptionsView() {
  const [tab, setTab] = useState<'active' | 'pending' | 'all'>('active')
  const [subs, setSubs] = useState<Sub[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [proofTarget, setProofTarget] = useState<Sub | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actioning, setActioning] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const status =
        tab === 'active' ? 'ACTIVE' : tab === 'pending' ? 'PENDING' : 'all'
      const res = await fetch(
        `/api/admin/subscriptions?status=${status}&page=${page}&pageSize=${PAGE_SIZE}`,
      )
      const json = (await res.json()) as {
        success: boolean
        data?: { subscriptions: Sub[]; total: number }
      }
      if (json.success && json.data) {
        setSubs(json.data.subscriptions)
        setTotal(json.data.total)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page])

  async function approveInvoice(invoiceId: string) {
    setActioning(true)
    try {
      const res = await fetch(
        `/api/admin/subscriptions/invoices/${invoiceId}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        },
      )
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal approve')
        return
      }
      toast.success('Invoice di-approve, subscription aktif.')
      setProofTarget(null)
      void load()
    } finally {
      setActioning(false)
    }
  }

  async function rejectInvoice(invoiceId: string) {
    if (!rejectReason.trim()) {
      toast.error('Alasan reject wajib diisi')
      return
    }
    setActioning(true)
    try {
      const res = await fetch(
        `/api/admin/subscriptions/invoices/${invoiceId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: rejectReason }),
        },
      )
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal reject')
        return
      }
      toast.success('Invoice di-reject, user akan dapat notifikasi.')
      setProofTarget(null)
      setRejectReason('')
      void load()
    } finally {
      setActioning(false)
    }
  }

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as typeof tab)
          setPage(1)
        }}
      >
        <TabsList>
          <TabsTrigger value="active">Aktif</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="all">Semua</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <SubsTable subs={subs} loading={loading} onClickInvoice={() => {}} />
          {!loading && total > PAGE_SIZE && (
            <div className="mt-4">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                isLoading={loading}
                onPageChange={setPage}
                noun="subscription"
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <PendingTable subs={subs} loading={loading} onView={setProofTarget} />
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          <SubsTable subs={subs} loading={loading} onClickInvoice={() => {}} />
          {!loading && total > PAGE_SIZE && (
            <div className="mt-4">
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                isLoading={loading}
                onPageChange={setPage}
                noun="subscription"
              />
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Approve/reject dialog */}
      <Dialog
        open={Boolean(proofTarget)}
        onOpenChange={(o) => {
          if (!o) {
            setProofTarget(null)
            setRejectReason('')
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Verifikasi Bukti Transfer</DialogTitle>
          </DialogHeader>
          {proofTarget && <ProofPanel sub={proofTarget} />}
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Textarea
              placeholder="Alasan reject (wajib diisi kalau reject)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  if (proofTarget?.invoices[0]) {
                    rejectInvoice(proofTarget.invoices[0].id)
                  }
                }}
                disabled={actioning || !rejectReason.trim()}
              >
                <XCircle className="mr-2 size-4" />
                Reject
              </Button>
              <Button
                className={cn('flex-1', TONES.success.solid)}
                onClick={() => {
                  if (proofTarget?.invoices[0]) {
                    approveInvoice(proofTarget.invoices[0].id)
                  }
                }}
                disabled={actioning}
              >
                <CheckCircle2 className="mr-2 size-4" />
                Approve & Aktifkan
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SubsTable({
  subs,
  loading,
}: {
  subs: Sub[]
  loading: boolean
  onClickInvoice: (id: string) => void
}) {
  if (loading) {
    return <CardGridSkeleton count={2} />
  }
  if (subs.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="Tidak ada subscription"
            description="Subscription user yang aktif bakal tampil di sini."
          />
        </CardContent>
      </Card>
    )
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Durasi</TableHead>
              <TableHead>End Date</TableHead>
              <TableHead>Sisa</TableHead>
              <TableHead className="text-right">Harga</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subs.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <div className="font-medium">
                    {s.user.name || s.user.email}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {s.user.email}
                  </div>
                </TableCell>
                <TableCell>
                  {s.plan.name}{' '}
                  <span className="text-muted-foreground text-xs">
                    ({s.plan.tier})
                  </span>
                </TableCell>
                <TableCell>
                  {s.isLifetime ? '∞' : `${s.durationMonths} bln`}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {s.isLifetime ? '∞' : formatDateId(s.endDate)}
                </TableCell>
                <TableCell>
                  {s.isLifetime ? '∞' : `${daysRemaining(s.endDate)}d`}
                </TableCell>
                <TableCell className="text-right font-mono">
                  Rp {s.priceFinal.toLocaleString('id-ID')}
                </TableCell>
                <TableCell>
                  <StatusBadge
                    {...statusMeta(subscriptionStatusMeta, s.status)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function PendingTable({
  subs,
  loading,
  onView,
}: {
  subs: Sub[]
  loading: boolean
  onView: (sub: Sub) => void
}) {
  if (loading) {
    return <CardGridSkeleton count={2} />
  }
  // Filter pending yg butuh action: WAITING_CONFIRMATION (ada bukti) atau PENDING.
  const actionable = subs.filter((s) =>
    s.invoices.some(
      (i) => i.status === 'WAITING_CONFIRMATION' || i.status === 'PENDING',
    ),
  )
  if (actionable.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            title="Tidak ada pembayaran yang menunggu konfirmasi"
            description="Pembayaran subscription manual yang masuk bakal tampil di sini."
          />
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="space-y-3">
      {actionable.map((s) => {
        const invoice = s.invoices.find(
          (i) => i.status === 'WAITING_CONFIRMATION',
        )
        const isWaiting = Boolean(invoice)
        return (
          <Card key={s.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <div className="font-medium">
                  {s.user.name || s.user.email}{' '}
                  <span className="text-muted-foreground text-xs">
                    ({s.user.email})
                  </span>
                </div>
                <div className="text-muted-foreground text-sm">
                  {s.plan.name} · {s.durationMonths} bln · Rp{' '}
                  {s.priceFinal.toLocaleString('id-ID')}
                </div>
                <div className="text-muted-foreground mt-1 text-xs">
                  Invoice: {s.invoices[0]?.invoiceNumber} ·{' '}
                  {s.invoices[0]?.paymentMethod} ·{' '}
                  <StatusBadge
                    {...statusMeta(
                      subscriptionInvoiceStatusMeta,
                      s.invoices[0]?.status ?? '',
                    )}
                  />
                </div>
              </div>
              {isWaiting ? (
                <Button onClick={() => onView(s)} size="sm">
                  <ExternalLink className="mr-2 size-4" />
                  Cek Bukti
                </Button>
              ) : (
                <Badge variant="outline">Menunggu transfer</Badge>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function ProofPanel({ sub }: { sub: Sub }) {
  const [detail, setDetail] = useState<{
    invoices: {
      id: string
      manualProofUrl: string | null
      manualNote: string | null
      uniqueCode: number
      amount: number
      invoiceNumber: string
      status: string
    }[]
  } | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/admin/subscriptions/${sub.id}`)
      const json = (await res.json()) as {
        success: boolean
        data?: typeof detail
      }
      if (json.success && json.data) setDetail(json.data)
    })()
  }, [sub.id])

  const invoice = detail?.invoices.find(
    (i) => i.status === 'WAITING_CONFIRMATION',
  )

  if (!invoice) {
    return (
      <p className="text-muted-foreground py-4 text-sm">Memuat invoice...</p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="bg-muted/20 rounded-lg border p-3 text-sm">
        <div>
          <strong>{invoice.invoiceNumber}</strong>
        </div>
        <div className="font-mono">
          Rp {invoice.amount.toLocaleString('id-ID')} (kode unik:{' '}
          {invoice.uniqueCode})
        </div>
        {invoice.manualNote && (
          <div className="text-muted-foreground mt-1">
            Note user: {invoice.manualNote}
          </div>
        )}
      </div>
      {invoice.manualProofUrl ? (
        <a
          href={invoice.manualProofUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            src={invoice.manualProofUrl}
            alt="Bukti transfer"
            className="max-h-96 w-full rounded-lg border object-contain"
          />
        </a>
      ) : (
        <p className="text-muted-foreground text-sm">Bukti tidak tersedia.</p>
      )}
    </div>
  )
}
