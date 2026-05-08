'use client'

// Card view untuk /pesanan — layout kaya detail per order. Cocok saat user mau
// cek visual breakdown harga, alamat lengkap, pixel status. Default-nya
// tabel padat (lebih cocok untuk bulk operasional).
import { ExternalLink, Loader2, MessageCircle } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { formatRelativeTime } from '@/lib/format-time'

import type { OrderListItem, QuickAction } from './types'

interface Props {
  orders: OrderListItem[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onOpenDetail: (id: string) => void
  onQuickAction: (order: OrderListItem, action: QuickAction) => void
  onRefirePixel: (order: OrderListItem) => void
  loading: boolean
}

export function OrderCardView({
  orders,
  selectedIds,
  onToggleSelect,
  onOpenDetail,
  onQuickAction,
  onRefirePixel,
  loading,
}: Props) {
  if (loading && orders.length === 0) {
    return (
      <div className="py-8 text-center">
        <Loader2 className="inline size-5 animate-spin" />
      </div>
    )
  }
  if (orders.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Tidak ada pesanan.
      </p>
    )
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {orders.map((o) => (
        <OrderCard
          key={o.id}
          order={o}
          selected={selectedIds.has(o.id)}
          onToggleSelect={() => onToggleSelect(o.id)}
          onOpenDetail={() => onOpenDetail(o.id)}
          onQuickAction={onQuickAction}
          onRefirePixel={onRefirePixel}
        />
      ))}
    </div>
  )
}

function OrderCard({
  order,
  selected,
  onToggleSelect,
  onOpenDetail,
  onQuickAction,
  onRefirePixel,
}: {
  order: OrderListItem
  selected: boolean
  onToggleSelect: () => void
  onOpenDetail: () => void
  onQuickAction: (o: OrderListItem, a: QuickAction) => void
  onRefirePixel: (o: OrderListItem) => void
}) {
  const isUnpaid =
    order.paymentStatus === 'PENDING' ||
    order.paymentStatus === 'WAITING_CONFIRMATION'
  const isWaitingConf = order.paymentStatus === 'WAITING_CONFIRMATION'
  const isPaid = order.paymentStatus === 'PAID'
  const isShipped = order.deliveryStatus === 'SHIPPED'
  const isDelivered = order.deliveryStatus === 'DELIVERED'
  const isCancelled =
    order.paymentStatus === 'CANCELLED' || order.deliveryStatus === 'CANCELLED'
  const [renderTime] = useState(() => Date.now())
  const isNew = renderTime - new Date(order.createdAt).getTime() < 60 * 60 * 1000
  const itemsSummary =
    order.items.length === 0
      ? '—'
      : order.items
          .slice(0, 3)
          .map((it) => `${it.name}${it.qty > 1 ? ` × ${it.qty}` : ''}`)
          .join(', ')
  return (
    <Card
      className={`rounded-xl border-warm-200 shadow-sm ${
        selected ? 'ring-2 ring-primary-500' : ''
      } ${isCancelled ? 'opacity-70' : ''}`}
    >
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelect}
              aria-label="Pilih"
            />
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
          </div>
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
          {order.items.length > 0 && <p>🛒 {itemsSummary}</p>}
          {order.invoiceNumber ? (
            <div className="space-y-0.5 rounded-lg bg-warm-50 px-2 py-1.5 text-xs text-warm-700">
              <p className="font-mono text-warm-900">📄 {order.invoiceNumber}</p>
              {(order.subtotalRp ?? 0) > 0 && (
                <p>
                  💰 Subtotal: Rp{' '}
                  {(order.subtotalRp ?? 0).toLocaleString('id-ID')}
                </p>
              )}
              {(order.flashSaleDiscountRp ?? 0) > 0 && (
                <p className="text-amber-700">
                  ⚡ Hemat Flash: -Rp{' '}
                  {(order.flashSaleDiscountRp ?? 0).toLocaleString('id-ID')}
                </p>
              )}
              {(order.shippingCostRp ?? 0) > 0 && (
                <p>
                  🚚 Ongkir{' '}
                  {order.shippingCourier && order.shippingService
                    ? `${order.shippingCourier.toUpperCase()} ${order.shippingService}`
                    : ''}
                  : Rp {(order.shippingCostRp ?? 0).toLocaleString('id-ID')}
                </p>
              )}
              {(order.shippingSubsidyRp ?? 0) > 0 && (
                <p className="text-blue-700">
                  🎁 Subsidi {order.appliedZoneName ?? ''}: -Rp{' '}
                  {(order.shippingSubsidyRp ?? 0).toLocaleString('id-ID')}
                </p>
              )}
              <p className="font-bold text-warm-900">
                Total: Rp{' '}
                {((order.totalRp ?? order.totalAmount) ?? 0).toLocaleString(
                  'id-ID',
                )}
                {order.uniqueCode ? ` (kode +${order.uniqueCode})` : ''}
              </p>
            </div>
          ) : (
            order.totalAmount !== null && (
              <p>💰 Total: Rp {order.totalAmount.toLocaleString('id-ID')}</p>
            )
          )}
          <p>
            💳 Bayar: {order.paymentMethod}
            {order.paymentProofUrl && (
              <a
                href={order.paymentProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-primary-600 underline"
              >
                Lihat bukti
              </a>
            )}
          </p>
          {order.invoiceNumber && (
            <div className="flex items-start justify-between gap-2 text-xs text-warm-600">
              <span className="flex-1">
                📊 Pixel:{' '}
                {order.pixelPurchaseFiredAt ? (
                  <span className="text-emerald-700">
                    ✅ Purchase ·{' '}
                    {formatRelativeTime(order.pixelPurchaseFiredAt)}
                  </span>
                ) : order.pixelLeadFiredAt ? (
                  <span className="text-emerald-700">
                    ✅ Lead · {formatRelativeTime(order.pixelLeadFiredAt)}
                  </span>
                ) : (
                  <span className="text-warm-500">⏳ Belum fired</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onRefirePixel(order)}
                className="shrink-0 rounded border border-warm-300 px-1.5 py-0.5 text-[10px] text-warm-600 hover:bg-warm-100"
              >
                Re-fire
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-3">
          {isUnpaid && (
            <Button
              size="sm"
              variant="outline"
              className={
                isWaitingConf
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : ''
              }
              onClick={() => onQuickAction(order, 'mark_paid')}
            >
              ✓ {isWaitingConf ? 'Konfirmasi' : 'Lunas'}
            </Button>
          )}
          {isUnpaid && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => onQuickAction(order, 'reject')}
            >
              ✕ Tolak
            </Button>
          )}
          {isPaid && !isShipped && !isDelivered && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onQuickAction(order, 'mark_shipped')}
            >
              📦 Dikirim
            </Button>
          )}
          {isShipped && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onQuickAction(order, 'mark_delivered')}
            >
              ✅ Selesai
            </Button>
          )}
          <Button size="sm" onClick={onOpenDetail}>
            <ExternalLink className="mr-1 size-3" /> Detail
          </Button>
          {order.contactId && (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/inbox?contact=${order.contactId}`}>
                <MessageCircle className="mr-1 size-3" /> Chat
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
