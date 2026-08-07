'use client'

// Kotak pembayaran Tripay di halaman invoice publik (paymentMethod=TRIPAY).
// - Channel direct (VA): tampil pay code + tombol salin + nominal persis.
// - Channel redirect (QRIS/e-wallet): tombol "Bayar Sekarang" → checkout_url.
// - Polling status tiap 5 detik selama PENDING → saat PAID, kabari parent
//   (onPaid) + tampil CTA Perpustakaan kalau order mengandung e-book.
import { CheckCircle2, Copy, ExternalLink, Loader2, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'

export interface TripayPaymentInfo {
  status: string
  channelCode: string
  channelName: string | null
  payCode: string | null
  checkoutUrl: string | null
  amount: number
  feeCustomer: number
  expiredAt: string | null
}

interface TripayPaymentBoxProps {
  invoiceNumber: string
  initial: TripayPaymentInfo
  paymentStatus: string
  // Order mengandung produk e-book → tampil CTA Perpustakaan saat PAID.
  hasEbook: boolean
  onPaid: () => void
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function TripayPaymentBox({
  invoiceNumber,
  initial,
  paymentStatus,
  hasEbook,
  onPaid,
}: TripayPaymentBoxProps) {
  const [info, setInfo] = useState<TripayPaymentInfo>(initial)
  const [now, setNow] = useState(Date.now())
  const paidNotified = useRef(false)

  const isPaid = paymentStatus === 'PAID'
  const expiredAtMs = info.expiredAt ? new Date(info.expiredAt).getTime() : null
  const isExpired =
    !isPaid &&
    (info.status === 'EXPIRED' ||
      (expiredAtMs != null && now > expiredAtMs))
  const totalBayar = info.amount + info.feeCustomer

  // Countdown tick per detik selama menunggu pembayaran.
  useEffect(() => {
    if (isPaid || isExpired) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [isPaid, isExpired])

  // Polling status tiap 5 detik selama PENDING — webhook Tripay yang
  // sebenarnya menandai PAID; polling cuma untuk update UI realtime.
  useEffect(() => {
    if (isPaid || isExpired) return
    const t = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/orders/payment-status?invoice=${encodeURIComponent(invoiceNumber)}`,
        )
        const json = await res.json()
        if (!json.success) return
        const op = json.data.orderPayment
        if (op) setInfo((prev) => ({ ...prev, status: op.status }))
        if (json.data.paymentStatus === 'PAID' && !paidNotified.current) {
          paidNotified.current = true
          onPaid()
        }
      } catch {
        // best-effort polling — error jaringan diabaikan
      }
    }, 5000)
    return () => clearInterval(t)
  }, [invoiceNumber, isPaid, isExpired, onPaid])

  function copy(text: string, label: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`${label} disalin`))
      .catch(() => toast.error('Gagal menyalin'))
  }

  if (isPaid) {
    return (
      <Card className="mb-4 border-emerald-200 bg-emerald-50">
        <CardContent className="p-4">
          <h2 className="mb-1 flex items-center gap-2 font-semibold text-emerald-900">
            <CheckCircle2 className="size-4" />
            Pembayaran Diterima
          </h2>
          <p className="text-sm text-emerald-800">
            Pembayaran via {info.channelName ?? info.channelCode} sudah
            terkonfirmasi otomatis.
          </p>
          {hasEbook && (
            <Button asChild className="mt-3 w-full">
              <a href="/belajar">Buka Perpustakaan Saya</a>
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  if (isExpired) {
    return (
      <Card className="mb-4 border-rose-200 bg-rose-50">
        <CardContent className="p-4">
          <h2 className="mb-1 font-semibold text-rose-900">
            Waktu Pembayaran Habis
          </h2>
          <p className="text-sm text-rose-800">
            Transaksi pembayaran sudah kedaluwarsa. Silakan buat pesanan baru
            atau hubungi penjual.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-warm-900">
          <Wallet className="size-4" />
          Bayar via {info.channelName ?? info.channelCode}
        </h2>

        {info.payCode ? (
          <div className="rounded-lg border bg-warm-50 p-3">
            <p className="text-xs text-warm-600">Nomor Virtual Account</p>
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-lg font-bold text-warm-900">
                {info.payCode}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(info.payCode as string, 'Nomor VA')}
              >
                <Copy className="mr-1 size-3.5" />
                Salin
              </Button>
            </div>
          </div>
        ) : info.checkoutUrl ? (
          <Button asChild className="w-full">
            <a href={info.checkoutUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 size-4" />
              Bayar Sekarang
            </a>
          </Button>
        ) : null}

        <div className="mt-3 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm">
          <span className="text-amber-900">
            Total bayar:{' '}
            <span className="font-mono font-bold">
              Rp {formatNumber(totalBayar)}
            </span>
            {info.feeCustomer > 0 && (
              <span className="ml-1 text-xs">
                (termasuk biaya layanan Rp {formatNumber(info.feeCustomer)})
              </span>
            )}
          </span>
        </div>

        {expiredAtMs != null && (
          <p className="mt-2 text-xs text-warm-500">
            Selesaikan pembayaran dalam{' '}
            <span className="font-mono font-semibold">
              {formatCountdown(expiredAtMs - now)}
            </span>
          </p>
        )}

        <p className="mt-2 flex items-center gap-1.5 text-xs text-warm-500">
          <Loader2 className="size-3 animate-spin" />
          Status terupdate otomatis setelah kamu bayar.
        </p>
      </CardContent>
    </Card>
  )
}
