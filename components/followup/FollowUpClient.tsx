'use client'

// Follow-Up Order System dashboard untuk user (POWER only).
// 4 tab: Today (PENDING jadwal hari ini), Upcoming (PENDING > today),
// History (FollowUpLog), Blacklist.
//
// WA gating: kalau wa belum konek, tampilkan banner.
// Empty state: kalau belum ada template, tampilkan CTA enable yang trigger
// /api/integrations/followup/enable untuk auto-seed default templates.
import {
  AlertCircle,
  Ban,
  BellRing,
  Clock,
  History,
  Loader2,
  Pencil,
  Send,
  SkipForward,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

type Tab = 'today' | 'upcoming' | 'history' | 'blacklist'

interface QueueItem {
  id: string
  scheduledAt: string
  status: string
  customerPhone: string
  resolvedMessage: string
  template: { name: string; trigger: string }
  order: {
    id: string
    invoiceNumber: string | null
    customerName: string
    customerPhone: string
    paymentStatus: string
    deliveryStatus: string
  }
}

interface LogItem {
  id: string
  customerPhone: string
  message: string
  status: string
  source: string
  errorMessage: string | null
  sentAt: string
  orderId: string
}

interface BlacklistItem {
  id: string
  customerPhone: string
  reason: string | null
  blockedAt: string
}

export function FollowUpClient({
  waConnected,
  hasTemplates,
}: {
  waConnected: boolean
  hasTemplates: boolean
}) {
  const [tab, setTab] = useState<Tab>('today')
  const [items, setItems] = useState<
    QueueItem[] | LogItem[] | BlacklistItem[]
  >([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enabling, setEnabling] = useState(false)
  const [editing, setEditing] = useState<QueueItem | null>(null)
  const [editText, setEditText] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)

  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    if (!hasTemplates) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/followup/queue?tab=${tab}`, {
          cache: 'no-store',
        })
        const json = await res.json()
        if (cancelled) return
        if (!json.success) {
          setError(json.error ?? 'Gagal memuat')
          setItems([])
        } else {
          setError(null)
          setItems(json.data?.items ?? [])
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Network error')
        setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tab, hasTemplates, reloadKey])

  async function handleEnable() {
    setEnabling(true)
    try {
      const res = await fetch('/api/integrations/followup/enable', {
        method: 'POST',
      })
      const json = await res.json()
      if (!json.success) {
        alert(json.error ?? 'Gagal enable')
      } else {
        window.location.reload()
      }
    } finally {
      setEnabling(false)
    }
  }

  async function handleSkip(id: string) {
    if (!confirm('Skip item ini?')) return
    setActionId(id)
    try {
      const res = await fetch(`/api/followup/queue/${id}/skip`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!json.success) {
        alert(json.error)
      } else {
        setLoading(true)
        reload()
      }
    } finally {
      setActionId(null)
    }
  }

  async function handleSendNow(id: string) {
    if (!confirm('Kirim sekarang ke customer?')) return
    setActionId(id)
    try {
      const res = await fetch(`/api/followup/queue/${id}/send-now`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!json.success) {
        alert(json.error)
      } else {
        setLoading(true)
        reload()
      }
    } finally {
      setActionId(null)
    }
  }

  function openEdit(item: QueueItem) {
    setEditing(item)
    setEditText(item.resolvedMessage)
  }

  async function saveEdit() {
    if (!editing) return
    setActionId(editing.id)
    try {
      const res = await fetch(`/api/followup/queue/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolvedMessage: editText }),
      })
      const json = await res.json()
      if (!json.success) {
        alert(json.error)
      } else {
        setEditing(null)
        setLoading(true)
        reload()
      }
    } finally {
      setActionId(null)
    }
  }

  async function handleUnblock(id: string) {
    if (!confirm('Unblock customer ini?')) return
    setActionId(id)
    try {
      const res = await fetch(`/api/followup/blacklist/${id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!json.success) {
        alert(json.error)
      } else {
        setLoading(true)
        reload()
      }
    } finally {
      setActionId(null)
    }
  }

  // Empty state — belum ada template.
  if (!hasTemplates) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="mb-4 flex items-center gap-2 text-2xl font-bold">
          <BellRing className="size-6" />
          Follow-Up Pesanan
        </h1>
        <Card>
          <CardContent className="space-y-4 p-8 text-center">
            <Sparkles className="mx-auto size-12 text-primary-500" />
            <h2 className="text-xl font-semibold">
              Aktifkan Follow-Up Otomatis
            </h2>
            <p className="text-muted-foreground">
              Kirim pesan WhatsApp otomatis ke customer berdasarkan event
              order — order masuk, pembayaran diterima, pesanan dikirim, dan
              N hari setelah event.
            </p>
            <p className="text-sm text-muted-foreground">
              7 template default akan dibuat untuk Anda. Bisa di-edit kapan
              saja di /pesanan/templates.
            </p>
            <Button onClick={handleEnable} disabled={enabling}>
              {enabling && <Loader2 className="mr-2 size-4 animate-spin" />}
              Aktifkan & Buat Template Default
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <BellRing className="size-6" />
          Follow-Up Pesanan
        </h1>
        <Button asChild variant="outline" size="sm">
          <Link href="/pesanan/templates">Kelola Template</Link>
        </Button>
      </div>

      {!waConnected && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="size-4" />
          <AlertTitle>WhatsApp belum tersambung</AlertTitle>
          <AlertDescription>
            Hubungkan WhatsApp dulu di{' '}
            <Link href="/whatsapp" className="font-semibold underline">
              /whatsapp
            </Link>{' '}
            supaya pesan follow-up bisa terkirim ke customer.
          </AlertDescription>
        </Alert>
      )}

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setLoading(true)
          setTab(v as Tab)
        }}
      >
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="today">
            <Clock className="mr-1 size-4" /> Hari Ini
          </TabsTrigger>
          <TabsTrigger value="upcoming">
            <Clock className="mr-1 size-4" /> Akan Datang
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="mr-1 size-4" /> Riwayat
          </TabsTrigger>
          <TabsTrigger value="blacklist">
            <Ban className="mr-1 size-4" /> Blacklist
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="mt-4">
          <QueueList
            loading={loading}
            error={error}
            items={items as QueueItem[]}
            actionId={actionId}
            onSkip={handleSkip}
            onSendNow={handleSendNow}
            onEdit={openEdit}
          />
        </TabsContent>
        <TabsContent value="upcoming" className="mt-4">
          <QueueList
            loading={loading}
            error={error}
            items={items as QueueItem[]}
            actionId={actionId}
            onSkip={handleSkip}
            onSendNow={handleSendNow}
            onEdit={openEdit}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <LogList
            loading={loading}
            error={error}
            items={items as LogItem[]}
          />
        </TabsContent>
        <TabsContent value="blacklist" className="mt-4">
          <BlacklistList
            loading={loading}
            error={error}
            items={items as BlacklistItem[]}
            actionId={actionId}
            onUnblock={handleUnblock}
          />
        </TabsContent>
      </Tabs>

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Pesan Follow-Up</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Untuk: {editing?.order.customerName} ({editing?.customerPhone})
            </p>
            <Textarea
              rows={12}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Batal
            </Button>
            <Button
              onClick={saveEdit}
              disabled={actionId === editing?.id || editText.trim().length < 1}
            >
              {actionId === editing?.id && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QueueList({
  loading,
  error,
  items,
  actionId,
  onSkip,
  onSendNow,
  onEdit,
}: {
  loading: boolean
  error: string | null
  items: QueueItem[]
  actionId: string | null
  onSkip: (id: string) => void
  onSendNow: (id: string) => void
  onEdit: (item: QueueItem) => void
}) {
  if (loading) {
    return <Loader2 className="mx-auto size-6 animate-spin" />
  }
  if (error) return <p className="text-destructive">{error}</p>
  if (items.length === 0) {
    return (
      <p className="text-center text-muted-foreground">Tidak ada item.</p>
    )
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{item.template.trigger}</Badge>
                  <span className="font-semibold">{item.template.name}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(item.scheduledAt).toLocaleString('id-ID')} —{' '}
                  {item.order.customerName} ({item.customerPhone}) ·{' '}
                  {item.order.invoiceNumber ?? item.order.id.slice(0, 8)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionId === item.id}
                  onClick={() => onEdit(item)}
                >
                  <Pencil className="mr-1 size-4" /> Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={actionId === item.id}
                  onClick={() => onSkip(item.id)}
                >
                  <SkipForward className="mr-1 size-4" /> Skip
                </Button>
                <Button
                  size="sm"
                  disabled={actionId === item.id}
                  onClick={() => onSendNow(item.id)}
                >
                  <Send className="mr-1 size-4" /> Kirim Sekarang
                </Button>
              </div>
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
              {item.resolvedMessage}
            </pre>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function LogList({
  loading,
  error,
  items,
}: {
  loading: boolean
  error: string | null
  items: LogItem[]
}) {
  if (loading) return <Loader2 className="mx-auto size-6 animate-spin" />
  if (error) return <p className="text-destructive">{error}</p>
  if (items.length === 0) {
    return <p className="text-center text-muted-foreground">Belum ada riwayat.</p>
  }
  return (
    <div className="space-y-2">
      {items.map((log) => (
        <Card key={log.id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      log.status === 'SENT' ? 'bg-emerald-600' : ''
                    }
                    variant={log.status === 'SENT' ? 'default' : 'destructive'}
                  >
                    {log.status}
                  </Badge>
                  <Badge variant="outline">{log.source}</Badge>
                  <span className="text-sm">{log.customerPhone}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(log.sentAt).toLocaleString('id-ID')}
                </p>
              </div>
            </div>
            {log.errorMessage && (
              <p className="text-xs text-destructive">{log.errorMessage}</p>
            )}
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
              {log.message}
            </pre>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function BlacklistList({
  loading,
  error,
  items,
  actionId,
  onUnblock,
}: {
  loading: boolean
  error: string | null
  items: BlacklistItem[]
  actionId: string | null
  onUnblock: (id: string) => void
}) {
  if (loading) return <Loader2 className="mx-auto size-6 animate-spin" />
  if (error) return <p className="text-destructive">{error}</p>
  if (items.length === 0) {
    return <p className="text-center text-muted-foreground">Tidak ada blacklist.</p>
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <p className="font-semibold">{item.customerPhone}</p>
              <p className="text-xs text-muted-foreground">
                {item.reason ?? 'Tanpa alasan'} · diblokir{' '}
                {new Date(item.blockedAt).toLocaleString('id-ID')}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={actionId === item.id}
              onClick={() => onUnblock(item.id)}
            >
              Unblock
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
