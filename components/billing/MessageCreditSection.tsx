// Section "Kredit Pesan WA" di /billing (server component, Trek 2B).
// Tampil hanya bila user punya sesi Cloud API atau sudah punya saldo/ledger
// kredit — user Baileys-only tidak perlu melihat dompet ini.
import type { MessageCreditTxType, MetaTemplateCategory } from '@prisma/client'
import { Check, MessageCircle } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatRupiah } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface MessageCreditPackage {
  id: string
  name: string
  tokenAmount: number // Rp kredit yang diterima
  price: number
  isPopular: boolean
}

export interface MessageCreditTxRow {
  id: string
  amountRp: number
  type: MessageCreditTxType
  category: MetaTemplateCategory | null
  description: string | null
  createdAt: Date
}

interface Props {
  balanceRp: number
  purchasedRp: number
  usedRp: number
  rates: Record<MetaTemplateCategory, number>
  packages: MessageCreditPackage[]
  transactions: MessageCreditTxRow[]
}

const TX_LABEL: Record<MessageCreditTxType, string> = {
  PURCHASE: 'Top-up',
  USAGE: 'Pemakaian',
  REFUND: 'Refund',
  ADJUSTMENT: 'Koreksi',
  BONUS: 'Bonus',
}

const CAT_LABEL: Record<MetaTemplateCategory, string> = {
  UTILITY: 'Utility',
  MARKETING: 'Marketing',
  AUTHENTICATION: 'OTP',
}

export function MessageCreditSection({ balanceRp, purchasedRp, usedRp, rates, packages, transactions }: Props) {
  const negative = balanceRp < 0
  return (
    <section id="kredit-pesan" className="space-y-4 scroll-mt-6">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-warm-900 dark:text-warm-50">
          <MessageCircle className="size-5 text-sky-600" /> Kredit Pesan WA (Cloud API)
        </h2>
        <p className="mt-1 text-sm text-warm-500">
          Dompet terpisah untuk pesan <b>template Meta</b> di nomor WhatsApp resmi (Cloud API): broadcast,
          follow-up, dan notifikasi di luar window 24 jam. Balasan CS dalam window 24 jam tetap gratis dan
          tidak memotong kredit ini.
        </p>
      </div>

      <Card className={cn('rounded-xl border-sky-200 bg-gradient-to-br from-sky-50 via-white to-sky-50', negative && 'border-destructive/40')}>
        <CardHeader className="pb-2">
          <CardDescription className="text-xs font-medium uppercase tracking-wider text-sky-700">
            Saldo Kredit Pesan
          </CardDescription>
          <CardTitle className={cn('font-display text-3xl font-extrabold tabular-nums tracking-tight', negative ? 'text-destructive' : 'text-warm-900 dark:text-warm-50')}>
            {formatRupiah(balanceRp)}
          </CardTitle>
          {negative && (
            <p className="text-xs text-destructive">Saldo minus — top up supaya pesan template berikutnya bisa dikirim.</p>
          )}
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 pt-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-muted-foreground">Total top-up</div>
            <div className="font-medium">{formatRupiah(purchasedRp)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total terpakai</div>
            <div className="font-medium">{formatRupiah(usedRp)}</div>
          </div>
          <div className="col-span-2">
            <div className="text-muted-foreground">Harga per pesan</div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 font-medium">
              <span>Utility {formatRupiah(rates.UTILITY)}</span>
              <span>Marketing {formatRupiah(rates.MARKETING)}</span>
              <span>OTP {formatRupiah(rates.AUTHENTICATION)}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Utility gratis bila dikirim saat window 24 jam customer masih terbuka. Lead dari
              Click-to-WhatsApp Ads gratis hingga 72 jam (Free Entry Point) — bila Meta tidak
              menagih, kredit yang terlanjur terpotong direfund otomatis.
            </div>
          </div>
        </CardContent>
      </Card>

      {packages.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Belum ada paket Kredit Pesan aktif. Hubungi admin untuk top-up manual.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {packages.map((pkg) => {
            const isHighlight = pkg.isPopular
            const utilityCount = rates.UTILITY > 0 ? Math.floor(pkg.tokenAmount / rates.UTILITY) : 0
            const marketingCount = rates.MARKETING > 0 ? Math.floor(pkg.tokenAmount / rates.MARKETING) : 0
            return (
              <Card
                key={pkg.id}
                className={cn('relative flex flex-col rounded-xl border-warm-200', isHighlight && 'border-2 border-sky-400')}
              >
                <CardHeader>
                  <CardTitle className="font-display text-lg font-bold text-warm-900 dark:text-warm-50">{pkg.name}</CardTitle>
                  <CardDescription className="text-warm-500">Kredit {formatRupiah(pkg.tokenAmount)}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-3">
                  <div className="font-display text-2xl font-extrabold tabular-nums text-warm-900 dark:text-warm-50">
                    {formatRupiah(pkg.price)}
                  </div>
                  <ul className="space-y-1.5 text-sm text-warm-700">
                    <li className="flex items-center gap-2">
                      <Check className="size-3.5 text-sky-600" /> ± {utilityCount.toLocaleString('id-ID')} pesan utility
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="size-3.5 text-sky-600" /> ± {marketingCount.toLocaleString('id-ID')} pesan marketing
                    </li>
                  </ul>
                  <div className="mt-auto pt-1">
                    <Button asChild variant={isHighlight ? 'default' : 'outline'} className="w-full rounded-full">
                      <Link href={`/checkout/select/${pkg.id}`}>Top-up Kredit</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {transactions.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Keterangan</TableHead>
                <TableHead className="text-right">Jumlah</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {t.createdAt.toLocaleString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Jakarta',
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {TX_LABEL[t.type]}
                      {t.category ? ` · ${CAT_LABEL[t.category]}` : ''}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm" title={t.description ?? undefined}>
                    {t.description ?? '—'}
                  </TableCell>
                  <TableCell className={cn('text-right font-medium tabular-nums', t.amountRp < 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400')}>
                    {t.amountRp > 0 ? '+' : ''}
                    {formatRupiah(t.amountRp)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  )
}
