'use client'

// VersionsDialog — list versi LP, restore action.
import { History, Loader2, Sparkles, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { TONES, type Tone } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface Version {
  id: string
  source: string
  scoreSnapshot: number | null
  note: string | null
  createdAt: string
  optimizationId: string | null
}

const SOURCE_LABEL: Record<string, string> = {
  ai: 'AI Optimization',
  manual: 'Manual Save',
  restore: 'Restore Action',
}

// Sumber versi (enum) → tone registry lib/ui-tones.ts.
const SOURCE_TONE: Record<string, Tone> = {
  ai: 'brand',
  manual: 'neutral',
  restore: 'warning',
}

interface Props {
  lpId: string
  onRestored?: () => void
}

export function VersionsDialog({ lpId, onRestored }: Props) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<Version[]>([])
  const [loading, setLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch(`/api/lp/${encodeURIComponent(lpId)}/versions`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setVersions(j.data.versions)
        else toast.error(j.error ?? 'Gagal load versi')
      })
      .catch(() => toast.error('Network error'))
      .finally(() => setLoading(false))
  }, [open, lpId])

  async function handleRestore(versionId: string) {
    if (
      !confirm(
        'Restore versi ini akan replace HTML LP saat ini. State sekarang akan di-snapshot dulu — bisa di-restore lagi nanti. Lanjutkan?',
      )
    )
      return
    setRestoringId(versionId)
    try {
      const res = await fetch(
        `/api/lp/${encodeURIComponent(lpId)}/versions/${encodeURIComponent(versionId)}/restore`,
        { method: 'POST' },
      )
      const j = await res.json()
      if (!j.success) {
        toast.error(j.error ?? 'Gagal restore')
        return
      }
      toast.success(
        'LP berhasil di-restore. State sebelumnya tersimpan di Riwayat.',
      )
      setOpen(false)
      onRestored?.()
    } catch {
      toast.error('Network error')
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <History className="mr-1.5 size-4" /> Riwayat Versi
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Riwayat Versi LP</DialogTitle>
          <DialogDescription>
            Setiap apply AI optimization atau restore akan snapshot HTML lama di
            sini. Maks 20 versi terakhir per LP.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="text-warm-500 flex items-center justify-center py-8">
            <Loader2 className="mr-2 size-4 animate-spin" /> Memuat…
          </div>
        )}

        {!loading && versions.length === 0 && (
          <div className="text-warm-500 rounded-lg border border-dashed p-8 text-center text-sm">
            Belum ada versi tersimpan. Apply AI optimization atau restore versi
            akan create snapshot di sini.
          </div>
        )}

        {!loading && versions.length > 0 && (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li
                key={v.id}
                className="border-warm-200 flex items-start gap-3 rounded-lg border p-3"
              >
                <div className="bg-warm-100 text-warm-600 mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg">
                  {v.source === 'ai' ? (
                    <Sparkles className={cn('size-4', TONES.brand.text)} />
                  ) : v.source === 'restore' ? (
                    <RotateCcw className={cn('size-4', TONES.warning.text)} />
                  ) : (
                    <History className="size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <StatusBadge
                      tone={SOURCE_TONE[v.source] ?? 'neutral'}
                      label={SOURCE_LABEL[v.source] ?? v.source}
                    />
                    <span className="text-warm-500 text-xs">
                      {new Date(v.createdAt).toLocaleString('id-ID', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  {v.note && (
                    <p className="text-warm-700 mt-1 text-xs">{v.note}</p>
                  )}
                  {v.scoreSnapshot != null && (
                    <p className="text-warm-500 mt-0.5 text-xs">
                      Score snapshot: <strong>{v.scoreSnapshot}</strong>/100
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRestore(v.id)}
                  disabled={restoringId !== null}
                  className="shrink-0"
                >
                  {restoringId === v.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <>
                      <RotateCcw className="mr-1 size-3" /> Restore
                    </>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
