'use client'

// Manage subscription user — current plan + history + tombol perpanjang/cancel.
import {
  CheckCircle2,
  Clock,
  Crown,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { statusMeta, subscriptionStatusMeta } from '@/lib/status'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface CurrentSubscription {
  id: string
  status: string
  isLifetime: boolean
  durationMonths: number
  startDate: string
  endDate: string
  daysRemaining: number
  priceFinal: number
  cancelledAt: string | null
  plan: {
    id: string
    name: string
    tier: string
    maxLp: number
    maxStorageMB: number
    priceMonthly: number
  }
}

interface HistorySubscription {
  id: string
  status: string
  durationMonths: number
  isLifetime: boolean
  startDate: string
  endDate: string
  priceFinal: number
  plan: { name: string; tier: string }
  invoices: {
    id: string
    invoiceNumber: string
    amount: number
    status: string
    paymentMethod: string
    paidAt: string | null
    createdAt: string
    paymentUrl: string | null
  }[]
  cancelledAt: string | null
  createdAt: string
}

function formatDateId(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

// Badge status subscription — label+tone dari registry lib/status.ts.
function SubStatusBadge({ status }: { status: string }) {
  const meta = statusMeta(subscriptionStatusMeta, status)
  return <StatusBadge tone={meta.tone} label={meta.label} />
}

export function SubscriptionDashboard() {
  const [current, setCurrent] = useState<CurrentSubscription | null>(null)
  const [history, setHistory] = useState<HistorySubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelTarget, setCancelTarget] = useState<CurrentSubscription | null>(
    null,
  )
  const [cancelling, setCancelling] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [curRes, histRes] = await Promise.all([
        fetch('/api/subscription/current'),
        fetch('/api/subscription/history'),
      ])
      const curJson = (await curRes.json()) as {
        success: boolean
        data?: { subscription: CurrentSubscription | null }
      }
      const histJson = (await histRes.json()) as {
        success: boolean
        data?: { subscriptions: HistorySubscription[] }
      }
      if (curJson.success) setCurrent(curJson.data?.subscription ?? null)
      if (histJson.success) setHistory(histJson.data?.subscriptions ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleCancel() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      const res = await fetch('/api/subscription/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptionId: cancelTarget.id,
          reason: 'User request',
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal cancel')
        return
      }
      toast.success(
        `Subscription dibatalkan. Akses tetap aktif sampai ${formatDateId(cancelTarget.endDate)}.`,
      )
      setCancelTarget(null)
      void load()
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <PageContainer width="narrow">
        <CardGridSkeleton count={2} />
      </PageContainer>
    )
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Subscription Plan"
        description="Kelola plan aktif & lihat history pembayaran subscription."
      />

      {/* Current subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="text-primary-500 size-5" />
            Plan Aktif
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!current ? (
            <div className="space-y-3 py-4 text-center">
              <p className="text-muted-foreground">
                Kamu belum punya subscription aktif. Plan saat ini:{' '}
                <Badge variant="outline">FREE</Badge>
              </p>
              <Button asChild>
                <Link href="/pricing">Lihat Plan Berbayar</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display text-xl font-semibold">
                    {current.plan.name}{' '}
                    <span className="text-muted-foreground font-normal">
                      ({current.plan.tier})
                    </span>
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {current.plan.maxLp >= 999
                      ? 'Unlimited'
                      : current.plan.maxLp}{' '}
                    LP · {current.plan.maxStorageMB} MB storage
                  </div>
                </div>
                <SubStatusBadge status={current.status} />
              </div>

              <div className="bg-muted/20 grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
                <div>
                  <div className="text-muted-foreground text-xs">
                    Tanggal Mulai
                  </div>
                  <div className="font-medium">
                    {formatDateId(current.startDate)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">
                    {current.isLifetime ? 'Berlaku Sampai' : 'Berakhir'}
                  </div>
                  <div className="font-medium">
                    {current.isLifetime
                      ? '∞ Lifetime'
                      : formatDateId(current.endDate)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Sisa</div>
                  <div className="font-medium">
                    {current.isLifetime ? '∞' : `${current.daysRemaining} hari`}
                  </div>
                </div>
              </div>

              {current.cancelledAt && (
                <div
                  className={cn(
                    'rounded-lg border p-3 text-sm',
                    TONES.warning.border,
                    TONES.warning.bg,
                    TONES.warning.text,
                  )}
                >
                  Subscription telah dibatalkan tapi akses tetap aktif sampai{' '}
                  {formatDateId(current.endDate)}. Setelah itu otomatis turun ke
                  FREE plan.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {/* CANCELLED belum lewat endDate tetap boleh perpanjang/
                    upgrade — checkout chain dari endDate (sisa hari aman). */}
                {!current.isLifetime &&
                  (current.status === 'ACTIVE' ||
                    current.status === 'CANCELLED') && (
                    <>
                      <Button asChild>
                        <Link
                          href={`/upgrade?plan=${current.plan.id}&duration=12`}
                        >
                          <RefreshCw className="mr-2 size-4" />
                          Perpanjang
                        </Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link href="/pricing">Upgrade Plan</Link>
                      </Button>
                      {!current.cancelledAt && (
                        <Button
                          variant="outline"
                          onClick={() => setCancelTarget(current)}
                        >
                          <XCircle className="mr-2 size-4" />
                          Cancel
                        </Button>
                      )}
                    </>
                  )}
                {current.isLifetime && (
                  <p className="text-muted-foreground text-sm">
                    Plan lifetime — tidak ada masa berakhir.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Riwayat Pembayaran</CardTitle>
          <CardDescription>
            Semua subscription yang pernah dibuat di akun ini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Belum ada subscription.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-medium">Tanggal</th>
                    <th className="py-2 pr-3 font-medium">Plan</th>
                    <th className="py-2 pr-3 font-medium">Durasi</th>
                    <th className="py-2 pr-3 text-right font-medium">Harga</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="text-muted-foreground py-2 pr-3">
                        {formatDateId(s.createdAt)}
                      </td>
                      <td className="py-2 pr-3">{s.plan.name}</td>
                      <td className="py-2 pr-3">
                        {s.isLifetime ? '∞' : `${s.durationMonths} bln`}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">
                        Rp {s.priceFinal.toLocaleString('id-ID')}
                      </td>
                      <td className="py-2 pr-3">
                        <SubStatusBadge status={s.status} />
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {s.invoices[0]?.invoiceNumber ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel confirm dialog */}
      <Dialog
        open={Boolean(cancelTarget)}
        onOpenChange={(o) => !o && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Subscription?</DialogTitle>
            <DialogDescription>
              Subscription akan tetap aktif sampai{' '}
              <strong>
                {cancelTarget && formatDateId(cancelTarget.endDate)}
              </strong>
              . Setelah itu akun otomatis turun ke FREE plan. Tidak ada refund
              untuk sisa periode.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCancelTarget(null)}
              disabled={cancelling}
            >
              Tidak jadi
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 size-4" />
              )}
              Ya, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  )
}
