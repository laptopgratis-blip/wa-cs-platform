'use client'

// Dialog kirim uji satu template ke satu nomor. Memotong Kredit Pesan
// sungguhan (sesuai kategori) — diberi tahu di dialog.
import { Loader2, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { TemplateParamsFields, emptyParamsFor, paramsComplete } from './TemplateParamsFields'
import { TemplatePreview } from './TemplatePreview'
import { CATEGORY_LABEL, type TemplateSendParamsDto, type WabaTemplateDto } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: WabaTemplateDto | null
}

export function TemplateTestSendDialog({ open, onOpenChange, template }: Props) {
  const [to, setTo] = useState('')
  const [params, setParams] = useState<TemplateSendParamsDto>({ body: [] })
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open || !template) return
    const t = window.setTimeout(() => {
      setParams(emptyParamsFor(template))
    }, 0)
    return () => window.clearTimeout(t)
  }, [open, template])

  if (!template) return null

  async function send() {
    if (!template) return
    const phone = to.replace(/\D/g, '')
    if (phone.length < 8) {
      toast.error('Nomor tujuan tidak valid (pakai format 62812…)')
      return
    }
    if (!paramsComplete(template, params)) {
      toast.error('Lengkapi semua parameter dulu')
      return
    }
    setSending(true)
    try {
      const res = await fetch(`/api/whatsapp/templates/${template.id}/test-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, params }),
      })
      const json = (await res.json()) as { success: boolean; error?: string; data?: { chargedRp: number; messageId: string | null } }
      if (!json.success) {
        toast.error(json.error ?? 'Gagal mengirim')
        return
      }
      toast.success(
        // chargedRp hanya terisi bila billing kredit diaktifkan lagi.
        `Terkirim ke ${phone}${json.data?.chargedRp ? ` · kredit terpotong Rp ${json.data.chargedRp.toLocaleString('id-ID')}` : ''}`,
      )
      onOpenChange(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!sending ? onOpenChange(o) : undefined)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Kirim uji: {template.name}</DialogTitle>
          <DialogDescription>
            Kategori {CATEGORY_LABEL[template.category]}. Pengiriman uji memakai nomor resmi sungguhan —
            biaya pesan (bila ada) ditagih Meta langsung ke metode pembayaran di WhatsApp Manager.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="test-to">Nomor tujuan (62…)</Label>
              <Input id="test-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="6281234567890" inputMode="tel" />
            </div>
            <TemplateParamsFields template={template} value={params} onChange={setParams} />
          </div>
          <TemplatePreview template={template} params={params} />
        </div>
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Batal</Button>
          <Button onClick={send} disabled={sending}>
            {sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
            Kirim uji
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
