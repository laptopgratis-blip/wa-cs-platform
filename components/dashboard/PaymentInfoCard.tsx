'use client'

// Card info pembayaran — tampil berbeda tergantung tipe channel:
// DIRECT (VA, Convenience Store): tampilkan pay_code + copy button + total
// REDIRECT (QRIS, E-Wallet): tampilkan tombol redirect ke checkout_url Tripay
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { formatRupiah } from '@/lib/format'

// Channel yang pakai REDIRECT flow.
const REDIRECT_CHANNELS = new Set(['QRIS', 'QRISC', 'QRIS2', 'SHOPEEPAY', 'OVO', 'DANA'])

interface PaymentInfoCardProps {
  paymentMethod: string | null
  paymentName: string | null
  payCode: string | null
  paymentUrl: string | null
  amount: number
  expiredAt: string | null // ISO string
}

export function PaymentInfoCard({
  paymentMethod,
  paymentName,
  payCode,
  paymentUrl,
  amount,
  expiredAt,
}: PaymentInfoCardProps) {
  const [copied, setCopied] = useState(false)
  const isRedirect = paymentMethod ? REDIRECT_CHANNELS.has(paymentMethod) : false

  // Normalize QRIS variants.
  const displayName = paymentMethod?.startsWith('QRIS')
    ? 'QRIS'
    : (paymentName ?? paymentMethod ?? 'Payment')

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success('Disalin ke clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Gagal menyalin')
    }
  }

  // ─── REDIRECT flow (QRIS, E-Wallet) ───
  if (isRedirect && paymentUrl) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-warm-200 bg-warm-50/50 p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-warm-500">
            {displayName}
          </div>
          <p className="mt-2 text-sm text-warm-600">
            Anda akan diarahkan ke halaman pembayaran untuk menyelesaikan transaksi.
          </p>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-sm text-warm-500">Total pembayaran</span>
            <span className="font-display text-xl font-extrabold text-warm-900 tabular-nums">
              {formatRupiah(amount)}
            </span>
          </div>
        </div>
        <Button
          onClick={() => { window.location.href = paymentUrl }}
          className="w-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600"
          size="lg"
        >
          Bayar Sekarang
          <ExternalLink className="ml-2 size-4" />
        </Button>
      </div>
    )
  }

  // ─── DIRECT flow (VA, Convenience Store) ───
  if (payCode) {
    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-warm-200 bg-warm-50/50 p-4">
          <div className="text-xs font-medium uppercase tracking-wider text-warm-500">
            {displayName}
          </div>

          {/* Pay code */}
          <div className="mt-3 flex items-center justify-between rounded-lg border border-warm-200 bg-white p-3">
            <div>
              <div className="text-xs text-warm-400">Kode Bayar / Nomor VA</div>
              <div className="mt-0.5 font-mono text-lg font-bold tracking-wider text-warm-900">
                {payCode}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(payCode)}
              className="shrink-0"
            >
              {copied ? (
                <Check className="size-4 text-emerald-500" />
              ) : (
                <Copy className="size-4 text-warm-500" />
              )}
            </Button>
          </div>

          {/* Amount */}
          <div className="mt-3 flex items-center justify-between rounded-lg border border-warm-200 bg-white p-3">
            <div>
              <div className="text-xs text-warm-400">Jumlah yang harus dibayar</div>
              <div className="mt-0.5 font-display text-lg font-extrabold text-warm-900 tabular-nums">
                {formatRupiah(amount)}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(String(amount))}
              className="shrink-0"
            >
              {copied ? (
                <Check className="size-4 text-emerald-500" />
              ) : (
                <Copy className="size-4 text-warm-500" />
              )}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Fallback: kalau ada paymentUrl tapi bukan case di atas
  if (paymentUrl) {
    return (
      <Button
        onClick={() => { window.location.href = paymentUrl }}
        className="w-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600"
        size="lg"
      >
        Bayar Sekarang
        <ExternalLink className="ml-2 size-4" />
      </Button>
    )
  }

  return null
}
