'use client'

// Card view untuk /pesanan — layout kaya detail per order. Cocok saat user mau
// cek visual breakdown harga, alamat lengkap, pixel status. Default-nya
// tabel padat (lebih cocok untuk bulk operasional).
import {
  Activity,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  Gift,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  ShoppingCart,
  Truck,
  User,
  Warehouse,
  X,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { EmptyState } from '@/components/shared/EmptyState'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { formatShippingArea } from '@/lib/format'
import { formatRelativeTime } from '@/lib/format-time'
import { TONES } from '@/lib/ui-tones'

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
    return <CardGridSkeleton count={4} />
  }
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Tidak ada pesanan"
        description="Pesanan baru dari form order & CS AI bakal muncul di sini."
      />
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
  const isNew =
    renderTime - new Date(order.createdAt).getTime() < 60 * 60 * 1000
  const itemsSummary =
    order.items.length === 0
      ? '—'
      : order.items
          .slice(0, 3)
          .map((it) => `${it.name}${it.qty > 1 ? ` × ${it.qty}` : ''}`)
          .join(', ')
  return (
    <Card
      className={`${
        selected ? 'ring-primary-500 ring-2' : ''
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
              {isNew && <Badge className={TONES.success.solid}>Baru</Badge>}
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
          <p className="flex items-center gap-1.5 font-medium">
            <User className="text-warm-400 size-3.5 shrink-0" aria-hidden />
            {order.customerName}
          </p>
          <p className="text-muted-foreground flex items-center gap-1.5">
            <Phone className="text-warm-400 size-3.5 shrink-0" aria-hidden />
            {order.customerPhone}
          </p>
          {order.customerAddress && (
            <p className="text-muted-foreground flex items-start gap-1.5">
              <MapPin
                className="text-warm-400 mt-0.5 size-3.5 shrink-0"
                aria-hidden
              />
              <span className="line-clamp-2">
                {order.customerAddress}
                {formatShippingArea(order) && (
                  <span className="text-warm-500">
                    {' '}
                    · {formatShippingArea(order)}
                  </span>
                )}
              </span>
            </p>
          )}
        </div>

        <div className="space-y-1 border-t pt-2 text-sm">
          {order.items.length > 0 && (
            <p className="flex items-start gap-1.5">
              <ShoppingCart
                className="text-warm-400 mt-0.5 size-3.5 shrink-0"
                aria-hidden
              />
              <span>{itemsSummary}</span>
            </p>
          )}
          {order.invoiceNumber ? (
            <div className="bg-warm-50 text-warm-700 space-y-0.5 rounded-lg px-2 py-1.5 text-xs">
              <p className="text-warm-900 flex items-center gap-1.5 font-mono">
                <FileText
                  className="text-warm-400 size-3 shrink-0"
                  aria-hidden
                />
                {order.invoiceNumber}
              </p>
              {(order.subtotalRp ?? 0) > 0 && (
                <p>
                  Subtotal: Rp {(order.subtotalRp ?? 0).toLocaleString('id-ID')}
                </p>
              )}
              {(order.flashSaleDiscountRp ?? 0) > 0 && (
                <p className="text-primary-700 flex items-center gap-1">
                  <Zap className="size-3 shrink-0" aria-hidden />
                  Hemat Flash: -Rp{' '}
                  {(order.flashSaleDiscountRp ?? 0).toLocaleString('id-ID')}
                </p>
              )}
              {(order.shippingCostRp ?? 0) > 0 && (
                <p className="flex items-center gap-1">
                  <Truck
                    className="text-warm-400 size-3 shrink-0"
                    aria-hidden
                  />
                  Ongkir{' '}
                  {order.shippingCourier && order.shippingService
                    ? `${order.shippingCourier.toUpperCase()} ${order.shippingService}`
                    : ''}
                  : Rp {(order.shippingCostRp ?? 0).toLocaleString('id-ID')}
                </p>
              )}
              {(order.shippingSubsidyRp ?? 0) > 0 && (
                <p className="text-primary-700 flex items-center gap-1">
                  <Gift className="size-3 shrink-0" aria-hidden />
                  Subsidi {order.appliedZoneName ?? ''}: -Rp{' '}
                  {(order.shippingSubsidyRp ?? 0).toLocaleString('id-ID')}
                </p>
              )}
              {order.originSnapshot?.name && (
                <p className="text-warm-600 flex items-center gap-1">
                  <Warehouse className="size-3.5 shrink-0" />
                  Dikirim dari: {order.originSnapshot.name}
                </p>
              )}
              <p className="text-warm-900 font-bold">
                Total: Rp{' '}
                {(order.totalRp ?? order.totalAmount ?? 0).toLocaleString(
                  'id-ID',
                )}
                {order.uniqueCode ? ` (kode +${order.uniqueCode})` : ''}
              </p>
            </div>
          ) : (
            order.totalAmount !== null && (
              <p className="flex items-center gap-1.5">
                <Banknote
                  className="text-warm-400 size-3.5 shrink-0"
                  aria-hidden
                />
                Total: Rp {order.totalAmount.toLocaleString('id-ID')}
              </p>
            )
          )}
          <p className="flex items-center gap-1.5">
            <CreditCard
              className="text-warm-400 size-3.5 shrink-0"
              aria-hidden
            />
            Bayar: {order.paymentMethod}
            {order.paymentProofUrl && (
              <a
                href={order.paymentProofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 ml-2 underline"
              >
                Lihat bukti
              </a>
            )}
          </p>
          {order.invoiceNumber && (
            <div className="text-warm-600 flex items-start justify-between gap-2 text-xs">
              <span className="flex flex-1 items-center gap-1">
                <Activity
                  className="text-warm-400 size-3 shrink-0"
                  aria-hidden
                />
                Pixel:{' '}
                {order.pixelPurchaseFiredAt ? (
                  <span
                    className={`inline-flex items-center gap-1 ${TONES.success.text}`}
                  >
                    <CheckCircle2 className="size-3" aria-hidden />
                    Purchase · {formatRelativeTime(order.pixelPurchaseFiredAt)}
                  </span>
                ) : order.pixelLeadFiredAt ? (
                  <span
                    className={`inline-flex items-center gap-1 ${TONES.success.text}`}
                  >
                    <CheckCircle2 className="size-3" aria-hidden />
                    Lead · {formatRelativeTime(order.pixelLeadFiredAt)}
                  </span>
                ) : (
                  <span className="text-warm-500 inline-flex items-center gap-1">
                    <Clock className="size-3" aria-hidden />
                    Belum fired
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => onRefirePixel(order)}
                className="border-warm-300 text-warm-600 hover:bg-warm-100 shrink-0 rounded border px-1.5 py-0.5 text-xs"
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
                  ? `${TONES.success.border} ${TONES.success.bg} ${TONES.success.text}`
                  : ''
              }
              onClick={() => onQuickAction(order, 'mark_paid')}
            >
              <Check className="mr-1 size-3.5" aria-hidden />
              {isWaitingConf ? 'Konfirmasi' : 'Lunas'}
            </Button>
          )}
          {isUnpaid && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => onQuickAction(order, 'reject')}
            >
              <X className="mr-1 size-3.5" aria-hidden />
              Tolak
            </Button>
          )}
          {isPaid && !isShipped && !isDelivered && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onQuickAction(order, 'mark_shipped')}
            >
              <Package className="mr-1 size-3.5" aria-hidden />
              Dikirim
            </Button>
          )}
          {isShipped && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onQuickAction(order, 'mark_delivered')}
            >
              <CheckCircle2 className="mr-1 size-3.5" aria-hidden />
              Selesai
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
