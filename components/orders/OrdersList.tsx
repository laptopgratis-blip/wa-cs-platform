'use client'

// Halaman utama /pesanan. Tabs + search + date filter + cards.
// Refetch otomatis saat tab/search/date berubah (debounce search).
import {
  Download,
  ExternalLink,
  MessageCircle,
  Package,
  Search,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { OrderDetailDialog } from '@/components/orders/OrderDetailDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatRelativeTime } from '@/lib/format-time'

export interface OrderItem {
  name: string
  qty: number
  price?: number | null
}

export interface OrderListItem {
  id: string
  customerName: string
  customerPhone: string
  customerAddress: string | null
  items: OrderItem[]
  totalAmount: number | null
  paymentMethod: string
  paymentStatus: string
  deliveryStatus: string
  trackingNumber: string | null
  flowName: string | null
  notes: string | null
  contactId: string
  createdAt: string
  updatedAt: string
}

export interface OrdersCounts {
  all: number
  pending: number
  paid: number
  shipped: number
  completed: number
}

const TABS: Array<{ key: keyof OrdersCounts; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'pending', label: 'Menunggu' },
  { key: 'paid', label: 'Sudah Bayar' },
  { key: 'shipped', label: 'Dikirim' },
  { key: 'completed', label: 'Selesai' },
]

interface Props {
  initial: OrderListItem[]
  initialCounts: OrdersCounts
}

