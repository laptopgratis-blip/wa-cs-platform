'use client'

// Pengelola endpoint webhook ala halaman Integrations kirimchat: counter X/5,
// satu CTA "Buat Endpoint", empty state besar, dan kartu per endpoint dengan
// aksi uji/aktif-nonaktif/rotate secret/hapus + riwayat pengiriman.
// Secret HMAC hanya tampil SEKALI (saat dibuat / di-rotate).
import {
  Copy,
  History,
  Loader2,
  Plus,
  Power,
  RefreshCcw,
  Trash2,
  Webhook,
  Zap,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge, type StatusTone } from '@/components/shared/StatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  MAX_WEBHOOK_ENDPOINTS_PER_USER,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_EVENT_TYPES,
  type WebhookEventType,
} from '@/lib/validations/webhook-endpoint'

export interface WebhookEndpointRow {
  id: string
  url: string
  description: string | null
  events: string[]
  isActive: boolean
  autoDisabledAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastError: string | null
  createdAt: string
}

interface DeliveryRow {
  id: string
  eventType: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'DEAD'
  attempt: number
  httpStatus: number | null
  error: string | null
  createdAt: string
}

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function fmt(iso: string | null): string {
  return iso ? dateFmt.format(new Date(iso)) : '—'
}

function endpointStatus(e: WebhookEndpointRow): { tone: StatusTone; label: string } {
  if (e.autoDisabledAt) return { tone: 'danger', label: 'Dimatikan otomatis' }
  if (!e.isActive) return { tone: 'neutral', label: 'Nonaktif' }
  if (e.lastError && !e.lastSuccessAt) return { tone: 'warning', label: 'Belum pernah sukses' }
  return { tone: 'success', label: 'Aktif' }
}

