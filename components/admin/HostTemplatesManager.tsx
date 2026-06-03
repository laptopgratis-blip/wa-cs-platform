'use client'

// CS Live AI Host Templates manager — shared antara admin & user.
// Create flow pakai OrchestratedHostWizard (Claude generate prompts dari
// opsi terstruktur). Komponen ini handle list + status polling + tombol
// video + delete.
import { Loader2, Plus, Trash2, Image as ImageIcon, AlertTriangle, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { HostModePicker, type HostMode } from './HostModePicker'
import { OrchestratedHostWizard } from './OrchestratedHostWizard'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface HostTemplate {
  id: string
  name: string
  visualStyle: string | null
  promptImage?: string
  promptVideo?: string
  refImageUrls?: string[]
  sourceImageUrl: string | null
  videoLoopUrl: string | null
  videoSeconds: number | null
  status:
    | 'DRAFT'
    | 'GENERATING_IMAGE'
    | 'IMAGE_READY'
    | 'GENERATING_VIDEO'
    | 'READY'
    | 'FAILED'
    | 'REJECTED'
  isPublic: boolean
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_BADGE: Record<HostTemplate['status'], { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-warm-100 text-warm-700' },
  GENERATING_IMAGE: { label: 'Generate gambar…', cls: 'bg-amber-100 text-amber-700' },
  IMAGE_READY: { label: 'Gambar siap', cls: 'bg-sky-100 text-sky-700' },
  GENERATING_VIDEO: { label: 'Generate video…', cls: 'bg-amber-100 text-amber-700' },
  READY: { label: 'Siap pakai', cls: 'bg-emerald-100 text-emerald-700' },
  FAILED: { label: 'Gagal', cls: 'bg-red-100 text-red-700' },
  REJECTED: { label: 'Ditolak', cls: 'bg-red-100 text-red-700' },
}

const POLL_MS = 3_000

export interface HostTemplatesManagerProps {
  // Endpoint dasar — admin: '/api/admin/host-templates', user: '/api/host-templates/me'.
  apiListBase: string
  apiItemBase: string // base untuk /[id], /upload
  apiUploadPath: string
  // Path frontend untuk klik kartu → detail scene. Admin: '/admin/host-templates',
  // user: '/host-templates'.
  detailHrefBase: string
  title: string
  subtitle: string
}

export function HostTemplatesManager({
  apiListBase,
  apiItemBase,
  apiUploadPath,
  detailHrefBase,
  title,
  subtitle,
}: HostTemplatesManagerProps) {
  const [rows, setRows] = useState<HostTemplate[] | null>(null)
  // Flow: showModePicker → user pilih mode → set selectedMode →
  //   selectedMode dilewatkan ke OrchestratedHostWizard sebagai prop `mode`.
  //   Wizard sama persis untuk dua mode; cuma flag mode beda di create payload.
  //   Setelah create, Klip Live mode redirect ke /host-templates/[id]/clips
  //   (Sprint 2 page) untuk vision analyze + generate klip.
  const [showModePicker, setShowModePicker] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedMode, setSelectedMode] = useState<HostMode>('TTS_GENERATIVE')
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchRows = useCallback(async () => {
    const res = await fetch(apiListBase)
    const json = (await res.json()) as { success: boolean; data?: HostTemplate[] }
    if (json.success && json.data) setRows(json.data)
  }, [apiListBase])

  useEffect(() => {
    void fetchRows()
  }, [fetchRows])

  // Polling kalau ada row yang masih generating
  useEffect(() => {
    const generating = (rows ?? []).some(
      (r) => r.status === 'GENERATING_IMAGE' || r.status === 'GENERATING_VIDEO',
    )
    if (!generating) {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      return
    }
    if (!pollTimer.current) {
      pollTimer.current = setInterval(() => {
        void fetchRows()
      }, POLL_MS)
    }
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    }
  }, [rows, fetchRows])

  async function deleteTemplate(id: string) {
    if (!confirm('Hapus template ini? Hanya record DB; file MP4/PNG tetap di disk.')) return
    const res = await fetch(`${apiItemBase}/${id}`, { method: 'DELETE' })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (json.success) {
      toast.success('Template dihapus')
      void fetchRows()
    } else {
      toast.error(json.error ?? 'Gagal hapus')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button onClick={() => setShowModePicker(true)}>
          <Plus className="mr-2 h-4 w-4" /> Bikin Host Baru
        </Button>
      </div>

      {rows === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Belum ada host template. Klik <strong>Bikin Host Baru</strong> untuk
            mulai.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rows.map((row) => (
            <HostCard
              key={row.id}
              row={row}
              detailHref={`${detailHrefBase}/${row.id}`}
              onDelete={deleteTemplate}
            />
          ))}
        </div>
      )}

      {showModePicker ? (
        <HostModePicker
          klipLiveDisabled={false}
          onClose={() => setShowModePicker(false)}
          onSelect={(mode: HostMode) => {
            setShowModePicker(false)
            setSelectedMode(mode)
            setShowCreate(true)
          }}
        />
      ) : null}

      {showCreate ? (
        <OrchestratedHostWizard
          mode={selectedMode}
          apiOrchestrate="/api/host-templates/orchestrate"
          apiCreate={apiListBase}
          apiUpload={apiUploadPath}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            void fetchRows()
            // Klip Live: arahkan owner ke /host-templates next step
            // (vision analyze + generate klip).
            if (selectedMode === 'NATIVE_LIBRARY') {
              toast.info('Host dibuat. Begitu gambar ready, buka detail host → tab Klip Live untuk generate klip.')
            }
          }}
        />
      ) : null}
    </div>
  )
}

