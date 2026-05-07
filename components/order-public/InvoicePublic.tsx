'use client'

// Halaman invoice public — customer-facing setelah submit form.
// COD: tampilan ringkas + info bayar di tempat.
// TRANSFER: list rekening + upload bukti / kirim via WA.
import {
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Image as ImageIcon,
  MessageCircle,
  Package,
  Truck,
  Upload,
  XCircle,
} from 'lucide-react'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  PixelLoader,
  type BrowserPixel,
  firePixelEvent,
  generateEventId,
} from '@/components/pixels/PixelLoader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'

interface OrderItem {
  productId: string
  name: string
  price: number
  originalPrice: number
  qty: number
  isFlashSale: boolean
}

interface OrderData {
  invoiceNumber: string
  customerName: string
  customerPhone: string
  shippingAddress: string | null
  shippingCityName: string | null
  shippingProvinceName: string | null
  shippingPostalCode: string | null
  items: OrderItem[]
  subtotalRp: number
  flashSaleDiscountRp: number
  shippingCourier: string | null
  shippingService: string | null
  shippingCostRp: number
  shippingSubsidyRp: number
  appliedZoneName: string | null
  totalRp: number
  uniqueCode: number | null
  paymentMethod: string
  paymentStatus: string
  paymentProofUrl: string | null
  deliveryStatus: string
  trackingNumber: string | null
  createdAt: string
}

interface BankSnapshot {
  bankName: string
  accountNumber: string
  accountName: string
  isDefault: boolean
}

interface InvoicePublicProps {
  order: OrderData
  banks: BankSnapshot[]
  ownerName: string
  waConfirm: { number: string; template: string | null } | null
  pixels?: BrowserPixel[]
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
    PENDING: {
      label: 'Menunggu Pembayaran',
      cls: 'bg-amber-100 text-amber-800',
      icon: Clock,
    },
    WAITING_CONFIRMATION: {
      label: 'Menunggu Konfirmasi',
      cls: 'bg-blue-100 text-blue-800',
      icon: Clock,
    },
    PAID: {
      label: 'Pembayaran Diterima',
      cls: 'bg-emerald-100 text-emerald-800',
      icon: CheckCircle2,
    },
    CANCELLED: {
      label: 'Dibatalkan',
      cls: 'bg-rose-100 text-rose-800',
      icon: XCircle,
    },
  }
  const m = map[status] ?? map.PENDING
  const Icon = m.icon
  return (
    <Badge className={`${m.cls} hover:${m.cls} gap-1`}>
      <Icon className="size-3" />
      {m.label}
    </Badge>
  )
}

