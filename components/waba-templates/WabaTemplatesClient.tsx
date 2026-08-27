'use client'

// Halaman /whatsapp/templates — kelola template Meta per nomor Cloud API:
// pilih sesi, filter status/kategori, sinkron dari Meta, buat/edit/submit/
// uji/hapus template, dan panel starter pack.
import {
  Eye,
  LayoutTemplate,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

import { StarterPackPanel } from './StarterPackPanel'
import { TemplateEditorDialog } from './TemplateEditorDialog'
import { TemplatePreview } from './TemplatePreview'
import { TemplateTestSendDialog } from './TemplateTestSendDialog'
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  sessionLabel,
  type CloudSessionOption,
  type TemplateCategory,
  type TemplateStatus,
  type WabaTemplateDto,
} from './types'

interface Props {
  sessions: CloudSessionOption[]
  initialSessionId: string | null
}

const EDITABLE: TemplateStatus[] = ['DRAFT', 'APPROVED', 'REJECTED', 'PAUSED']

export function WabaTemplatesClient({ sessions, initialSessionId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [sessionId, setSessionId] = useState<string>(initialSessionId ?? sessions[0]?.id ?? '')
  const [templates, setTemplates] = useState<WabaTemplateDto[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'ALL' | TemplateStatus>('ALL')
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | TemplateCategory>('ALL')

  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<WabaTemplateDto | null>(null)
  const [preview, setPreview] = useState<WabaTemplateDto | null>(null)
  const [testTarget, setTestTarget] = useState<WabaTemplateDto | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WabaTemplateDto | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const session = sessions.find((s) => s.id === sessionId) ?? null

  const load = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(`/api/whatsapp/templates?sessionId=${encodeURIComponent(sessionId)}`)
      const json = (await res.json()) as { success: boolean; data?: { templates: WabaTemplateDto[] }; error?: string }
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'Gagal memuat template')
        return
      }
      setTemplates(json.data.templates)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load])

  // Sinkron pilihan sesi ke URL (?session=) supaya link dari kartu sesi bekerja.
  useEffect(() => {
    if (!sessionId || searchParams.get('session') === sessionId) return
    const t = window.setTimeout(() => router.replace(`/whatsapp/templates?session=${sessionId}`), 0)
    return () => window.clearTimeout(t)
  }, [sessionId, searchParams, router])

  const filtered = useMemo(
    () =>
      templates.filter(
        (t) =>
          (statusFilter === 'ALL' || t.status === statusFilter) &&
          (categoryFilter === 'ALL' || t.category === categoryFilter),
      ),
    [templates, statusFilter, categoryFilter],
  )

  async function sync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/whatsapp/templates/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
      const json = (await res.json()) as {
        success: boolean
        error?: string
        data?: { created: number; updated: number; markedDeleted: number }
      }
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'Sinkronisasi gagal')
        return
      }
      toast.success(`Sinkron selesai: ${json.data.created} baru, ${json.data.updated} diperbarui, ${json.data.markedDeleted} dihapus di Meta`)
      void load()
    } finally {
      setSyncing(false)
    }
  }

  async function submit(t: WabaTemplateDto) {
    setBusyId(t.id)
    try {
      const res = await fetch(`/api/whatsapp/templates/${t.id}/submit`, { method: 'POST' })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!json.success) {
        toast.error(json.error ?? 'Submit gagal')
        return
      }
      toast.success('Dikirim ke Meta — menunggu review')
      void load()
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    try {
      const res = await fetch(`/api/whatsapp/templates/${deleteTarget.id}`, { method: 'DELETE' })
      const json = (await res.json()) as { success: boolean; error?: string; data?: { soft: boolean } }
      if (!json.success) {
        toast.error(json.error ?? 'Gagal menghapus')
        return
      }
      toast.success(json.data?.soft ? 'Template ditandai dihapus (masih dirujuk riwayat)' : 'Template dihapus')
      setDeleteTarget(null)
      void load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-5">
        <PageHeader
          icon={LayoutTemplate}
          title="Template Meta"
          description="Template pesan untuk nomor WhatsApp resmi (Cloud API). Wajib disetujui Meta sebelum dipakai untuk broadcast, follow-up, dan pesan di luar window 24 jam."
          actions={
            <>
              <Button variant="outline" onClick={sync} disabled={syncing || !sessionId}>
                {syncing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <RefreshCw className="mr-2 size-4" />}
                Sinkron dari Meta
              </Button>
              <Button onClick={() => { setEditing(null); setEditorOpen(true) }} disabled={!sessionId}>
                <Plus className="mr-2 size-4" /> Buat Template
              </Button>
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <Select value={sessionId} onValueChange={(v) => { setSessionId(v); setLoading(true) }}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Pilih nomor Cloud API" /></SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>{sessionLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua status</SelectItem>
              {(Object.keys(STATUS_LABEL) as TemplateStatus[]).filter((s) => s !== 'DELETED').map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua kategori</SelectItem>
              {(Object.keys(CATEGORY_LABEL) as TemplateCategory[]).map((c) => (
                <SelectItem key={c} value={c}>{CATEGORY_LABEL[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {session?.wabaId && <span className="text-xs text-muted-foreground">WABA {session.wabaId}</span>}
        </div>

        {sessionId && <StarterPackPanel sessionId={sessionId} onChanged={load} />}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Memuat template…</div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <EmptyState
                icon={LayoutTemplate}
                title={templates.length === 0 ? 'Belum ada template' : 'Tidak ada yang cocok filter'}
                description={
                  templates.length === 0
                    ? 'Buat template baru, siapkan template bawaan hulao, atau sinkron dari Meta bila template sudah dibuat di WhatsApp Manager.'
                    : 'Ubah filter status/kategori.'
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((t) => (
              <Card key={t.id} className="flex flex-col">
                <CardContent className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold" title={t.name}>{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.language} · {CATEGORY_LABEL[t.category]}
                        {t.purposeKey ? ' · bawaan hulao' : ''}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label="Aksi" disabled={busyId === t.id}>
                          {busyId === t.id ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setPreview(t)}><Eye className="mr-2 size-4" /> Preview</DropdownMenuItem>
                        {EDITABLE.includes(t.status) && (
                          <DropdownMenuItem onClick={() => { setEditing(t); setEditorOpen(true) }}>
                            <Pencil className="mr-2 size-4" /> Edit
                          </DropdownMenuItem>
                        )}
                        {(t.status === 'DRAFT' || t.status === 'REJECTED') && (
                          <DropdownMenuItem onClick={() => submit(t)}><Upload className="mr-2 size-4" /> Submit ke Meta</DropdownMenuItem>
                        )}
                        {t.status === 'APPROVED' && (
                          <DropdownMenuItem onClick={() => setTestTarget(t)}><Send className="mr-2 size-4" /> Kirim uji</DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(t)}>
                          <Trash2 className="mr-2 size-4" /> Hapus
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <p className="line-clamp-3 text-sm text-warm-700">
                    {t.category === 'AUTHENTICATION' ? '(Kode OTP — body dibuat Meta)' : t.bodyText}
                  </p>

                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                    {t.rejectionReason && (t.status === 'REJECTED' || t.status === 'PAUSED' || t.status === 'DISABLED') ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span><StatusBadge tone={STATUS_TONE[t.status]} label={STATUS_LABEL[t.status]} /></span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">{t.rejectionReason}</TooltipContent>
                      </Tooltip>
                    ) : (
                      <StatusBadge tone={STATUS_TONE[t.status]} label={STATUS_LABEL[t.status]} />
                    )}
                    {t.qualityScore && t.qualityScore !== 'UNKNOWN' && (
                      <Badge variant="outline" className="text-xs">Kualitas {t.qualityScore}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {sessionId && (
          <TemplateEditorDialog
            open={editorOpen}
            onOpenChange={setEditorOpen}
            sessionId={sessionId}
            template={editing}
            onSaved={load}
          />
        )}

        <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Preview: {preview?.name}</DialogTitle></DialogHeader>
            {preview && <TemplatePreview template={preview} />}
          </DialogContent>
        </Dialog>

        <TemplateTestSendDialog open={Boolean(testTarget)} onOpenChange={(o) => !o && setTestTarget(null)} template={testTarget} />

        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          title="Hapus template ini?"
          description={
            <>
              Template <strong>{deleteTarget?.name}</strong> akan dihapus di Meta dan hulao. Nama yang sama
              baru bisa dipakai lagi setelah 30 hari (aturan Meta).
            </>
          }
          isLoading={busyId === deleteTarget?.id}
          onConfirm={confirmDelete}
        />
      </div>
    </TooltipProvider>
  )
}
