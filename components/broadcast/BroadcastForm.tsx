'use client'

// Form buat broadcast: pilih WA session, pesan dengan {nama}/{nomor}, target
// (tags & stages), jadwal. Live preview jumlah penerima.
import type { PipelineStage } from '@prisma/client'
import { Calendar, Loader2, Send, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { PIPELINE_LABELS } from '@/lib/validations/contact'

import type { SessionOption } from './types'

interface BroadcastFormProps {
  sessions: SessionOption[]
  availableTags: string[]
  onCreated: () => void
}

const STAGES: PipelineStage[] = [
  'NEW',
  'PROSPECT',
  'INTEREST',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
]

export function BroadcastForm({
  sessions,
  availableTags,
  onCreated,
}: BroadcastFormProps) {
  const [name, setName] = useState('')
  const [waSessionId, setWaSessionId] = useState<string>(sessions[0]?.id ?? '')
  const [message, setMessage] = useState(
    'Halo {nama}, ada promo spesial buat kamu hari ini! Klik untuk info lebih lanjut.',
  )
  const [tags, setTags] = useState<string[]>([])
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [scheduleNow, setScheduleNow] = useState(true)
  const [scheduledAt, setScheduledAt] = useState('')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [isPreviewing, setPreviewing] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const formValid = useMemo(
    () =>
      name.trim().length >= 2 &&
      Boolean(waSessionId) &&
      message.trim().length > 0 &&
      (tags.length > 0 || stages.length > 0),
    [name, waSessionId, message, tags, stages],
  )

  // Preview jumlah penerima — debounced 400ms.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!waSessionId || (tags.length === 0 && stages.length === 0)) {
      setPreviewCount(null)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setPreviewing(true)
      try {
        const params = new URLSearchParams({ waSessionId })
        if (tags.length > 0) params.set('tags', tags.join(','))
        if (stages.length > 0) params.set('stages', stages.join(','))
        const res = await fetch(`/api/broadcast/preview?${params}`)
        const json = (await res.json()) as {
          success: boolean
          data?: { count: number }
        }
        if (json.success && json.data) setPreviewCount(json.data.count)
      } finally {
        setPreviewing(false)
      }
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [waSessionId, tags, stages])

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }
  function toggleStage(s: PipelineStage) {
    setStages((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]))
  }

  async function submit() {
    setSubmitting(true)
    try {
      const body = {
        name: name.trim(),
        waSessionId,
        message: message.trim(),
        targetTags: tags,
        targetStages: stages,
        scheduledAt:
          !scheduleNow && scheduledAt
            ? new Date(scheduledAt).toISOString()
            : null,
      }
      const res = await fetch('/api/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json()) as {
        success: boolean
        error?: string
        data?: { id: string }
      }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal membuat broadcast')
        return
      }
      toast.success('Broadcast dibuat')
      onCreated()
      // Reset form
      setName('')
      setMessage(
        'Halo {nama}, ada promo spesial buat kamu hari ini! Klik untuk info lebih lanjut.',
      )
      setTags([])
      setStages([])
      setScheduleNow(true)
      setScheduledAt('')
    } finally {
      setSubmitting(false)
    }
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-md border bg-muted/40 p-6 text-sm text-muted-foreground">
        Hubungkan minimal satu WhatsApp di menu <strong>WhatsApp</strong> dulu sebelum
        bikin broadcast.
      </div>
    )
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h3 className="font-semibold">Buat Broadcast Baru</h3>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="bc-name">Nama Broadcast</Label>
          <Input
            id="bc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Misalnya: Promo Lebaran 2026"
          />
        </div>
        <div className="space-y-2">
          <Label>Kirim dari WhatsApp</Label>
          <Select value={waSessionId} onValueChange={setWaSessionId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.displayName || `+${s.phoneNumber ?? '???'}`}
                  {s.status !== 'CONNECTED' && ' (offline)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bc-msg">Pesan</Label>
        <Textarea
          id="bc-msg"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tulis pesan broadcast..."
        />
        <p className="text-xs text-muted-foreground">
          Variabel yang bisa dipakai: <code>{'{nama}'}</code> (nama kontak) dan{' '}
          <code>{'{nomor}'}</code> (nomor kontak).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Target — Tags</Label>
          {availableTags.length === 0 ? (
            <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              Belum ada kontak yang punya tag. Tambahkan tag di halaman Contacts.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 rounded-md border p-3">
              {availableTags.map((t) => (
                <label
                  key={t}
                  className="flex cursor-pointer items-center gap-1.5 text-sm"
                >
                  <Checkbox
                    checked={tags.includes(t)}
                    onCheckedChange={() => toggleTag(t)}
                  />
                  {t}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Target — Pipeline Stage</Label>
          <div className="flex flex-wrap gap-2 rounded-md border p-3">
            {STAGES.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <Checkbox
                  checked={stages.includes(s)}
                  onCheckedChange={() => toggleStage(s)}
                />
                {PIPELINE_LABELS[s]}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <span>Akan dikirim ke</span>
          <strong>
            {isPreviewing ? '...' : previewCount === null ? '—' : `${previewCount} kontak`}
          </strong>
        </div>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="bc-now"
            checked={scheduleNow}
            onCheckedChange={(v) => setScheduleNow(Boolean(v))}
          />
          <Label htmlFor="bc-now" className="cursor-pointer">
            Kirim sekarang (langsung jalan setelah klik tombol)
          </Label>
        </div>
        {!scheduleNow && (
          <div className="space-y-1">
            <Label htmlFor="bc-sched" className="flex items-center gap-1 text-xs">
              <Calendar className="size-3" /> Jadwalkan
            </Label>
            <Input
              id="bc-sched"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
        )}
      </div>

      <Button onClick={submit} disabled={!formValid || isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="mr-2 size-4 animate-spin" />
        ) : (
          <Send className="mr-2 size-4" />
        )}
        {scheduleNow ? 'Buat & Kirim' : 'Jadwalkan'}
      </Button>
    </div>
  )
}
