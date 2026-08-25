'use client'

// Dialog kirim TEMPLATE Meta dari inbox — dipakai saat window 24 jam kontak
// (sesi Cloud API) sudah tutup sehingga pesan bebas ditolak. Memuat template
// APPROVED dari WABA sesi kontak, input parameter, preview, lalu POST
// /api/inbox/[contactId]/send-template.
import { Loader2, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TemplateParamsFields, emptyParamsFor, paramsComplete } from '@/components/waba-templates/TemplateParamsFields'
import { TemplatePreview } from '@/components/waba-templates/TemplatePreview'
import { CATEGORY_LABEL, type TemplateSendParamsDto, type WabaTemplateDto } from '@/components/waba-templates/types'

import type { ChatMessage } from './types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  contactId: string
  contactName: string | null
  contactPhone: string
  /** Sesi Cloud yang akan dipakai (dari respons 409 send). */
  sessionId: string | null
  onSent: (message: ChatMessage) => void
}

export function SendTemplateDialog({ open, onOpenChange, contactId, contactName, contactPhone, sessionId, onSent }: Props) {
  const [templates, setTemplates] = useState<WabaTemplateDto[]>([])
  const [loading, setLoading] = useState(false)
  const [templateId, setTemplateId] = useState<string>('')
  const [params, setParams] = useState<TemplateSendParamsDto>({ body: [] })
  const [sending, setSending] = useState(false)

  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const t = window.setTimeout(() => {
      setLoading(true)
      const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}&status=APPROVED` : '?status=APPROVED'
      fetch(`/api/whatsapp/templates${qs}`)
        .then((r) => r.json() as Promise<{ success: boolean; data?: { templates: WabaTemplateDto[] }; error?: string }>)
        .then((json) => {
          if (cancelled) return
          if (!json.success || !json.data) {
            toast.error(json.error ?? 'Gagal memuat template')
            return
          }
          setTemplates(json.data.templates)
          const first = json.data.templates[0]
          if (first) {
            setTemplateId(first.id)
            setParams(emptyParamsFor(first))
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, sessionId, contactName])

  // Tidak ada auto-prefill nama: heuristik "variabel pertama = nama" salah
  // untuk template yang {{1}}-nya invoice/kode OTP — CS yang percaya prefill
  // bisa mengirim isi salah. Chip "Nama kontak" tersedia untuk sisip 1 klik.

  async function send() {
    if (!template) return
    if (!paramsComplete(template, params)) {
      toast.error('Lengkapi semua parameter dulu')
      return
    }
    setSending(true)
    try {
      const res = await fetch(`/api/inbox/${contactId}/send-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: template.id, params, ...(sessionId ? { sessionId } : {}) }),
      })
      const json = (await res.json()) as {
        success: boolean
        error?: string
        data?: ChatMessage & { chargedRp?: number }
      }
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'Gagal mengirim template')
        return
      }
      toast.success(
        json.data.chargedRp
          ? `Template terkirim · kredit terpotong Rp ${json.data.chargedRp.toLocaleString('id-ID')}` // hanya muncul bila billing kredit diaktifkan lagi
          : 'Template terkirim',
      )
      onSent(json.data)
      onOpenChange(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!sending ? onOpenChange(o) : undefined)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Kirim template ke {contactName ?? contactPhone}</DialogTitle>
          <DialogDescription>
            Window 24 jam Meta untuk kontak ini sudah tutup — pesan bebas tidak bisa dikirim. Pilih template yang
            sudah disetujui Meta. Biaya pesan resmi (bila ada) ditagih Meta langsung ke metode pembayaran di WhatsApp Manager.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Memuat template…
          </div>
        ) : templates.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            Belum ada template APPROVED untuk nomor ini. Buat/siapkan di menu <b>Template Meta</b> lalu tunggu review Meta.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Template</Label>
                <Select
                  value={templateId}
                  onValueChange={(v) => {
                    setTemplateId(v)
                    const t = templates.find((x) => x.id === v)
                    if (t) setParams(emptyParamsFor(t))
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} · {CATEGORY_LABEL[t.category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {template && (
                <TemplateParamsFields
                  template={template}
                  value={params}
                  onChange={setParams}
                  placeholders={[
                    { label: 'Nama kontak', value: contactName ?? '' },
                    { label: 'Nomor', value: contactPhone },
                  ].filter((p) => p.value)}
                />
              )}
            </div>
            {template && <TemplatePreview template={template} params={params} />}
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>Batal</Button>
          <Button onClick={send} disabled={sending || !template}>
            {sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}
            Kirim template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
