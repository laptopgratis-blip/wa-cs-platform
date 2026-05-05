'use client'

// Wrapper client untuk halaman /knowledge. List + Sheet untuk create/edit.
import {
  BookOpen,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Pencil,
  Plus,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { KnowledgeForm } from '@/components/knowledge/KnowledgeForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'

export type KnowledgeContentType = 'TEXT' | 'IMAGE' | 'FILE' | 'LINK'

export interface KnowledgeListItem {
  id: string
  title: string
  contentType: KnowledgeContentType
  textContent: string | null
  fileUrl: string | null
  linkUrl: string | null
  caption: string | null
  triggerKeywords: string[]
  isActive: boolean
  triggerCount: number
  lastTriggeredAt: string | null
}

interface KnowledgeListProps {
  items: KnowledgeListItem[]
  limit: number
}

const TYPE_META: Record<
  KnowledgeContentType,
  { icon: typeof FileText; label: string; emoji: string }
> = {
  TEXT: { icon: FileText, label: 'Teks', emoji: '📝' },
  IMAGE: { icon: ImageIcon, label: 'Gambar', emoji: '📷' },
  FILE: { icon: FileText, label: 'File', emoji: '📄' },
  LINK: { icon: LinkIcon, label: 'Link', emoji: '🔗' },
}

export function KnowledgeList({ items, limit }: KnowledgeListProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<KnowledgeListItem | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const isFull = items.length >= limit

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(item: KnowledgeListItem) {
    setEditing(item)
    setOpen(true)
  }

  async function toggleActive(item: KnowledgeListItem, next: boolean) {
    setTogglingId(item.id)
    try {
      const res = await fetch(`/api/knowledge/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Gagal mengubah status')
        return
      }
      toast.success(next ? 'Pengetahuan diaktifkan' : 'Pengetahuan dinonaktifkan')
      router.refresh()
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            Pengetahuan Bisnis
          </h1>
          <p className="mt-1 text-sm text-warm-500">
            Tambahkan info yang AI perlu tahu untuk jawab customer dengan akurat.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Terpakai {items.length} dari {limit} entry
          </p>
        </div>
        <Button
          onClick={openCreate}
          disabled={isFull}
          className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
        >
          <Plus className="mr-2 size-4" />
          Tambah Pengetahuan
        </Button>
      </div>

      {isFull && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Sudah mencapai batas {limit} entry. Hapus yang lama dulu kalau mau
          tambah baru.
        </div>
      )}

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <BookOpen className="size-10 text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">Belum ada pengetahuan</p>
              <p className="text-sm text-muted-foreground">
                Mulai dengan info yang sering ditanyakan customer — testimoni,
                FAQ, sertifikat, atau link katalog.
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" />
              Tambah Pengetahuan Pertama
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((it) => {
            const meta = TYPE_META[it.contentType] ?? TYPE_META.TEXT
            const lastTriggered = it.lastTriggeredAt
              ? new Date(it.lastTriggeredAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : null
            return (
              <Card
                key={it.id}
                className="rounded-xl border-warm-200 shadow-sm hover-lift"
              >
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span aria-hidden className="text-lg leading-none">
                          {meta.emoji}
                        </span>
                        <h3 className="truncate font-display font-bold text-warm-900 dark:text-warm-50">
                          {it.title}
                        </h3>
                        {!it.isActive && (
                          <Badge variant="outline" className="font-normal">
                            Off
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {meta.label}
                        {it.linkUrl ? ' · ' : ''}
                        {it.linkUrl && (
                          <a
                            href={it.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            {new URL(it.linkUrl).hostname}
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(it)}
                      aria-label="Edit pengetahuan"
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </div>

                  {(it.textContent || it.caption) && (
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {it.textContent ?? it.caption}
                    </p>
                  )}

                  {it.triggerKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {it.triggerKeywords.slice(0, 6).map((kw) => (
                        <Badge
                          key={kw}
                          variant="secondary"
                          className="font-normal"
                        >
                          {kw}
                        </Badge>
                      ))}
                      {it.triggerKeywords.length > 6 && (
                        <Badge variant="outline" className="font-normal">
                          +{it.triggerKeywords.length - 6}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                    <span>
                      Dipakai {it.triggerCount}×
                      {lastTriggered ? ` · terakhir ${lastTriggered}` : ''}
                    </span>
                    <Switch
                      checked={it.isActive}
                      disabled={togglingId === it.id}
                      onCheckedChange={(v) => toggleActive(it, v)}
                      aria-label="Aktif / Nonaktif"
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl px-6"
        >
          <SheetHeader className="px-0">
            <SheetTitle>
              {editing ? 'Edit Pengetahuan' : 'Tambah Pengetahuan'}
            </SheetTitle>
            <SheetDescription>
              AI akan pakai info ini untuk jawab customer saat kata kunci
              cocok.
            </SheetDescription>
          </SheetHeader>
          <KnowledgeForm
            initial={editing ?? undefined}
            onDone={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
