'use client'

// Auto-polling status pembayaran — poll /api/payment/status setiap 5 detik.
// Kalau status berubah ke SUCCESS, trigger router refresh supaya halaman
// checkout server component re-render dengan data terbaru.
import { RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

interface CheckoutStatusPollerProps {
  orderId: string
  initialStatus: string
}

export function CheckoutStatusPoller({
  orderId,
  initialStatus,
}: CheckoutStatusPollerProps) {
  const router = useRouter()
  const [status, setStatus] = useState(initialStatus)
  const [polling, setPolling] = useState(initialStatus === 'PENDING')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/payment/status?orderId=${encodeURIComponent(orderId)}`)
      const json = (await res.json()) as {
        success: boolean
        data?: { status: string; paidAt: string | null }
      }
      if (json.success && json.data) {
        setStatus(json.data.status)
        if (json.data.status !== 'PENDING') {
          setPolling(false)
          // Refresh server component data.
          router.refresh()
        }
      }
    } catch {
      // Ignore polling errors.
    }
  }, [orderId, router])

  useEffect(() => {
    if (!polling) return

    intervalRef.current = setInterval(pollStatus, 5000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [polling, pollStatus])

  if (!polling) return null

  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border border-primary-200 bg-primary-50/50 px-4 py-2.5 text-sm text-primary-700">
      <RefreshCw className="size-3.5 animate-spin" />
      <span>Menunggu pembayaran… Status otomatis update.</span>
    </div>
  )
}
