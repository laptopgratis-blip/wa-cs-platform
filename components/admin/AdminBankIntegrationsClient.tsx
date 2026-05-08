'use client'

// Admin panel untuk monitor + kontrol Bank Mutation integrations.
// Tombol [Block User] toggle isAdminBlocked per user.
// Tombol [Block All] emergency stop semua scraping (mis. BCA detect anomaly).
import { AlertTriangle, Loader2, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="h-6 w-6" />
            Bank Integrations (BETA)
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitor + kill switch untuk fitur Bank Mutation Auto-Reader.
          </p>
        </div>
        <div className="flex gap-2">
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
            <AlertTriangle className="h-4 w-4 mr-1" />
            Block All
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Integrations ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin inline" />
            </div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              Belum ada user yang aktivasi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3 font-medium">User</th>
                    <th className="p-3 font-medium">Rekening</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Last sync</th>
                    <th className="p-3 font-medium text-right">Mutasi</th>
                    <th className="p-3 font-medium text-right">Auto-confirm</th>
                    <th className="p-3 font-medium text-right">Fail</th>
                    <th className="p-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-b">
                      <td className="p-3">
                        <div className="font-medium">
                          {it.userName || '—'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {it.userEmail}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-mono text-xs">
                          {it.accountNumber || '—'}
                        </div>
                        <div className="text-xs">
                          {it.accountName || '—'}
                        </div>
                      </td>
                      <td className="p-3">
                        {it.isAdminBlocked ? (
                          <Badge variant="destructive">BLOCKED</Badge>
                        ) : !it.isActive ? (
                          <Badge variant="outline">PAUSED</Badge>
                        ) : it.lastScrapeStatus === 'SUCCESS' ? (
                          <Badge className="bg-emerald-600">ACTIVE</Badge>
                        ) : it.lastScrapeStatus ? (
                          <Badge variant="destructive">
                            {it.lastScrapeStatus}
                          </Badge>
                        ) : (
                          <Badge variant="outline">PENDING</Badge>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {it.lastScrapedAt
                          ? formatRelativeTime(it.lastScrapedAt)
                          : '—'}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {it.totalMutationsCaptured}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {it.totalAutoConfirmed}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {it.totalScrapeFailures}
                      </td>
                      <td className="p-3">
                        <Button
                          size="sm"
                          variant={it.isAdminBlocked ? 'outline' : 'destructive'}
                          onClick={() => toggleBlock(it)}
                        >
                          {it.isAdminBlocked ? 'Unblock' : 'Block'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmBlockAll} onOpenChange={setConfirmBlockAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block All — Emergency Stop</DialogTitle>
            <DialogDescription>
              Set isAdminBlocked = true untuk SEMUA integration. Cron tidak akan
              trigger scraper sampai di-unblock. User existing tidak bisa
              manual sync. Pakai kalau ada masalah BCA detection / insiden.
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
            <Button variant="outline" onClick={() => setConfirmUnblockAll(false)}>
              Batal
            </Button>
            <Button onClick={unblockAll}>Unblock All</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
