'use client'

// Slide-over panel detail kontak: edit nama/notes, ubah stage, kelola tag,
// lihat history pesan singkat.
import type { PipelineStage } from '@prisma/client'
import { Bot, Hand, Loader2, Tag, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { formatChatTime } from '@/lib/format-time'
import { PIPELINE_LABELS } from '@/lib/validations/contact'

import type { ContactDetail } from './types'

interface ContactDetailSheetProps {
  contactId: string | null
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

const STAGES: PipelineStage[] = [
  'NEW',
  'PROSPECT',
  'INTEREST',
  'NEGOTIATION',
  'CLOSED_WON',
  'CLOSED_LOST',
]

export function ContactDetailSheet({
  contactId,
  onOpenChange,
  onSaved,
}: ContactDetailSheetProps) {
  const [detail, setDetail] = useState<ContactDetail | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [isSaving, setSaving] = useState(false)

  // Form state — local copy supaya bisa diedit tanpa langsung commit.
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [stage, setStage] = useState<PipelineStage>('NEW')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')

  useEffect(() => {
    if (!contactId) {
      setDetail(null)
      return
    }
    let aborted = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/contacts/${contactId}`)
        const json = (await res.json()) as {
          success: boolean
          data?: ContactDetail
          error?: string
        }
        if (aborted) return
        if (!res.ok || !json.success || !json.data) {
          toast.error(json.error || 'Gagal memuat detail')
          return
        }
        const d = json.data
        setDetail(d)
        setName(d.name ?? '')
        setNotes(d.notes ?? '')
        setStage(d.pipelineStage)
        setTags(d.tags)
      } finally {
        if (!aborted) setLoading(false)
      }
    })()
    return () => {
      aborted = true
    }
  }, [contactId])

  function addTag() {
    const t = tagDraft.trim()
    if (!t) return
    if (tags.includes(t)) {
      setTagDraft('')
      return
    }
    setTags([...tags, t])
    setTagDraft('')
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t))
  }

  async function save() {
    if (!detail) return
    setSaving(true)
    try {
      const res = await fetch(`/api/contacts/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          notes: notes.trim() === '' ? null : notes.trim(),
          pipelineStage: stage,
          tags,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menyimpan')
        return
      }
      toast.success('Kontak diperbarui')
      onSaved()
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={Boolean(contactId)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col overflow-hidden sm:max-w-xl px-6"
      >
        <SheetHeader className="px-0">
          <SheetTitle>Detail Kontak</SheetTitle>
          <SheetDescription>
            Edit data kontak, ubah pipeline stage, kelola tag.
          </SheetDescription>
        </SheetHeader>

        {isLoading || !detail ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-5 animate-spin" />
            Memuat...
          </div>
        ) : (
          <ScrollArea className="-mx-6 flex-1">
            <div className="space-y-5 px-6 pb-6">
              <div className="flex items-center gap-3">
                <Avatar className="size-12">
                  {detail.avatar && (
                    <AvatarImage src={detail.avatar} alt={detail.name ?? ''} />
                  )}
                  <AvatarFallback>
                    {(detail.name || detail.phoneNumber).slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {detail.name || `+${detail.phoneNumber}`}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    +{detail.phoneNumber}
                  </p>
                </div>
                {detail.aiPaused ? (
                  <Badge variant="secondary" className="gap-1">
                    <Hand className="size-3" /> Manual
                  </Badge>
                ) : (
                  <Badge variant="default" className="gap-1">
                    <Bot className="size-3" /> AI
                  </Badge>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="contact-name">Nama</Label>
                <Input
                  id="contact-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama kontak"
                />
              </div>

              <div className="space-y-2">
                <Label>Pipeline Stage</Label>
                <Select value={stage} onValueChange={(v) => setStage(v as PipelineStage)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {PIPELINE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.length === 0 && (
                    <span className="text-xs text-muted-foreground">
                      Belum ada tag.
                    </span>
                  )}
                  {tags.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1 pr-1">
                      <Tag className="size-3" />
                      {t}
                      <button
                        type="button"
                        onClick={() => removeTag(t)}
                        className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                        aria-label={`Hapus tag ${t}`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Tambah tag..."
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addTag()
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addTag}>
                    Tambah
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact-notes">Catatan</Label>
                <Textarea
                  id="contact-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Catatan internal tentang kontak ini (tidak terlihat oleh customer)"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Pesan Terbaru</h3>
                {detail.messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Belum ada pesan.</p>
                ) : (
                  <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-xs">
                    {detail.messages.slice(-10).map((m) => (
                      <div key={m.id} className="flex gap-2">
                        <span className="shrink-0 text-muted-foreground">
                          {formatChatTime(m.createdAt)}
                        </span>
                        <span className="font-medium">
                          {m.role === 'USER' ? 'Customer' : m.role === 'AI' ? 'AI' : 'CS'}:
                        </span>
                        <span className="line-clamp-2 flex-1">{m.content}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        <div className="flex justify-end gap-2 border-t bg-background py-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
          <Button onClick={save} disabled={!detail || isSaving}>
            {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Simpan
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