function HostCard({
  row,
  detailHref,
  onDelete,
}: {
  row: HostTemplate
  detailHref: string
  onDelete: (id: string) => void
}) {
  const badge = STATUS_BADGE[row.status]
  const clickable =
    row.status === 'IMAGE_READY' || row.status === 'READY' || row.sourceImageUrl
  return (
    <Card className="overflow-hidden">
      <Link
        href={detailHref}
        className={`block ${clickable ? 'cursor-pointer hover:opacity-95' : 'cursor-default'}`}
      >
        <div className="aspect-[9/16] bg-warm-100 relative flex items-center justify-center">
          {row.videoLoopUrl ? (
            <video
              src={row.videoLoopUrl}
              className="h-full w-full object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
          ) : row.sourceImageUrl ? (
            <img
              src={row.sourceImageUrl}
              alt={row.name}
              className="h-full w-full object-cover"
            />
          ) : row.status === 'GENERATING_IMAGE' ? (
            <div className="flex flex-col items-center gap-2 text-warm-500">
              <Loader2 className="h-8 w-8 animate-spin" />
              <span className="text-xs">Generate gambar…</span>
            </div>
          ) : (
            <ImageIcon className="h-10 w-10 text-warm-300" />
          )}
          <Badge className={`absolute top-2 right-2 ${badge.cls}`}>{badge.label}</Badge>
        </div>
      </Link>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={detailHref}
            className="min-w-0 flex-1 group block"
          >
            <div className="flex items-center gap-1 truncate text-sm font-medium group-hover:text-orange-600">
              {row.name}
              <ChevronRight className="h-3 w-3 opacity-50" />
            </div>
            {row.visualStyle ? (
              <div className="truncate text-xs text-muted-foreground">{row.visualStyle}</div>
            ) : null}
          </Link>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(row.id)}
            title="Hapus"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {row.errorMessage ? (
          <div className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span className="break-all">{row.errorMessage}</span>
          </div>
        ) : null}

        {row.status === 'IMAGE_READY' || row.status === 'READY' ? (
          <Link href={detailHref}>
            <Button size="sm" variant="outline" className="w-full">
              Kelola scenes <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </Link>
        ) : null}
      </CardContent>
    </Card>
  )
}

