// Tabel perbandingan lengkap fitur per paket LP — di bawah kartu /pricing.
// Isi baris dari lib/plan-features.ts (sumber yang sama dengan highlight
// kartu), jadi kartu & tabel tidak bisa saling bertentangan.
import { Check, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  type FeatureValue,
  type PlanColumn,
  buildFeatureSections,
} from '@/lib/plan-features'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

export const PLAN_COMPARISON_ID = 'bandingkan-paket'

interface Props {
  plans: PlanColumn[]
  // Bisa lebih dari satu — admin tidak membatasi flag isPopular per paket.
  popularIds: string[]
  currentTier: string | null
}

function FeatureCell({ value }: { value: FeatureValue }) {
  if (value === true) {
    return (
      <>
        <Check className={cn('mx-auto size-4', TONES.success.text)} />
        <span className="sr-only">Termasuk</span>
      </>
    )
  }
  if (value === false) {
    return (
      <>
        <X className="text-muted-foreground/40 mx-auto size-4" />
        <span className="sr-only">Tidak termasuk</span>
      </>
    )
  }
  return <span className="text-warm-900 text-sm">{value}</span>
}

export function PlanComparison({ plans, popularIds, currentTier }: Props) {
  const sections = buildFeatureSections(plans)
  // Kolom paket unggulan diberi tint tipis supaya mata mudah mengikutinya.
  const popularCol = (id: string) => popularIds.includes(id) && 'bg-primary-50'

  return (
    <section id={PLAN_COMPARISON_ID} className="scroll-mt-20 space-y-4">
      <div className="space-y-1 text-center">
        <h2
          id={`${PLAN_COMPARISON_ID}-judul`}
          className="font-display text-warm-900 text-xl font-semibold"
        >
          Bandingkan semua fitur
        </h2>
        <p className="text-muted-foreground text-sm">
          Rincian lengkap yang kamu dapat di tiap paket. Fitur AI memotong saldo
          token setiap kali dipakai, di paket mana pun.
        </p>
      </div>

      <Card className="gap-0 py-0">
        {/* Lebar penuh baru di xl: di bawahnya sidebar dashboard memakan
            ruang, jadi kolom fitur dibuat sempit supaya kolom paket terlihat. */}
        <Table
          aria-labelledby={`${PLAN_COMPARISON_ID}-judul`}
          className="min-w-[600px] table-fixed xl:min-w-[760px]"
        >
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="bg-card sticky left-0 z-10 w-36 px-3 sm:w-44 sm:px-4 xl:w-[34%]">
                Fitur
              </TableHead>
              {plans.map((p) => (
                <TableHead
                  key={p.id}
                  className={cn('h-auto py-3 text-center', popularCol(p.id))}
                >
                  <span className="block">{p.name}</span>
                  {currentTier === p.tier && (
                    <Badge variant="secondary" className="mt-1">
                      Plan kamu
                    </Badge>
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          {sections.map((section) => (
            <TableBody key={section.key}>
              <TableRow className="bg-warm-50 hover:bg-warm-50">
                <TableHead
                  scope="rowgroup"
                  colSpan={plans.length + 1}
                  className="h-auto px-3 py-3 font-normal whitespace-normal sm:px-4"
                >
                  {/* sticky supaya judul tetap terlihat saat tabel digeser di HP */}
                  <div className="sticky left-3 inline-block max-w-60 whitespace-normal sm:left-4 sm:max-w-none">
                    <span className="text-warm-900 font-semibold">
                      {section.title}
                    </span>
                    {section.description && (
                      <span className="text-muted-foreground block text-xs">
                        {section.description}
                      </span>
                    )}
                  </div>
                </TableHead>
              </TableRow>
              {section.rows.map((row) => (
                <TableRow key={row.key} className="hover:bg-transparent">
                  <TableHead
                    scope="row"
                    className="bg-card sticky left-0 z-10 h-auto px-3 py-3 align-top font-normal whitespace-normal sm:px-4"
                  >
                    <span className="text-warm-900 font-medium">
                      {row.label}
                    </span>
                    {row.hint && (
                      <span className="text-muted-foreground mt-0.5 block text-xs">
                        {row.hint}
                      </span>
                    )}
                  </TableHead>
                  {row.values.map((value, i) => (
                    <TableCell
                      key={plans[i].id}
                      className={cn(
                        'py-3 text-center align-top whitespace-normal',
                        popularCol(plans[i].id),
                      )}
                    >
                      <FeatureCell value={value} />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          ))}
        </Table>
      </Card>
    </section>
  )
}
