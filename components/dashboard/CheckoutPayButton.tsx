'use client'

// Tombol "Bayar Sekarang" — redirect ke checkout URL Tripay.
import { ExternalLink } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface CheckoutPayButtonProps {
  paymentUrl: string
}

export function CheckoutPayButton({ paymentUrl }: CheckoutPayButtonProps) {
  return (
    <Button
      onClick={() => {
        window.location.href = paymentUrl
      }}
      className="w-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600"
      size="lg"
    >
      Bayar Sekarang
      <ExternalLink className="ml-2 size-4" />
    </Button>
  )
}
