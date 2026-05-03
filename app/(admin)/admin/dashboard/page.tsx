// Admin dashboard — stats agregat platform.
import { Activity, CreditCard, MessageCircle, Users } from 'lucide-react'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
    <div className="mx-auto h-full max-w-6xl overflow-y-auto p-4 md:p-6">
      <div className="mb-7">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Admin Dashboard
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Ringkasan platform — metrik utama untuk pantau pertumbuhan & operasional.
        </p>
      </div>

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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Pembayaran Sukses Terbaru</CardTitle>
        </CardHeader>
        <CardContent>
          {recentPayments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada pembayaran sukses.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-4 font-medium">Order ID</th>
                    <th className="py-2 pr-4 font-medium">User</th>
                    <th className="py-2 pr-4 font-medium">Token</th>
                    <th className="py-2 pr-4 font-medium">Metode</th>
                    <th className="py-2 pr-4 text-right font-medium">Jumlah</th>
                    <th className="py-2 pr-4 text-right font-medium">Tanggal</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((p) => {
                    const u = userMap.get(p.userId)
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-mono text-xs">{p.orderId}</td>
                        <td className="py-2 pr-4">{u?.name || u?.email || '—'}</td>
                        <td className="py-2 pr-4">{formatNumber(p.tokenAmount)}</td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {p.paymentMethod ?? '—'}
                        </td>
                        <td className="py-2 pr-4 text-right">{formatRupiah(p.amount)}</td>
                        <td className="py-2 pr-4 text-right text-muted-foreground">
                          {p.paidAt?.toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          }) ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
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
    <Card className="group rounded-xl border-warm-200 shadow-sm hover-lift">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-xs font-medium uppercase tracking-wider text-warm-500">
          {label}
        </CardTitle>
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary-100 text-primary-500 transition-colors group-hover:bg-primary-500 group-hover:text-white">
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        <div className="font-display text-2xl font-bold text-warm-900 dark:text-warm-50 tabular-nums">
          {value}
        </div>
        {hint && <p className="mt-1 text-xs text-warm-500">{hint}</p>}
      </CardContent>
    </Card>
  )
}
