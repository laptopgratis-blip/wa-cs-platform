// Admin dashboard — stats agregat platform.
import { Activity, CreditCard, MessageCircle, Users } from 'lucide-react'

import { ServerStatusCard } from '@/components/admin/ServerStatusCard'
import { SoulTokenBudget } from '@/components/admin/SoulTokenBudget'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
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

export const dynamic = 'force-dynamic'

export default async function AdminDashboardPage() {
  // Aggregate semua stats dalam paralel.
  const [
    totalUsers,
    totalSessions,
    activeSessions,
    revenueAgg,
    tokenSold,
    recentPayments,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.whatsappSession.count(),
    prisma.whatsappSession.count({ where: { status: 'CONNECTED' } }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: 'SUCCESS' },
    }),
    prisma.tokenTransaction.aggregate({
      _sum: { amount: true },
      where: { type: 'PURCHASE' },
    }),
    prisma.payment.findMany({
      where: { status: 'SUCCESS' },
      orderBy: { paidAt: 'desc' },
      take: 10,
      select: {
        id: true,
        orderId: true,
        amount: true,
        tokenAmount: true,
        paymentMethod: true,
        paidAt: true,
        userId: true,
      },
    }),
  ])

  const userMap = new Map<string, { email: string; name: string | null }>()
  if (recentPayments.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: recentPayments.map((p) => p.userId) } },
      select: { id: true, email: true, name: true },
    })
    for (const u of users) userMap.set(u.id, { email: u.email, name: u.name })
  }

  return (
    <PageContainer>
      <PageHeader
        title="Admin Dashboard"
        description="Ringkasan platform — metrik utama untuk pantau pertumbuhan & operasional."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="size-4" />}
          label="Total User"
          value={formatNumber(totalUsers)}
        />
        <StatCard
          icon={<CreditCard className="size-4" />}
          label="Total Pendapatan"
          value={formatRupiah(revenueAgg._sum.amount ?? 0)}
        />
        <StatCard
          icon={<Activity className="size-4" />}
          label="Token Terjual"
          value={formatNumber(tokenSold._sum.amount ?? 0)}
        />
        <StatCard
          icon={<MessageCircle className="size-4" />}
          label="WA Aktif"
          value={`${formatNumber(activeSessions)} / ${formatNumber(totalSessions)}`}
          hint="Connected / total"
        />
      </div>

      <SoulTokenBudget />

      <ServerStatusCard />

      <Card>
        <CardHeader>
          <CardTitle>Pembayaran Sukses Terbaru</CardTitle>
        </CardHeader>
        <CardContent>
          {recentPayments.length === 0 ? (
            <EmptyState
              title="Belum ada pembayaran sukses"
              description="Transaksi token yang berhasil bakal tampil di sini."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Token</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead className="text-right">Tanggal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPayments.map((p) => {
                  const u = userMap.get(p.userId)
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">
                        {p.orderId}
                      </TableCell>
                      <TableCell>{u?.name || u?.email || '—'}</TableCell>
                      <TableCell>{formatNumber(p.tokenAmount)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.paymentMethod ?? '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatRupiah(p.amount)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right">
                        {p.paidAt?.toLocaleDateString('id-ID', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        }) ?? '—'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
}

function StatCard({ icon, label, value, hint }: StatCardProps) {
  return (
    <Card className="group hover-lift">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-warm-500 text-xs font-medium tracking-wider uppercase">
          {label}
        </CardTitle>
        <span className="bg-primary-100 text-primary-500 group-hover:bg-primary-500 flex size-9 items-center justify-center rounded-lg transition-colors group-hover:text-white">
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <div className="font-display text-warm-900 text-2xl font-bold tabular-nums">
          {value}
        </div>
        {hint && <p className="text-warm-500 mt-1 text-xs">{hint}</p>}
      </CardContent>
    </Card>
  )
}
