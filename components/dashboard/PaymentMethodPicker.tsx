'use client'

// Picker metode pembayaran — user pilih antara Tripay (payment gateway) atau
// Transfer Manual. Kalau pilih Tripay, tampilkan step kedua untuk memilih
// channel spesifik (BRIVA, QRIS, dll). Setelah semua dipilih, POST ke API
// yang sesuai lalu redirect ke checkout page.
import {
  ArrowLeft,
  Banknote,
  CreditCard,
  Loader2,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { TripayChannelSelector } from '@/components/dashboard/TripayChannelSelector'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatRupiah } from '@/lib/format'

type PaymentMethod = 'tripay' | 'manual' | null
type Step = 'method' | 'channel' // step 1: pilih metode, step 2: pilih channel Tripay

// Channel yang pakai REDIRECT flow — user dikirim langsung ke Tripay.
const REDIRECT_CHANNELS = new Set(['QRIS', 'QRISC', 'QRIS2', 'SHOPEEPAY', 'OVO', 'DANA'])

interface ChannelData {
  code: string
  name: string
  fee_customer: { flat: number; percent: number }
}

interface PaymentMethodPickerProps {
  packageId: string
  packageName: string
  packagePrice: number // harga paket untuk diteruskan ke channel selector
}

export function PaymentMethodPicker({
  packageId,
  packageName,
  packagePrice,
}: PaymentMethodPickerProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<PaymentMethod>(null)
  const [step, setStep] = useState<Step>('method')
  const [selectedChannel, setSelectedChannel] = useState<ChannelData | null>(null)
  const [isLoading, setLoading] = useState(false)

  function estimateCustomerFee(): number {
    if (!selectedChannel) return 0
    const flat = selectedChannel.fee_customer.flat
    const percent = selectedChannel.fee_customer.percent
    return flat + Math.ceil((packagePrice * percent) / 100)
  }

  function handleMethodSelect(method: PaymentMethod) {
    setSelected(method)
    setSelectedChannel(null)
  }

  function handleContinue() {
    if (selected === 'tripay') {
      setStep('channel')
    }
  }

  async function handleConfirm() {
    if (selected === 'manual') {
      await handleManualPay()
    } else if (selected === 'tripay' && selectedChannel) {
      await handleTripayPay()
    }
  }

  async function handleTripayPay() {
    if (!selectedChannel) {
      toast.error('Pilih channel pembayaran dulu')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId, method: selectedChannel.code }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { orderId: string; paymentUrl?: string }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal memulai pembayaran')
        return
      }

      // REDIRECT channels (QRIS, E-Wallet): langsung ke Tripay checkout.
      if (REDIRECT_CHANNELS.has(selectedChannel!.code) && json.data.paymentUrl) {
        window.location.href = json.data.paymentUrl
        return
      }

      // DIRECT channels (VA, Convenience Store): ke halaman checkout in-app.
      router.push(`/checkout/${json.data.orderId}`)
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setLoading(false)
    }
  }

  async function handleManualPay() {
    setLoading(true)
    try {
      const res = await fetch('/api/payment/manual/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { id: string }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal membuat order transfer manual')
        return
      }
      router.push(`/checkout/manual/${json.data.id}`)
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setLoading(false)
    }
  }

  const customerFee = estimateCustomerFee()

  // ─── STEP 2: Channel selector ───
  if (step === 'channel') {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => { setStep('method'); setSelectedChannel(null) }}
          className="flex items-center gap-1.5 text-sm text-warm-500 transition-colors hover:text-warm-700"
        >
          <ArrowLeft className="size-3.5" />
          Kembali pilih metode
        </button>

        <h2 className="font-display text-lg font-bold text-warm-900 dark:text-warm-50">
          Pilih Channel Pembayaran
        </h2>

        <TripayChannelSelector
          amount={packagePrice}
          onSelect={(ch) => setSelectedChannel(ch)}
          selectedCode={selectedChannel?.code ?? null}
        />

        {/* Fee summary */}
        {selectedChannel && (
          <div className="rounded-lg border border-warm-200 bg-warm-50/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-warm-500">Harga paket</span>
              <span className="font-medium tabular-nums">{formatRupiah(packagePrice)}</span>
            </div>
            {customerFee > 0 && (
              <div className="flex justify-between">
                <span className="text-warm-500">Biaya layanan</span>
                <span className="font-medium tabular-nums">{formatRupiah(customerFee)}</span>
              </div>
            )}
            <div className="mt-1.5 flex justify-between border-t border-warm-200 pt-1.5 text-base">
              <span className="font-semibold text-warm-700">Total</span>
              <span className="font-display font-extrabold text-warm-900 tabular-nums">
                {formatRupiah(packagePrice + customerFee)}
              </span>
            </div>
          </div>
        )}

        <Button
          onClick={handleConfirm}
          disabled={!selectedChannel || isLoading}
          className="w-full rounded-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600 disabled:opacity-50"
          size="lg"
          aria-label={`Bayar paket ${packageName} via ${selectedChannel?.name ?? 'Payment Gateway'}`}
        >
          {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
          {selectedChannel
            ? `Bayar via ${selectedChannel.name}`
            : 'Pilih channel pembayaran'}
        </Button>
      </div>
    )
  }

  // ─── STEP 1: Method selection ───
  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-bold text-warm-900 dark:text-warm-50">
        Metode Pembayaran
      </h2>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Tripay — Payment Gateway */}
        <Card
          className={cn(
            'cursor-pointer rounded-xl border-2 transition-all hover:shadow-md',
            selected === 'tripay'
              ? 'border-primary-500 bg-primary-50/50 shadow-md ring-1 ring-primary-200'
              : 'border-warm-200 hover:border-primary-300',
          )}
          onClick={() => handleMethodSelect('tripay')}
        >
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
                <CreditCard className="size-5" />
              </div>
              <div
                className={cn(
                  'flex size-5 items-center justify-center rounded-full border-2 transition-colors',
                  selected === 'tripay'
                    ? 'border-primary-500 bg-primary-500'
                    : 'border-warm-300',
                )}
              >
                {selected === 'tripay' && (
                  <div className="size-2 rounded-full bg-white" />
                )}
              </div>
            </div>
            <div>
              <div className="font-display text-base font-bold text-warm-900 dark:text-warm-50">
                Payment Gateway
              </div>
              <p className="mt-1 text-xs text-warm-500">
                QRIS, Virtual Account, E-Wallet, dan lainnya
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-primary-600">
              <Zap className="size-3.5" />
              <span>Otomatis &amp; instan</span>
            </div>
          </CardContent>
        </Card>

        {/* Transfer Manual */}
        <Card
          className={cn(
            'cursor-pointer rounded-xl border-2 transition-all hover:shadow-md',
            selected === 'manual'
              ? 'border-primary-500 bg-primary-50/50 shadow-md ring-1 ring-primary-200'
              : 'border-warm-200 hover:border-primary-300',
          )}
          onClick={() => handleMethodSelect('manual')}
        >
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
              <div className="flex size-10 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <Banknote className="size-5" />
              </div>
              <div
                className={cn(
                  'flex size-5 items-center justify-center rounded-full border-2 transition-colors',
                  selected === 'manual'
                    ? 'border-primary-500 bg-primary-500'
                    : 'border-warm-300',
                )}
              >
                {selected === 'manual' && (
                  <div className="size-2 rounded-full bg-white" />
                )}
              </div>
            </div>
            <div>
              <div className="font-display text-base font-bold text-warm-900 dark:text-warm-50">
                Transfer Manual
              </div>
              <p className="mt-1 text-xs text-warm-500">
                Transfer ke rekening bank, lalu upload bukti untuk verifikasi
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <ShieldCheck className="size-3.5" />
              <span>Diverifikasi admin (maks 1×24 jam)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Button
        onClick={() => {
          if (selected === 'tripay') handleContinue()
          else if (selected === 'manual') handleConfirm()
        }}
        disabled={!selected || isLoading}
        className="w-full rounded-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600 disabled:opacity-50"
        size="lg"
        aria-label={`Lanjutkan pembayaran paket ${packageName}`}
      >
        {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
        {selected === 'manual'
          ? 'Lanjut ke Transfer Manual'
          : selected === 'tripay'
            ? 'Pilih Channel Pembayaran'
            : 'Pilih metode pembayaran'}
      </Button>
    </div>
  )
}
