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
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

export const LOW_BALANCE_THRESHOLD = 1000

export function BalanceBanner({ balance }: { balance: number }) {
  if (balance === 0) {
    return (
      <Card className={TONES.danger.bg}>
        <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-lg',
                TONES.danger.solid,
              )}
            >
              <ShieldAlert className="size-5" />
            </div>
            <div>
              <p
                className={cn(
                  'font-display text-sm font-bold',
                  TONES.danger.text,
                )}
              >
                Token kamu habis!
              </p>
              <p className="text-warm-700 mt-0.5 text-xs">
                WhatsApp kamu tidak bisa membalas pesan customer. Top up
                sekarang supaya AI nyala lagi.
              </p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link href="/billing">Top Up Token</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (balance < LOW_BALANCE_THRESHOLD) {
    return (
      <Card className={TONES.warning.bg}>
        <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-lg',
                TONES.warning.solid,
              )}
            >
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <p
                className={cn(
                  'font-display text-sm font-bold',
                  TONES.warning.text,
                )}
              >
                Token kamu hampir habis (sisa {formatNumber(balance)})
              </p>
              <p className="text-warm-700 mt-0.5 text-xs">
                Segera top up sebelum balasan AI mati.
              </p>
            </div>
          </div>
          <Button asChild size="sm">
            <Link href="/billing">Top Up Token</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return null
}
