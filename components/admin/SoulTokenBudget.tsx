// Widget Token Budget Calculator untuk dashboard admin.
// Tujuan: bantu admin lihat estimasi beban prompt per balasan AI dan biaya
// provider per pesan, supaya gampang nentuin costPerMessage / margin.
//
// Asumsi (di-display di UI supaya admin sadar): 2.000 token input + 250 token
// output rata-rata. Kurs USD = Rp 16.000.
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatNumber, formatRupiah } from '@/lib/format'
import { prisma } from '@/lib/prisma'

const ASSUMED_INPUT = 2_000
const ASSUMED_OUTPUT = 250

interface BudgetRow {
  component: string
  min: number
  max: number
  avg: number
  note: string
}

const budgetRows: BudgetRow[] = [
  { component: 'System Prompt', min: 270, max: 970, avg: 620, note: 'Soul + ctx' },
  { component: 'History 10 pesan', min: 1_000, max: 1_500, avg: 1_300, note: 'Estimasi' },
  { component: 'Pesan customer', min: 30, max: 150, avg: 80, note: 'Estimasi' },
]

const totalInputMin = budgetRows.reduce((s, r) => s + r.min, 0)
const totalInputMax = budgetRows.reduce((s, r) => s + r.max, 0)
const totalInputAvg = budgetRows.reduce((s, r) => s + r.avg, 0)

export async function SoulTokenBudget() {
  // Ambil model aktif beserta harga provider — data ini sudah ada di tabel
  // AiModel (inputPricePer1M / outputPricePer1M dalam IDR, kurs $1=16k).
  const models = await prisma.aiModel.findMany({
    where: { isActive: true },
    orderBy: [{ inputPricePer1M: 'asc' }],
    select: {
      id: true,
      name: true,
      provider: true,
      inputPricePer1M: true,
      outputPricePer1M: true,
      costPerMessage: true,
    },
  })

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Soul Token Budget Calculator</CardTitle>
          <p className="text-xs text-muted-foreground">
            Estimasi token per balasan AI — pakai untuk hitung beban prompt dan
            anchor cost per pesan.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Komponen</TableHead>
                <TableHead className="text-right">Min</TableHead>
                <TableHead className="text-right">Maks</TableHead>
                <TableHead className="text-right">Rata-rata</TableHead>
                <TableHead>Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgetRows.map((r) => (
                <TableRow key={r.component}>
                  <TableCell className="font-medium">{r.component}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(r.min)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(r.max)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(r.avg)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.note}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell>TOTAL INPUT</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totalInputMin)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totalInputMax)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(totalInputAvg)}
                </TableCell>
                <TableCell />
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">OUTPUT</TableCell>
                <TableCell className="text-right tabular-nums">100</TableCell>
                <TableCell className="text-right tabular-nums">400</TableCell>
                <TableCell className="text-right tabular-nums">250</TableCell>
                <TableCell className="text-xs text-muted-foreground">Estimasi</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Biaya Provider per Pesan</CardTitle>
          <p className="text-xs text-muted-foreground">
            Asumsi {formatNumber(ASSUMED_INPUT)} token input +{' '}
            {formatNumber(ASSUMED_OUTPUT)} token output. Harga di-ambil dari
            kolom inputPricePer1M / outputPricePer1M (IDR per 1 juta token,
            kurs $1 = Rp 16.000).
          </p>
        </CardHeader>
        <CardContent>
          {models.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada AI model aktif.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Cost per pesan</TableHead>
                  <TableHead className="text-right">Token platform</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {models.map((m) => {
                  const costIdr =
                    (ASSUMED_INPUT * m.inputPricePer1M) / 1_000_000 +
                    (ASSUMED_OUTPUT * m.outputPricePer1M) / 1_000_000
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.provider}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.inputPricePer1M === 0 && m.outputPricePer1M === 0
                          ? '—'
                          : formatRupiah(Math.round(costIdr))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(m.costPerMessage)} tok
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
