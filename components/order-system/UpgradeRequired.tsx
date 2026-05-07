// Halaman fallback ketika user tanpa paket POWER mengakses route Order System.
// Server component — render-able dari page.tsx yang sudah cek access via gate.
import { ShoppingCart } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'

interface UpgradeRequiredProps {
  currentTier: string
  feature?: string
}

export function UpgradeRequired({
  currentTier,
  feature = 'Order System',
}: UpgradeRequiredProps) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
      <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-primary-50 text-primary-600">
        <ShoppingCart className="size-8" />
      </div>

      <h1 className="font-display text-2xl font-bold text-warm-900 md:text-3xl">
        Fitur {feature}
      </h1>
      <p className="mt-2 text-warm-600">
        Form Order, Invoice Otomatis, Multi-Payment, Subsidi Ongkir, dan Flash
        Sale — semua siap pakai untuk bisnis kamu.
      </p>

      <div className="mt-6 w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
        <p className="text-sm font-medium text-amber-900">
          Paket kamu saat ini: <span className="font-bold">{currentTier}</span>
        </p>
        <p className="mt-1 text-sm text-amber-800">
          Fitur {feature} hanya tersedia di paket{' '}
          <span className="font-bold">POWER</span>.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/pricing">Lihat Paket POWER</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/dashboard">Kembali ke Dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
