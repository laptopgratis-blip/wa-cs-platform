'use client'

// Tombol "Beli" — POST ke /api/payment/create lalu redirect ke /checkout/[orderId].
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

interface BuyPackageButtonProps {
  packageId: string
  packageName: string
  isPopular?: boolean
}

export function BuyPackageButton({
  packageId,
  packageName,
  isPopular,
}: BuyPackageButtonProps) {
  const router = useRouter()
  const [isLoading, setLoading] = useState(false)

  async function handleBuy() {
    setLoading(true)
    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { orderId: string }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal memulai pembayaran')
        return
      }

      router.push(`/checkout/${json.data.orderId}`)
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleBuy}
      disabled={isLoading}
      className={
        isPopular
          ? 'w-full rounded-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600'
          : 'w-full rounded-full border border-warm-200 bg-card font-semibold text-warm-800 hover:bg-warm-50'
      }
      variant={isPopular ? 'default' : 'outline'}
      aria-label={`Beli paket ${packageName}`}
    >
      {isLoading && <Loader2 className="mr-2 size-4 animate-spin" />}
      Bayar via Tripay
    </Button>
  )
}
