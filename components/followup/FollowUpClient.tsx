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
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CardGridSkeleton } from '@/components/shared/skeletons'
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
  // order ATAU liveLead — salah satu terisi. liveLead untuk nurture lead Live
  // "belum order".
  order: {
    id: string
    invoiceNumber: string | null
    customerName: string
    customerPhone: string
    paymentStatus: string
    deliveryStatus: string
  } | null
  liveLead: {
    id: string
    customerName: string
    customerPhone: string
    productInterest: string | null
  } | null
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
  const [items, setItems] = useState<QueueItem[] | LogItem[] | BlacklistItem[]>(
    [],
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enabling, setEnabling] = useState(false)
  const [editing, setEditing] = useState<QueueItem | null>(null)
  const [editText, setEditText] = useState('')
  const [actionId, setActionId] = useState<string | null>(null)
  // Konfirmasi aksi queue/blacklist — pengganti window.confirm().
  const [pendingConfirm, setPendingConfirm] = useState<{
    kind: 'skip' | 'send' | 'unblock'
    id: string
  } | null>(null)

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
        toast.error(json.error ?? 'Gagal enable')
      } else {
        window.location.reload()
      }
    } finally {
      setEnabling(false)
    }
  }

  async function handleSkip(id: string) {
    setActionId(id)
    try {
      const res = await fetch(`/api/followup/queue/${id}/skip`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? 'Gagal skip item')
      } else {
        setLoading(true)
        reload()
      }
    } finally {
      setActionId(null)
    }
  }

  async function handleSendNow(id: string) {
    setActionId(id)
    try {
      const res = await fetch(`/api/followup/queue/${id}/send-now`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? 'Gagal kirim pesan')
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
        toast.error(json.error ?? 'Gagal simpan perubahan')
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
    setActionId(id)
    try {
      const res = await fetch(`/api/followup/blacklist/${id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error ?? 'Gagal unblock customer')
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
      <PageContainer>
        <PageHeader title="Follow-Up Pesanan" />
        <EmptyState
          bordered
          icon={Sparkles}
          title="Aktifkan Follow-Up Otomatis"
          description={
            <>
              Kirim pesan WhatsApp otomatis ke customer berdasarkan event order
              — order masuk, pembayaran diterima, pesanan dikirim, dan N hari
              setelah event.
              <span className="mt-2 block">
                Paket template default akan dibuat untuk Anda (reminder bayar,
                info kirim, nurture lead Live, testimoni, dll). Bisa di-edit
                kapan saja di /pesanan/templates.
              </span>
            </>
          }
          action={
            <Button onClick={handleEnable} disabled={enabling}>
              {enabling && <Loader2 className="mr-2 size-4 animate-spin" />}
              Aktifkan & Buat Template Default
            </Button>
          }
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Follow-Up Pesanan"
        description="Pesan WA otomatis ke customer berdasarkan event order."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/pesanan/templates">Kelola Template</Link>
          </Button>
        }
      />

      {!waConnected && (
        <Alert variant="destructive">
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
            onSkip={(id) => setPendingConfirm({ kind: 'skip', id })}
            onSendNow={(id) => setPendingConfirm({ kind: 'send', id })}
            onEdit={openEdit}
          />
        </TabsContent>
        <TabsContent value="upcoming" className="mt-4">
          <QueueList
            loading={loading}
            error={error}
            items={items as QueueItem[]}
            actionId={actionId}
            onSkip={(id) => setPendingConfirm({ kind: 'skip', id })}
            onSendNow={(id) => setPendingConfirm({ kind: 'send', id })}
            onEdit={openEdit}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <LogList loading={loading} error={error} items={items as LogItem[]} />
        </TabsContent>
        <TabsContent value="blacklist" className="mt-4">
          <BlacklistList
            loading={loading}
            error={error}
            items={items as BlacklistItem[]}
            actionId={actionId}
            onUnblock={(id) => setPendingConfirm({ kind: 'unblock', id })}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={pendingConfirm !== null}
        onOpenChange={(o) => {
          if (!o) setPendingConfirm(null)
        }}
        title={
          pendingConfirm?.kind === 'skip'
            ? 'Skip item follow-up ini?'
            : pendingConfirm?.kind === 'send'
              ? 'Kirim sekarang ke customer?'
              : 'Unblock customer ini?'
        }
        description={
          pendingConfirm?.kind === 'skip'
            ? 'Pesan tidak akan dikirim untuk jadwal ini.'
            : pendingConfirm?.kind === 'send'
              ? 'Pesan WhatsApp langsung terkirim tanpa menunggu jadwal.'
              : 'Customer akan menerima pesan follow-up lagi ke depannya.'
        }
        confirmLabel={
          pendingConfirm?.kind === 'send' ? 'Ya, Kirim' : 'Ya, Lanjutkan'
        }
        variant={pendingConfirm?.kind === 'skip' ? 'destructive' : 'default'}
        onConfirm={() => {
          if (!pendingConfirm) return
          const { kind, id } = pendingConfirm
          setPendingConfirm(null)
          if (kind === 'skip') void handleSkip(id)
          else if (kind === 'send') void handleSendNow(id)
          else void handleUnblock(id)
        }}
      />

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Pesan Follow-Up</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-muted-foreground text-sm">
              Untuk:{' '}
              {editing?.order?.customerName ??
                editing?.liveLead?.customerName ??
                'Lead Live'}{' '}
              ({editing?.customerPhone})
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
    </PageContainer>
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
    return <CardGridSkeleton count={2} />
  }
  if (error) return <p className="text-destructive">{error}</p>
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="Tidak ada item"
        description="Follow-up terjadwal untuk tab ini bakal muncul di sini."
      />
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
                <p className="text-muted-foreground text-sm">
                  {new Date(item.scheduledAt).toLocaleString('id-ID')} —{' '}
                  {item.order?.customerName ??
                    item.liveLead?.customerName ??
                    '—'}{' '}
                  ({item.customerPhone}) ·{' '}
                  {item.order
                    ? (item.order.invoiceNumber ?? item.order.id.slice(0, 8))
                    : 'Lead Live (belum order)'}
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
            <pre className="bg-muted max-h-40 overflow-auto rounded p-2 text-xs whitespace-pre-wrap">
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
  if (loading) return <CardGridSkeleton count={2} />
  if (error) return <p className="text-destructive">{error}</p>
  if (items.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Belum ada riwayat"
        description="Pesan follow-up yang sudah terkirim (atau gagal) tercatat di sini."
      />
    )
  }
  return (
    <div className="space-y-2">
      {items.map((log) => (
        <Card key={log.id}>
          <CardContent className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <StatusBadge
                    tone={log.status === 'SENT' ? 'success' : 'danger'}
                    label={log.status === 'SENT' ? 'Terkirim' : 'Gagal'}
                  />
                  <Badge variant="outline">{log.source}</Badge>
                  <span className="text-sm">{log.customerPhone}</span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {new Date(log.sentAt).toLocaleString('id-ID')}
                </p>
              </div>
            </div>
            {log.errorMessage && (
              <p className="text-destructive text-xs">{log.errorMessage}</p>
            )}
            <pre className="bg-muted max-h-40 overflow-auto rounded p-2 text-xs whitespace-pre-wrap">
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
  if (loading) return <CardGridSkeleton count={2} />
  if (error) return <p className="text-destructive">{error}</p>
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Ban}
        title="Tidak ada blacklist"
        description="Customer yang minta berhenti di-follow-up bakal masuk daftar ini."
      />
    )
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <p className="font-semibold">{item.customerPhone}</p>
              <p className="text-muted-foreground text-xs">
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
