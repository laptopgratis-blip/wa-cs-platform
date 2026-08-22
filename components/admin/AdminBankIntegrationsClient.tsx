'use client'

// Admin panel untuk monitor + kontrol Bank Mutation integrations.
// Tombol [Block User] toggle isAdminBlocked per user.
// Tombol [Block All] emergency stop semua scraping (mis. BCA detect anomaly).
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatRelativeTime } from '@/lib/format-time'

interface AdminIntegration {
  id: string
  userId: string
  userEmail: string
  userName: string | null
  bankCode: string
  accountNumber: string | null
  accountName: string | null
  isActive: boolean
  isAdminBlocked: boolean
  isBetaConsented: boolean
  lastScrapedAt: string | null
  lastScrapeStatus: string | null
  lastScrapeError: string | null
  totalMutationsCaptured: number
  totalAutoConfirmed: number
  totalScrapes: number
  totalScrapeFailures: number
  createdAt: string
}

export function AdminBankIntegrationsClient() {
  const [items, setItems] = useState<AdminIntegration[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmBlockAll, setConfirmBlockAll] = useState(false)
  const [confirmUnblockAll, setConfirmUnblockAll] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/bank-integrations')
      const j = await res.json()
      if (j.success) setItems(j.data.integrations)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleBlock(item: AdminIntegration) {
    const target = !item.isAdminBlocked
    const res = await fetch(`/api/admin/bank-integrations/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdminBlocked: target }),
    })
    const j = await res.json()
    if (!res.ok || !j.success) {
      toast.error(j.error || 'Gagal toggle')
      return
    }
    toast.success(target ? 'Diblokir' : 'Unblock')
    load()
  }

  async function blockAll() {
    const res = await fetch('/api/admin/bank-integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockAll: true }),
    })
    const j = await res.json()
    if (!res.ok || !j.success) {
      toast.error(j.error || 'Gagal block all')
      return
    }
    toast.success(`Blocked ${j.data.blocked} integration(s)`)
    setConfirmBlockAll(false)
    load()
  }

  async function unblockAll() {
    const res = await fetch('/api/admin/bank-integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unblockAll: true }),
    })
    const j = await res.json()
    if (!res.ok || !j.success) {
      toast.error(j.error || 'Gagal unblock all')
      return
    }
    toast.success(`Unblocked ${j.data.unblocked} integration(s)`)
    setConfirmUnblockAll(false)
    load()
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bank Integrations (BETA)"
        icon={ShieldAlert}
        description="Monitor + kill switch untuk fitur Bank Mutation Auto-Reader."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmUnblockAll(true)}
            >
              Unblock All
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmBlockAll(true)}
            >
              <AlertTriangle className="mr-1" />
              Block All
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Integrations ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4">
              <CardGridSkeleton count={2} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="Belum ada user yang aktivasi"
              description="Integrasi bank yang diaktifkan user bakal termonitor di sini."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Rekening</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead className="text-right">Mutasi</TableHead>
                  <TableHead className="text-right">Auto-confirm</TableHead>
                  <TableHead className="text-right">Fail</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it) => (
                  <TableRow key={it.id}>
                    <TableCell>
                      <div className="font-medium">{it.userName || '—'}</div>
                      <div className="text-muted-foreground text-xs">
                        {it.userEmail}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">
                        {it.accountNumber || '—'}
                      </div>
                      <div className="text-xs">{it.accountName || '—'}</div>
                    </TableCell>
                    <TableCell>
                      {it.isAdminBlocked ? (
                        <Badge variant="destructive">BLOCKED</Badge>
                      ) : !it.isActive ? (
                        <Badge variant="outline">PAUSED</Badge>
                      ) : it.lastScrapeStatus === 'SUCCESS' ? (
                        <StatusBadge tone="success" label="ACTIVE" />
                      ) : it.lastScrapeStatus ? (
                        <Badge variant="destructive">
                          {it.lastScrapeStatus}
                        </Badge>
                      ) : (
                        <Badge variant="outline">PENDING</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {it.lastScrapedAt
                        ? formatRelativeTime(it.lastScrapedAt)
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {it.totalMutationsCaptured}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {it.totalAutoConfirmed}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {it.totalScrapeFailures}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant={it.isAdminBlocked ? 'outline' : 'destructive'}
                        onClick={() => toggleBlock(it)}
                      >
                        {it.isAdminBlocked ? 'Unblock' : 'Block'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmBlockAll} onOpenChange={setConfirmBlockAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block All — Emergency Stop</DialogTitle>
            <DialogDescription>
              Set isAdminBlocked = true untuk SEMUA integration. Cron tidak akan
              trigger scraper sampai di-unblock. User existing tidak bisa manual
              sync. Pakai kalau ada masalah BCA detection / insiden.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBlockAll(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={blockAll}>
              Ya, Block All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmUnblockAll} onOpenChange={setConfirmUnblockAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unblock All</DialogTitle>
            <DialogDescription>
              Set isAdminBlocked = false untuk semua integration. Cron akan
              kembali jalan normal.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmUnblockAll(false)}
            >
              Batal
            </Button>
            <Button onClick={unblockAll}>Unblock All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
