'use client'

// Tombol "Transfer Manual" — POST /api/payment/manual/create lalu redirect
// ke /checkout/manual/[id].
import { Banknote, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

interface ManualBuyButtonProps {
  packageId: string
  packageName: string
}

export function ManualBuyButton({ packageId, packageName }: ManualBuyButtonProps) {
  const router = useRouter()
  const [isLoading, setLoading] = useState(false)

  async function handleBuy() {
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

  return (
    <Button
      onClick={handleBuy}
      disabled={isLoading}
      variant="outline"
      className="w-full rounded-full border-warm-200 bg-card font-medium text-warm-700 hover:bg-warm-50"
      aria-label={`Transfer manual untuk paket ${packageName}`}
    >
      {isLoading ? (
        <Loader2 className="mr-2 size-4 animate-spin" />
      ) : (
        <Banknote className="mr-2 size-4" />
      )}
      Transfer Manual
    </Button>
  )
}
