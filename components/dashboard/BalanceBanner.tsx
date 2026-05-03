// BalanceBanner — banner peringatan saldo token.
// - balance === 0 → MERAH "Token habis"
// - balance < LOW_THRESHOLD → KUNING "hampir habis"
// - balance >= LOW_THRESHOLD → tidak render apa-apa
//
// Server component supaya bisa di-render di server tanpa fetch tambahan.
import { AlertTriangle, ShieldAlert } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatNumber } from '@/lib/format'

export const LOW_BALANCE_THRESHOLD = 1000

export function BalanceBanner({ balance }: { balance: number }) {
  if (balance === 0) {
    return (
      <Card className="rounded-xl border-destructive/30 bg-destructive/5">
        <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <p className="font-display text-sm font-bold text-destructive">
                Token kamu habis!
              </p>
              <p className="mt-0.5 text-xs text-warm-700">
                WhatsApp kamu tidak bisa membalas pesan customer. Top up sekarang
                supaya AI nyala lagi.
              </p>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            className="bg-destructive font-semibold text-white hover:bg-destructive/90"
          >
            <Link href="/billing">Top Up Token</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (balance < LOW_BALANCE_THRESHOLD) {
    return (
      <Card className="rounded-xl border-amber-200 bg-amber-50">
        <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <p className="font-display text-sm font-bold text-amber-900">
                Token kamu hampir habis (sisa {formatNumber(balance)})
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                Segera top up sebelum balasan AI mati.
              </p>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            className="bg-amber-600 font-semibold text-white hover:bg-amber-700"
          >
            <Link href="/billing">Top Up Token</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return null
}
