'use client'

// Card info pembayaran — tampil berbeda tergantung tipe channel:
// DIRECT (VA, Convenience Store): tampilkan pay_code + copy button + total
// REDIRECT (QRIS, E-Wallet): tampilkan tombol redirect ke checkout_url Tripay
import { Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { formatRupiah } from '@/lib/format'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

// Channel yang pakai REDIRECT flow.
const REDIRECT_CHANNELS = new Set([
  'QRIS',
  'QRISC',
  'QRIS2',
  'SHOPEEPAY',
  'OVO',
  'DANA',
])

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
  const isRedirect = paymentMethod
    ? REDIRECT_CHANNELS.has(paymentMethod)
    : false

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
        <div className="border-warm-200 bg-warm-50/50 rounded-xl border p-4">
          <div className="text-warm-500 text-xs font-medium tracking-wider uppercase">
            {displayName}
          </div>
          <p className="text-warm-600 mt-2 text-sm">
            Anda akan diarahkan ke halaman pembayaran untuk menyelesaikan
            transaksi.
          </p>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-warm-500 text-sm">Total pembayaran</span>
            <span className="font-display text-warm-900 text-xl font-bold tabular-nums">
              {formatRupiah(amount)}
            </span>
          </div>
        </div>
        <Button
          onClick={() => {
            window.location.href = paymentUrl
          }}
          className="w-full"
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
        <div className="border-warm-200 bg-warm-50/50 rounded-xl border p-4">
          <div className="text-warm-500 text-xs font-medium tracking-wider uppercase">
            {displayName}
          </div>

          {/* Pay code */}
          <div className="border-warm-200 bg-card mt-3 flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-warm-400 text-xs">Kode Bayar / Nomor VA</div>
              <div className="text-warm-900 mt-0.5 font-mono text-lg font-bold tracking-wider">
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
                <Check className={cn('size-4', TONES.success.text)} />
              ) : (
                <Copy className="text-warm-500 size-4" />
              )}
            </Button>
          </div>

          {/* Amount */}
          <div className="border-warm-200 bg-card mt-3 flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-warm-400 text-xs">
                Jumlah yang harus dibayar
              </div>
              <div className="font-display text-warm-900 mt-0.5 text-lg font-bold tabular-nums">
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
                <Check className={cn('size-4', TONES.success.text)} />
              ) : (
                <Copy className="text-warm-500 size-4" />
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
        onClick={() => {
          window.location.href = paymentUrl
        }}
        className="w-full"
        size="lg"
      >
        Bayar Sekarang
        <ExternalLink className="ml-2 size-4" />
      </Button>
    )
  }

  return null
}