const DELIVERY_TONE: Record<DeliveryRow['status'], StatusTone> = {
  PENDING: 'neutral',
  SUCCESS: 'success',
  FAILED: 'warning',
  DEAD: 'danger',
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback di bawah
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

interface Props {
  initialEndpoints: WebhookEndpointRow[]
}

export function WebhookEndpointsClient({ initialEndpoints }: Props) {
  const [endpoints, setEndpoints] = useState<WebhookEndpointRow[]>(initialEndpoints)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [events, setEvents] = useState<WebhookEventType[]>([...WEBHOOK_EVENT_TYPES])
  const [saving, setSaving] = useState(false)
  const [secret, setSecret] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpointRow | null>(null)
  const [rotateTarget, setRotateTarget] = useState<WebhookEndpointRow | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [deliveries, setDeliveries] = useState<DeliveryRow[] | null>(null)

  const reload = async () => {
    try {
      const res = await fetch('/api/pengembang/webhooks')
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Gagal memuat')
      setEndpoints(json.data.endpoints)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const resetForm = () => {
    setSecret(null)
    setUrl('')
    setDescription('')
    setEvents([...WEBHOOK_EVENT_TYPES])
  }

  const openDialog = () => {
    resetForm()
    setDialogOpen(true)
  }
  const closeDialog = () => {
    setDialogOpen(false)
    setTimeout(resetForm, 200)
  }

  const handleCreate = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/pengembang/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), description: description.trim(), events }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Gagal membuat endpoint')
      setSecret(json.data.secret)
      await reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (ep: WebhookEndpointRow) => {
    setBusyId(ep.id)
    try {
      const res = await fetch(`/api/pengembang/webhooks/${ep.id}/test`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Gagal mengirim uji')
      if (json.data.ok) toast.success(`Uji terkirim — endpoint membalas HTTP ${json.data.httpStatus}`)
      else toast.error(`Uji gagal: ${json.data.error ?? 'tanpa keterangan'}`)
      await reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const handleToggle = async (ep: WebhookEndpointRow) => {
    setBusyId(ep.id)
    try {
      const res = await fetch(`/api/pengembang/webhooks/${ep.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !ep.isActive }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Gagal menyimpan')
      toast.success(ep.isActive ? 'Endpoint dinonaktifkan' : 'Endpoint diaktifkan')
      await reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      const res = await fetch(`/api/pengembang/webhooks/${deleteTarget.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Gagal menghapus')
      toast.success('Endpoint dihapus')
      setDeleteTarget(null)
      await reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const handleRotate = async () => {
    if (!rotateTarget) return
    setBusyId(rotateTarget.id)
    try {
      const res = await fetch(`/api/pengembang/webhooks/${rotateTarget.id}/rotate-secret`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Gagal mengganti secret')
      setRotateTarget(null)
      setSecret(json.data.secret)
      setDialogOpen(true) // pakai dialog yang sama untuk menampilkan secret baru
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const toggleHistory = async (ep: WebhookEndpointRow) => {
    if (historyFor === ep.id) {
      setHistoryFor(null)
      setDeliveries(null)
      return
    }
    setHistoryFor(ep.id)
    setDeliveries(null)
    try {
      const res = await fetch(`/api/pengembang/webhooks/${ep.id}/deliveries`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Gagal memuat riwayat')
      setDeliveries(json.data.deliveries)
    } catch (err) {
      toast.error((err as Error).message)
      setHistoryFor(null)
    }
  }

  const toggleEvent = (ev: WebhookEventType) => {
    setEvents((prev) => (prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev]))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-warm-500">
          {endpoints.length} dari {MAX_WEBHOOK_ENDPOINTS_PER_USER} endpoint terpakai. Event dikirim
          sebagai POST JSON bertanda tangan HMAC.
        </p>
        <Button onClick={openDialog} disabled={endpoints.length >= MAX_WEBHOOK_ENDPOINTS_PER_USER}>
          <Plus className="mr-2 size-4" /> Buat Endpoint
        </Button>
      </div>

      {endpoints.length === 0 ? (
        <EmptyState
          bordered
          icon={Webhook}
          title="Belum ada endpoint"
          description="Buat endpoint pertama untuk menerima pesan masuk, perubahan status, dan kontak baru langsung di sistemmu — n8n, Zapier, atau backend sendiri."
          action={
            <Button onClick={openDialog}>
              <Plus className="mr-2 size-4" /> Buat Endpoint
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {endpoints.map((ep) => {
            const st = endpointStatus(ep)
            const busy = busyId === ep.id
            return (
              <Card key={ep.id}>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-warm-900">{ep.url}</p>
                      {ep.description && (
                        <p className="mt-0.5 text-sm text-warm-500">{ep.description}</p>
                      )}
                    </div>
                    <StatusBadge tone={st.tone} label={st.label} />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {ep.events.map((ev) => (
                      <Badge key={ev} variant="secondary" className="font-mono text-xs">
                        {ev}
                      </Badge>
                    ))}
                  </div>

                  <p className="text-xs text-warm-500">
                    Sukses terakhir: {fmt(ep.lastSuccessAt)} · Gagal terakhir: {fmt(ep.lastFailureAt)}
                    {ep.lastError && <> · {ep.lastError}</>}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => handleTest(ep)}>
                      {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Zap className="mr-1.5 size-4" />}
                      Kirim uji
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => handleToggle(ep)}>
                      <Power className="mr-1.5 size-4" />
                      {ep.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setRotateTarget(ep)}>
                      <RefreshCcw className="mr-1.5 size-4" /> Ganti secret
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggleHistory(ep)}>
                      <History className="mr-1.5 size-4" /> Riwayat
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700"
                      disabled={busy}
                      onClick={() => setDeleteTarget(ep)}
                    >
                      <Trash2 className="size-4" />
                      <span className="sr-only">Hapus endpoint</span>
                    </Button>
                  </div>

                  {historyFor === ep.id && (
                    <div className="rounded-lg bg-warm-50 p-3">
                      {deliveries === null ? (
                        <p className="flex items-center gap-2 text-sm text-warm-500">
                          <Loader2 className="size-4 animate-spin" /> Memuat…
                        </p>
                      ) : deliveries.length === 0 ? (
                        <p className="text-sm text-warm-500">Belum ada pengiriman.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {deliveries.map((d) => (
                            <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <StatusBadge tone={DELIVERY_TONE[d.status]} label={d.status} />
                              <code className="font-mono">{d.eventType}</code>
                              <span className="text-warm-500">
                                percobaan {d.attempt}
                                {d.httpStatus ? ` · HTTP ${d.httpStatus}` : ''}
                                {d.error ? ` · ${d.error}` : ''} · {fmt(d.createdAt)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => (o ? setDialogOpen(true) : closeDialog())}>
        <DialogContent className="sm:max-w-lg">
          {secret ? (
            <>
              <DialogHeader>
                <DialogTitle>Simpan signing secret ini</DialogTitle>
                <DialogDescription>
                  Dipakai memverifikasi tanda tangan <code className="font-mono">X-Hulao-Signature</code>.
                  Hanya ditampilkan sekali — setelah dialog ditutup tidak bisa dilihat lagi.
                </DialogDescription>
              </DialogHeader>
              <Alert variant="destructive">
                <AlertTitle>Salin sekarang</AlertTitle>
                <AlertDescription>
                  Simpan di environment variable sistemmu (mis. <code className="font-mono">HULAO_WEBHOOK_SECRET</code>),
                  jangan di kode publik.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Input readOnly value={secret} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const ok = await copyText(secret)
                    if (ok) toast.success('Secret disalin')
                    else toast.error('Gagal menyalin — pilih teksnya lalu salin manual')
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={closeDialog}>Saya sudah menyimpannya</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Buat Endpoint Webhook</DialogTitle>
                <DialogDescription>
                  Event dikirim sebagai POST JSON ke URL ini, bertanda tangan HMAC supaya sistemmu
                  bisa memastikan pengirimnya benar-benar Hulao.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="wh-url">URL tujuan</Label>
                  <Input
                    id="wh-url"
                    value={url}
                    placeholder="https://sistemmu.com/webhooks/hulao"
                    onChange={(e) => setUrl(e.target.value)}
                  />
                  <p className="text-xs text-warm-500">Wajib https. Alamat internal/privat ditolak.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wh-desc">Deskripsi (opsional)</Label>
                  <Input
                    id="wh-desc"
                    value={description}
                    maxLength={120}
                    placeholder="Contoh: n8n produksi"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Event yang dikirim</Label>
                  {WEBHOOK_EVENT_TYPES.map((ev) => (
                    <label key={ev} className="flex cursor-pointer items-start gap-2.5">
                      <Checkbox
                        checked={events.includes(ev)}
                        onCheckedChange={() => toggleEvent(ev)}
                        className="mt-0.5"
                      />
                      <span className="text-sm">
                        <span className="font-medium text-warm-900">{WEBHOOK_EVENT_LABELS[ev].label}</span>{' '}
                        <code className="font-mono text-xs text-warm-500">{ev}</code>
                        <span className="block text-xs text-warm-500">{WEBHOOK_EVENT_LABELS[ev].desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog} disabled={saving}>
                  Batal
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={saving || url.trim().length < 12 || events.length === 0}
                >
                  {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Buat Endpoint
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Hapus endpoint ini?"
        description={`${deleteTarget?.url ?? ''} akan berhenti menerima event dan riwayat pengirimannya ikut terhapus.`}
        confirmLabel="Ya, Hapus"
        isLoading={busyId === deleteTarget?.id}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={rotateTarget !== null}
        onOpenChange={(o) => !o && setRotateTarget(null)}
        title="Ganti signing secret?"
        description="Secret lama langsung tidak berlaku — integrasi yang masih memakainya akan gagal verifikasi sampai kamu memasang secret baru."
        confirmLabel="Ya, Ganti"
        variant="default"
        isLoading={busyId === rotateTarget?.id}
        onConfirm={handleRotate}
      />
    </div>
  )
}