export function OrdersList({ initial, initialCounts }: Props) {
  const [tab, setTab] = useState<keyof OrdersCounts>('all')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [orders, setOrders] = useState<OrderListItem[]>(initial)
  const [counts, setCounts] = useState<OrdersCounts>(initialCounts)
  const [loading, setLoading] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  // Debounce search supaya tidak fetch di setiap keystroke.
  useEffect(() => {
    const tid = setTimeout(() => {
      void refetch()
    }, search ? 300 : 0)
    return () => clearTimeout(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, from, to])

  async function refetch() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('tab', String(tab))
      if (search.trim()) params.set('q', search.trim())
      if (from) params.set('from', new Date(from).toISOString())
      if (to) {
        // include sampai akhir hari `to`
        const end = new Date(to)
        end.setHours(23, 59, 59, 999)
        params.set('to', end.toISOString())
      }
      const res = await fetch(`/api/orders?${params.toString()}`)
      const json = (await res.json().catch(() => null)) as
        | {
            success: boolean
            data?: { orders: OrderListItem[]; counts: OrdersCounts }
            error?: string
          }
        | null
      if (!res.ok || !json?.success || !json.data) {
        toast.error(json?.error ?? 'Gagal memuat pesanan')
        return
      }
      setOrders(json.data.orders)
      setCounts(json.data.counts)
    } finally {
      setLoading(false)
    }
  }

  async function quickAction(
    order: OrderListItem,
    action: 'mark_paid' | 'mark_shipped' | 'mark_delivered',
  ) {
    const body: Record<string, unknown> = {}
    if (action === 'mark_paid') body.paymentStatus = 'PAID'
    if (action === 'mark_shipped') body.deliveryStatus = 'SHIPPED'
    if (action === 'mark_delivered') body.deliveryStatus = 'DELIVERED'

    const res = await fetch(`/api/orders/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as
      | { success: boolean; error?: string }
      | null
    if (!res.ok || !json?.success) {
      toast.error(json?.error ?? 'Gagal memperbarui status')
      return
    }
    toast.success(
      action === 'mark_paid'
        ? 'Ditandai lunas'
        : action === 'mark_shipped'
          ? 'Ditandai dikirim'
          : 'Ditandai selesai',
    )
    void refetch()
  }

  function exportCsv() {
    const params = new URLSearchParams()
    params.set('tab', String(tab))
    if (from) params.set('from', new Date(from).toISOString())
    if (to) {
      const end = new Date(to)
      end.setHours(23, 59, 59, 999)
      params.set('to', end.toISOString())
    }
    window.open(`/api/orders/export?${params.toString()}`, '_blank')
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            Pesanan Masuk
          </h1>
          <p className="mt-1 text-sm text-warm-500">
            Pesanan yang ditangani AI dan flow otomatis.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv}>
          <Download className="mr-2 size-4" />
          Export CSV
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, nomor HP, atau catatan..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-auto"
            aria-label="Dari tanggal"
          />
          <span className="text-sm text-muted-foreground">—</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-auto"
            aria-label="Sampai tanggal"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as keyof OrdersCounts)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="gap-2">
              {t.label}
              <Badge variant="secondary" className="font-normal">
                {counts[t.key]}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* List */}
      {loading && orders.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Memuat...
        </p>
      ) : orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Package className="size-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">Belum ada pesanan</p>
              <p className="text-sm text-muted-foreground">
                Pesanan masuk akan muncul di sini saat customer selesai flow
                pemesanan.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {orders.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              onOpenDetail={() => setDetailId(o.id)}
              onQuickAction={quickAction}
            />
          ))}
        </div>
      )}

      <OrderDetailDialog
        orderId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => void refetch()}
      />
    </>
  )
}

// ── Card untuk satu pesanan ─────────────────────────────────────────────────

interface CardProps {
  order: OrderListItem
  onOpenDetail: () => void
  onQuickAction: (
    order: OrderListItem,
    action: 'mark_paid' | 'mark_shipped' | 'mark_delivered',
  ) => void
}

function OrderCard({ order, onOpenDetail, onQuickAction }: CardProps) {
  const isUnpaid = order.paymentStatus === 'PENDING'
  const isPaid = order.paymentStatus === 'PAID'
  const isShipped = order.deliveryStatus === 'SHIPPED'
  const isDelivered = order.deliveryStatus === 'DELIVERED'
  const isCancelled =
    order.paymentStatus === 'CANCELLED' || order.deliveryStatus === 'CANCELLED'
  const isNew = useMemo(() => {
    return Date.now() - new Date(order.createdAt).getTime() < 1000 * 60 * 60
  }, [order.createdAt])

  const itemsSummary =
    order.items.length === 0
      ? '—'
      : order.items
          .slice(0, 3)
          .map((it) => `${it.name}${it.qty > 1 ? ` × ${it.qty}` : ''}`)
          .join(', ')
  return (
    <Card className="rounded-xl border-warm-200 shadow-sm">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-xs">
            {isNew && <Badge className="bg-emerald-500 text-white">🆕 Baru</Badge>}
            {isCancelled && (
              <Badge variant="outline" className="text-destructive">
                Dibatalkan
              </Badge>
            )}
            <span className="text-muted-foreground">
              {formatRelativeTime(order.createdAt)}
            </span>
          </span>
          {order.flowName && (
            <Badge variant="secondary" className="font-normal">
              {order.flowName}
            </Badge>
          )}
        </div>

        <div className="space-y-1 text-sm">
          <p className="font-medium">👤 {order.customerName}</p>
          <p className="text-muted-foreground">📞 {order.customerPhone}</p>
          {order.customerAddress && (
            <p className="line-clamp-2 text-muted-foreground">
              📍 {order.customerAddress}
            </p>
          )}
        </div>

        <div className="space-y-1 border-t pt-2 text-sm">
          {order.items.length > 0 && (
            <p>🛒 {itemsSummary}</p>
          )}
          {order.totalAmount !== null && (
            <p>💰 Total: Rp {order.totalAmount.toLocaleString('id-ID')}</p>
          )}
          <p>💳 Bayar: {order.paymentMethod}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs">
          <span className="text-muted-foreground">Status:</span>
          <PaymentBadge status={order.paymentStatus} />
          <DeliveryBadge status={order.deliveryStatus} />
          {order.trackingNumber && (
            <span className="text-muted-foreground">
              · Resi: {order.trackingNumber}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-3">
          {isUnpaid && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onQuickAction(order, 'mark_paid')}
            >
              ✓ Tandai Lunas
            </Button>
          )}
          {isPaid && !isShipped && !isDelivered && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onQuickAction(order, 'mark_shipped')}
            >
              📦 Tandai Dikirim
            </Button>
          )}
          {isShipped && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onQuickAction(order, 'mark_delivered')}
            >
              ✅ Tandai Selesai
            </Button>
          )}
          <Button size="sm" onClick={onOpenDetail}>
            <ExternalLink className="mr-1 size-3" />
            Detail
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/inbox?contact=${order.contactId}`}>
              <MessageCircle className="mr-1 size-3" />
              Chat
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    PENDING: {
      label: '⏳ Belum bayar',
      className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40',
    },
    PAID: {
      label: '✓ Lunas',
      className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40',
    },
    CANCELLED: {
      label: 'Dibatalkan',
      className: 'bg-warm-100 text-warm-700 dark:bg-warm-900/40',
    },
  }
  const v = map[status] ?? { label: status, className: '' }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${v.className}`}
    >
      {v.label}
    </span>
  )
}

function DeliveryBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    PENDING: {
      label: '⏳ Menunggu kirim',
      className: 'bg-warm-100 text-warm-900 dark:bg-warm-900/40',
    },
    PROCESSING: {
      label: '⚙️ Proses',
      className: 'bg-sky-100 text-sky-900 dark:bg-sky-950/40',
    },
    SHIPPED: {
      label: '🚚 Dikirim',
      className: 'bg-blue-100 text-blue-900 dark:bg-blue-950/40',
    },
    DELIVERED: {
      label: '✅ Selesai',
      className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40',
    },
    CANCELLED: {
      label: 'Dibatalkan',
      className: 'bg-warm-100 text-warm-700 dark:bg-warm-900/40',
    },
  }
  const v = map[status] ?? { label: status, className: '' }
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${v.className}`}
    >
      {v.label}
    </span>
  )
}

