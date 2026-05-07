'use client'

// Modal detail pesanan: data customer + items + status edit + chat history.
// Dibuka dari OrdersList saat user klik tombol "Detail" di card.
import { Loader2, MessageCircle, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  DELIVERY_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from '@/lib/validations/order'

interface OrderDetail {
  id: string
  customerName: string
  customerPhone: string
  customerAddress: string | null
  items: { name: string; qty: number; price?: number | null }[]
  totalAmount: number | null
  paymentMethod: string
  paymentStatus: string
  paymentProofUrl: string | null
  deliveryStatus: string
  trackingNumber: string | null
  flowName: string | null
  notes: string | null
  contactId: string
  createdAt: string
  updatedAt: string
  messages: Array<{
    id: string
    content: string
    role: 'USER' | 'AI' | 'HUMAN' | 'AGENT'
    createdAt: string
  }>
}

interface Props {
  orderId: string | null
  onClose: () => void
  onChanged: () => void
}

export function OrderDetailDialog({ orderId, onClose, onChanged }: Props) {
  const [data, setData] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState('')
  const [deliveryStatus, setDeliveryStatus] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!orderId) {
      setData(null)
      return
    }
    void (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/orders/${orderId}`)
        const json = (await res.json().catch(() => null)) as
          | { success: boolean; data?: OrderDetail; error?: string }
          | null
        if (!res.ok || !json?.success || !json.data) {
          toast.error(json?.error ?? 'Gagal memuat pesanan')
          onClose()
          return
        }
        setData(json.data)
        setPaymentStatus(json.data.paymentStatus)
        setDeliveryStatus(json.data.deliveryStatus)
        setPaymentMethod(json.data.paymentMethod)
        setTrackingNumber(json.data.trackingNumber ?? '')
        setNotes(json.data.notes ?? '')
      } finally {
        setLoading(false)
      }
    })()
  }, [orderId, onClose])

  async function handleSave() {
    if (!data) return
    setSaving(true)
    try {
      const res = await fetch(`/api/orders/${data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentStatus,
          deliveryStatus,
          paymentMethod,
          trackingNumber: trackingNumber.trim() || null,
          notes: notes.trim() || null,
        }),
      })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Gagal menyimpan perubahan')
        return
      }
      toast.success('Perubahan disimpan')
      onChanged()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!data) return
    if (!confirm('Yakin hapus pesanan ini? Tidak bisa di-undo.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/orders/${data.id}`, { method: 'DELETE' })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Gagal menghapus pesanan')
        return
      }
      toast.success('Pesanan dihapus')
      onChanged()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={orderId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detail Pesanan</DialogTitle>
          <DialogDescription>
            {data
              ? `${data.customerName} · ${new Date(data.createdAt).toLocaleString('id-ID')}`
              : 'Memuat...'}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {data && !loading && (
          <div className="flex flex-col gap-4">
            {/* Customer */}
            <section className="space-y-1 rounded-lg border p-3 text-sm">
              <p>
                <span className="text-muted-foreground">Nama:</span>{' '}
                <span className="font-medium">{data.customerName}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Nomor HP:</span>{' '}
                {data.customerPhone}
              </p>
              {data.customerAddress && (
                <p>
                  <span className="text-muted-foreground">Alamat:</span>{' '}
                  <span className="whitespace-pre-line">
                    {data.customerAddress}
                  </span>
                </p>
              )}
              {data.flowName && (
                <p className="text-xs text-muted-foreground">
                  Asal: {data.flowName}
                </p>
              )}
            </section>

            {/* Items (kalau ada) */}
            {data.items.length > 0 && (
              <section className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Items</p>
                <ul className="space-y-1 text-sm">
                  {data.items.map((it, i) => (
                    <li key={i} className="flex justify-between">
                      <span>
                        {it.name}
                        {it.qty > 1 ? ` × ${it.qty}` : ''}
                      </span>
                      {it.price !== null && it.price !== undefined && (
                        <span className="text-muted-foreground">
                          Rp {it.price.toLocaleString('id-ID')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {data.totalAmount !== null && (
                  <p className="border-t pt-2 text-right text-sm font-medium">
                    Total: Rp {data.totalAmount.toLocaleString('id-ID')}
                  </p>
                )}
              </section>
            )}

            {/* Status edit */}
            <section className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Status pembayaran</Label>
                <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status pengiriman</Label>
                <Select
                  value={deliveryStatus}
                  onValueChange={setDeliveryStatus}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELIVERY_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Metode bayar</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">No. Resi (opsional)</Label>
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="JNE1234567890"
                />
              </div>
            </section>

            <div className="space-y-1">
              <Label className="text-xs">Catatan internal</Label>
              <Textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tidak terlihat customer, hanya untuk admin."
              />
            </div>

            {/* Chat history */}
            {data.messages.length > 0 && (
              <section className="space-y-2 rounded-lg border bg-warm-50/40 p-3 dark:bg-warm-950/20">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Pesan terakhir di chat ({data.messages.length})
                  </p>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/inbox?contact=${data.contactId}`}>
                      <MessageCircle className="mr-1 size-3" />
                      Buka chat
                    </Link>
                  </Button>
                </div>
                <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
                  {data.messages.map((m) => (
                    <li key={m.id} className="flex gap-2">
                      <span className="shrink-0 font-mono text-muted-foreground">
                        {m.role === 'USER' ? '👤' : m.role === 'AI' ? '🤖' : '🧑‍💼'}
                      </span>
                      <span className="line-clamp-2">{m.content}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse gap-2 border-t pt-3 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="text-destructive hover:text-destructive"
              >
                {deleting ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 size-4" />
                )}
                Hapus Pesanan
              </Button>
              <div className="flex gap-2 sm:justify-end">
                <Button variant="ghost" onClick={onClose}>
                  Tutup
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Simpan Perubahan
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
