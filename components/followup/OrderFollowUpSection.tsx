'use client'

// Section "Riwayat & Jadwal Follow-Up" untuk dipasang di OrderDetailDialog.
// Tampilkan FollowUpLog yang sudah ke-kirim + FollowUpQueue PENDING + tombol
// kirim pesan manual ke customer.
import { BellRing, Loader2, Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface QueueItem {
  id: string
  scheduledAt: string
  status: string
  resolvedMessage: string
  template: { name: string; trigger: string }
}

interface LogItem {
  id: string
  message: string
  status: string
  source: string
  errorMessage: string | null
  sentAt: string
}

interface Template {
  id: string
  name: string
  message: string
}

const NULL_TEMPLATE = '__NULL__'

export function OrderFollowUpSection({ orderId }: { orderId: string }) {
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [logs, setLogs] = useState<LogItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showSend, setShowSend] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/followup/order/${orderId}`, {
          cache: 'no-store',
        })
        const json = await res.json()
        if (cancelled) return
        if (!json.success) {
          setError(json.error)
        } else {
          setError(null)
          setQueue(json.data.queue ?? [])
          setLogs(json.data.logs ?? [])
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Network error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [orderId, reloadKey])

  if (loading) {
    return (
      <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <Loader2 className="size-4 animate-spin" />
      </section>
    )
  }

  return (
    <>
      <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1 text-sm font-medium">
            <BellRing className="size-4" /> Riwayat & Jadwal Follow-Up
          </p>
          <Button size="sm" variant="outline" onClick={() => setShowSend(true)}>
            <Send className="mr-1 size-3" /> Kirim Manual
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {logs.length === 0 && queue.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Belum ada follow-up untuk order ini.
          </p>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
            {logs.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <Badge
                  variant={l.status === 'SENT' ? 'default' : 'destructive'}
                  className={l.status === 'SENT' ? 'bg-emerald-600' : ''}
                >
                  ✓ {l.status}
                </Badge>
                <span className="text-muted-foreground">
                  {new Date(l.sentAt).toLocaleString('id-ID')}
                </span>
                <span className="line-clamp-1">{l.message.slice(0, 60)}</span>
                <Badge variant="outline" className="ml-auto">
                  {l.source}
                </Badge>
              </li>
            ))}
            {queue
              .filter((q) => q.status === 'PENDING')
              .map((q) => (
                <li key={q.id} className="flex items-center gap-2">
                  <Badge variant="outline">⏰ Dijadwal</Badge>
                  <span className="text-muted-foreground">
                    {new Date(q.scheduledAt).toLocaleString('id-ID')}
                  </span>
                  <span className="line-clamp-1">{q.template.name}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      <ManualSendDialog
        open={showSend}
        orderId={orderId}
        onClose={() => setShowSend(false)}
        onSent={() => {
          setShowSend(false)
          setLoading(true)
          reload()
        }}
      />
    </>
  )
}

function ManualSendDialog({
  open,
  orderId,
  onClose,
  onSent,
}: {
  open: boolean
  orderId: string
  onClose: () => void
  onSent: () => void
}) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState<string>(NULL_TEMPLATE)
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    fetch('/api/followup/templates')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setTemplates(j.data ?? [])
      })
      .catch(() => {})
  }, [open])

  function handleTemplateChange(value: string) {
    setTemplateId(value)
    if (value !== NULL_TEMPLATE) {
      const tmpl = templates.find((t) => t.id === value)
      if (tmpl) setMessage(tmpl.message)
    }
  }

  async function handleSend() {
    setSubmitting(true)
    try {
      const payload =
        templateId === NULL_TEMPLATE ? { message } : { templateId }
      const res = await fetch(`/api/orders/${orderId}/send-manual-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!json.success) {
        alert(json.error)
      } else {
        onSent()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Kirim Pesan Manual</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Pakai Template (opsional)</Label>
            <Select value={templateId} onValueChange={handleTemplateChange}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih template" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NULL_TEMPLATE}>Tulis manual</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {templateId === NULL_TEMPLATE && (
            <div>
              <Label>Pesan</Label>
              <Textarea
                rows={8}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Pakai {nama}, {invoice}, {total}, {produk}, dst untuk variable."
              />
            </div>
          )}
          {templateId !== NULL_TEMPLATE && (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
              {message || '(template kosong)'}
            </pre>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={handleSend}
            disabled={
              submitting ||
              (templateId === NULL_TEMPLATE && message.trim().length < 1)
            }
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Kirim Sekarang
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
