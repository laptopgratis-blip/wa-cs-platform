'use client'

// Panel "Template bawaan hulao" (starter pack follow-up + INFO_GENERIC):
// status per purposeKey + tombol siapkan (buat + submit yang belum ada).
import { CheckCircle2, Loader2, PackagePlus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

import { STATUS_LABEL, STATUS_TONE, type TemplateStatus } from './types'

interface StarterItem {
  purposeKey: string
  description: string
  name: string
  category: string
  templateId: string | null
  status: TemplateStatus | null
  rejectionReason: string | null
}

interface Props {
  sessionId: string
  /** Dipanggil setelah starter pack diproses (refresh daftar template). */
  onChanged?: () => void
}

export function StarterPackPanel({ sessionId, onChanged }: Props) {
  const [items, setItems] = useState<StarterItem[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/templates/starter-pack?sessionId=${encodeURIComponent(sessionId)}`)
      const json = (await res.json()) as { success: boolean; data?: { items: StarterItem[] } }
      if (json.success && json.data) setItems(json.data.items)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  async function run() {
    setRunning(true)
    try {
      const res = await fetch('/api/whatsapp/templates/starter-pack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const json = (await res.json()) as {
        success: boolean
        error?: string
        data?: { items: StarterItem[]; results: { purposeKey: string; status: string; error?: string }[] }
      }
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'Gagal menyiapkan template')
        return
      }
      setItems(json.data.items)
      const failed = json.data.results.filter((r) => r.error)
      if (failed.length) {
        toast.warning(`${json.data.results.length - failed.length} template dikirim ke Meta, ${failed.length} gagal: ${failed[0]?.error ?? ''}`)
      } else {
        toast.success('Template bawaan dikirim ke Meta — tunggu review (biasanya beberapa menit)')
      }
      onChanged?.()
    } finally {
      setRunning(false)
    }
  }

  const approved = items.filter((i) => i.status === 'APPROVED').length
  const missing = items.filter((i) => !i.status || i.status === 'DRAFT' || i.status === 'REJECTED' || i.status === 'DELETED').length

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <PackagePlus className="size-4 text-primary-500" /> Template bawaan hulao (follow-up & notifikasi)
            </CardTitle>
            <CardDescription className="text-xs">
              {items.length > 0 ? `${approved}/${items.length} disetujui` : loading ? 'Memuat…' : ''}
              {missing > 0 ? ` · ${missing} belum disiapkan/ditolak` : ''}. Sekali klik: hulao membuat & mengirim
              template standar (konfirmasi order, resi, pengingat bayar, dsb.) ke Meta untuk review.
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
              {open ? 'Sembunyikan' : 'Lihat daftar'}
            </Button>
            <Button size="sm" onClick={run} disabled={running}>
              {running ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 size-3.5" />}
              {missing > 0 ? 'Siapkan template' : 'Cek ulang'}
            </Button>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          <ul className="divide-y text-sm">
            {items.map((i) => (
              <li key={i.purposeKey} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.description}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {i.name} · {i.category}
                    {i.rejectionReason ? ` · ${i.rejectionReason}` : ''}
                  </p>
                </div>
                {i.status ? (
                  <StatusBadge tone={STATUS_TONE[i.status]} label={STATUS_LABEL[i.status]} icon={i.status === 'APPROVED' ? CheckCircle2 : undefined} />
                ) : (
                  <StatusBadge tone="neutral" label="Belum dibuat" />
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  )
}