export function InvoicePublic({
  order,
  banks,
  ownerName,
  waConfirm,
  pixels = [],
}: InvoicePublicProps) {
  const [proofUrl, setProofUrl] = useState<string | null>(order.paymentProofUrl)
  const [paymentStatus, setPaymentStatus] = useState(order.paymentStatus)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const isCod = order.paymentMethod === 'COD'
  const isTransfer = order.paymentMethod === 'TRANSFER'

  // Fire AddPaymentInfo browser-side untuk Transfer saat halaman load.
  // Sekali per session per invoice — sessionStorage flag mencegah re-fire
  // saat user refresh halaman invoice.
  const addPaymentInfoFired = useRef(false)
  useEffect(() => {
    if (addPaymentInfoFired.current) return
    if (!isTransfer) return
    if (paymentStatus !== 'PENDING') return  // sudah upload/PAID = skip
    if (pixels.length === 0) return
    if (typeof window === 'undefined') return
    const flagKey = `hulao_addpayment_${order.invoiceNumber}`
    if (sessionStorage.getItem(flagKey)) return

    addPaymentInfoFired.current = true
    sessionStorage.setItem(flagKey, '1')
    firePixelEvent(
      'AddPaymentInfo',
      {
        content_ids: order.items.map((i) => i.productId),
        contents: order.items.map((i) => ({
          id: i.productId,
          quantity: i.qty,
          item_price: i.price,
        })),
        currency: 'IDR',
        value: order.totalRp,
      },
      generateEventId('AddPaymentInfo', order.invoiceNumber),
    )
  }, [
    pixels.length,
    isTransfer,
    paymentStatus,
    order.invoiceNumber,
    order.items,
    order.totalRp,
  ])

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`${label} disalin`))
      .catch(() => toast.error('Gagal menyalin'))
  }

  async function handleUploadProof(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      toast.error('Ukuran maksimal 4 MB')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(
        `/api/orders/${order.invoiceNumber}/upload-proof`,
        { method: 'POST', body: fd },
      )
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal upload bukti')
        return
      }
      setProofUrl(data.data.url)
      setPaymentStatus('WAITING_CONFIRMATION')
      toast.success('Bukti transfer terkirim')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setUploading(false)
    }
  }

  async function handleWaConfirm() {
    try {
      const res = await fetch(
        `/api/orders/${order.invoiceNumber}/wa-link`,
      )
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal generate link WA')
        return
      }
      window.open(data.data.url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:py-8">
      <PixelLoader pixels={pixels} />
      {/* Header */}
      <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-7 text-emerald-600" />
          <div>
            <h1 className="font-display text-lg font-bold text-emerald-900 md:text-xl">
              Pesanan Diterima!
            </h1>
            <p className="text-sm text-emerald-800">
              Invoice: <span className="font-mono">{order.invoiceNumber}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={paymentStatus} />
        {order.deliveryStatus !== 'PENDING' && (
          <Badge variant="secondary">
            <Truck className="mr-1 size-3" />
            {order.deliveryStatus}
            {order.trackingNumber && ` · ${order.trackingNumber}`}
          </Badge>
        )}
      </div>

      {/* Detail Pesanan */}
      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-warm-900">
            <Package className="size-4" />
            Detail Pesanan
          </h2>

          <div className="space-y-1.5 text-sm">
            {order.items.map((it) => (
              <div key={it.productId} className="flex justify-between">
                <span className="truncate">
                  {it.name} × {it.qty}
                  {it.isFlashSale && (
                    <span className="ml-1 text-amber-700">⚡</span>
                  )}
                </span>
                <span>Rp {formatNumber(it.price * it.qty)}</span>
              </div>
            ))}
          </div>

          <div className="my-2 border-t" />
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>Rp {formatNumber(order.subtotalRp)}</span>
            </div>
            {order.flashSaleDiscountRp > 0 && (
              <div className="flex justify-between text-amber-700">
                <span>Hemat Flash Sale</span>
                <span>-Rp {formatNumber(order.flashSaleDiscountRp)}</span>
              </div>
            )}
            {order.shippingCostRp > 0 && (
              <div className="flex justify-between">
                <span>
                  Ongkir{' '}
                  {order.shippingCourier &&
                    `(${order.shippingCourier.toUpperCase()} ${order.shippingService ?? ''})`}
                </span>
                <span>Rp {formatNumber(order.shippingCostRp)}</span>
              </div>
            )}
            {order.shippingSubsidyRp > 0 && (
              <div className="flex justify-between text-blue-700">
                <span>
                  Subsidi
                  {order.appliedZoneName && ` (${order.appliedZoneName})`}
                </span>
                <span>-Rp {formatNumber(order.shippingSubsidyRp)}</span>
              </div>
            )}
          </div>
          <div className="my-2 border-t" />
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span className="text-primary-600">
              Rp {formatNumber(order.totalRp)}
            </span>
          </div>
          {isTransfer && order.uniqueCode && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              ⚠️ Transfer dengan nominal <strong>persis Rp {formatNumber(order.totalRp)}</strong>{' '}
              (termasuk kode unik <strong>{order.uniqueCode}</strong>) supaya
              pembayaran cepat diverifikasi.
            </p>
          )}

          {(order.shippingCityName || order.shippingAddress) && (
            <>
              <div className="my-2 border-t" />
              <div className="text-sm">
                <p className="font-medium text-warm-900">{order.customerName}</p>
                <p className="text-warm-600">{order.customerPhone}</p>
                <p className="mt-1 text-warm-600">
                  {order.shippingAddress}
                  {order.shippingCityName && (
                    <>
                      , {order.shippingCityName}
                      {order.shippingProvinceName &&
                        `, ${order.shippingProvinceName}`}
                      {order.shippingPostalCode && ` ${order.shippingPostalCode}`}
                    </>
                  )}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* COD info */}
      {isCod && (
        <Card className="mb-4 border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <h2 className="mb-2 flex items-center gap-2 font-semibold text-emerald-900">
              <CreditCard className="size-4" />
              Bayar di Tempat (COD)
            </h2>
            <p className="text-sm text-emerald-800">
              Pesanan akan dikirim, kamu bayar saat barang sampai.
            </p>
            <p className="mt-2 text-sm font-bold text-emerald-900">
              Total yang harus dibayar:{' '}
              <span className="font-mono">Rp {formatNumber(order.totalRp)}</span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Transfer flow */}
      {isTransfer && (
        <>
          {/* Bank list */}
          {banks.length > 0 && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <h2 className="mb-3 flex items-center gap-2 font-semibold text-warm-900">
                  <CreditCard className="size-4" />
                  Transfer ke Salah Satu Rekening
                </h2>
                <ul className="space-y-2">
                  {banks.map((b, idx) => (
                    <li
                      key={`${b.bankName}-${b.accountNumber}-${idx}`}
                      className="rounded-lg border bg-warm-50 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 font-semibold text-warm-900">
                            {b.bankName}
                            {b.isDefault && (
                              <Badge
                                variant="secondary"
                                className="bg-amber-100 text-amber-800 text-[10px] hover:bg-amber-100"
                              >
                                Utama
                              </Badge>
                            )}
                          </p>
                          <p className="font-mono text-base font-bold text-warm-900">
                            {b.accountNumber}
                          </p>
                          <p className="text-xs text-warm-600">
                            a.n. {b.accountName}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            copyToClipboard(b.accountNumber, 'Nomor rekening')
                          }
                        >
                          <Copy className="mr-1 size-3.5" />
                          Salin
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm">
                  <span className="text-amber-900">
                    Total transfer:{' '}
                    <span className="font-mono font-bold">
                      Rp {formatNumber(order.totalRp)}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      copyToClipboard(String(order.totalRp), 'Nominal')
                    }
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Kirim bukti */}
          {paymentStatus !== 'PAID' && paymentStatus !== 'CANCELLED' && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <h2 className="mb-3 flex items-center gap-2 font-semibold text-warm-900">
                  Kirim Bukti Transfer
                </h2>
                <p className="mb-3 text-sm text-warm-600">
                  Pilih salah satu cara — bukti dipakai untuk verifikasi
                  pembayaran. Pesanan akan diproses setelah dikonfirmasi
                  penjual.
                </p>

                {proofUrl && (
                  <div className="mb-3 rounded-lg border bg-emerald-50 p-3 text-sm text-emerald-800">
                    ✓ Bukti sudah dikirim, menunggu konfirmasi penjual.
                    <a
                      href={proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 underline"
                    >
                      Lihat
                    </a>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleUploadProof(f)
                      e.target.value = ''
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    <Upload className="mr-1 size-4" />
                    {uploading ? 'Mengunggah…' : 'Upload Bukti di Sini'}
                  </Button>
                  {waConfirm && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleWaConfirm}
                      className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                    >
                      <MessageCircle className="mr-1 size-4" />
                      Kirim via WhatsApp
                    </Button>
                  )}
                </div>
                <p className="mt-2 text-xs text-warm-500">
                  Format: JPG / PNG / WebP, max 4 MB.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Bukti yg sudah ada */}
          {proofUrl && (
            <Card className="mb-4">
              <CardContent className="p-4">
                <h2 className="mb-2 flex items-center gap-2 font-semibold text-warm-900">
                  <ImageIcon className="size-4" />
                  Bukti Transfer
                </h2>
                <a
                  href={proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block max-w-xs"
                >
                  <Image
                    src={proofUrl}
                    alt="Bukti transfer"
                    width={300}
                    height={400}
                    className="rounded-lg border"
                  />
                </a>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <p className="mt-6 text-center text-xs text-warm-400">
        Penjual: {ownerName} · Powered by Hulao
      </p>
    </div>
  )
}
