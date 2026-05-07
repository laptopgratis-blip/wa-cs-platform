'use client'

// Manage subscription user — current plan + history + tombol perpanjang/cancel.
import { CheckCircle2, Clock, Crown, Loader2, RefreshCw, XCircle } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Aktif', className: 'bg-emerald-100 text-emerald-700' },
  PENDING: { label: 'Menunggu Pembayaran', className: 'bg-amber-100 text-amber-700' },
  EXPIRED: { label: 'Berakhir', className: 'bg-warm-100 text-warm-700' },
  CANCELLED: { label: 'Dibatalkan', className: 'bg-rose-100 text-rose-700' },
  PAID: { label: 'Lunas', className: 'bg-emerald-100 text-emerald-700' },
  WAITING_CONFIRMATION: {
    label: 'Menunggu Konfirmasi',
    className: 'bg-blue-100 text-blue-700',
  },
}

export function SubscriptionDashboard() {
  const [current, setCurrent] = useState<CurrentSubscription | null>(null)
  const [history, setHistory] = useState<HistorySubscription[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelTarget, setCancelTarget] = useState<CurrentSubscription | null>(null)
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
      toast.success(`Subscription dibatalkan. Akses tetap aktif sampai ${formatDateId(cancelTarget.endDate)}.`)
      setCancelTarget(null)
      void load()
    } finally {
      setCancelling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="mr-2 size-5 animate-spin" />
        Memuat...
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="font-display text-2xl font-extrabold">
          Subscription Plan
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kelola plan aktif & lihat history pembayaran subscription.
        </p>
      </header>

      {/* Current subscription */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="size-5 text-primary-500" />
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
                  <div className="font-display text-xl font-bold">
                    {current.plan.name}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({current.plan.tier})
                    </span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {current.plan.maxLp >= 999 ? 'Unlimited' : current.plan.maxLp} LP ·{' '}
                    {current.plan.maxStorageMB} MB storage
                  </div>
                </div>
                <Badge className={STATUS_BADGE[current.status]?.className}>
                  {STATUS_BADGE[current.status]?.label ?? current.status}
                </Badge>
              </div>

              <div className="grid gap-4 rounded-lg border bg-muted/20 p-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-muted-foreground">Tanggal Mulai</div>
                  <div className="font-medium">
                    {formatDateId(current.startDate)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">
                    {current.isLifetime ? 'Berlaku Sampai' : 'Berakhir'}
                  </div>
                  <div className="font-medium">
                    {current.isLifetime
                      ? '∞ Lifetime'
                      : formatDateId(current.endDate)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Sisa</div>
                  <div className="font-medium">
                    {current.isLifetime ? '∞' : `${current.daysRemaining} hari`}
                  </div>
                </div>
              </div>

              {current.cancelledAt && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Subscription telah dibatalkan tapi akses tetap aktif sampai{' '}
                  {formatDateId(current.endDate)}. Setelah itu otomatis turun ke
                  FREE plan.
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {!current.isLifetime && current.status === 'ACTIVE' && (
                  <>
                    <Button asChild>
                      <Link href={`/upgrade?plan=${current.plan.id}&duration=12`}>
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
                  <p className="text-sm text-muted-foreground">
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
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada subscription.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
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
                      <td className="py-2 pr-3 text-muted-foreground">
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
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px]',
                            STATUS_BADGE[s.status]?.className,
                          )}
                        >
                          {STATUS_BADGE[s.status]?.label ?? s.status}
                        </Badge>
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
    </div>
  )
}
