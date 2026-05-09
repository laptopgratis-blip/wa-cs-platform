'use client'

// VersionsDialog — list versi LP, restore action.
import { History, Loader2, Sparkles, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

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

const SOURCE_COLOR: Record<string, string> = {
  ai: 'bg-purple-100 text-purple-800',
  manual: 'bg-blue-100 text-blue-800',
  restore: 'bg-amber-100 text-amber-800',
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
      toast.success('LP berhasil di-restore. State sebelumnya tersimpan di Riwayat.')
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
            Setiap apply AI optimization atau restore akan snapshot HTML lama
            di sini. Maks 20 versi terakhir per LP.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8 text-warm-500">
            <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
          </div>
        )}

        {!loading && versions.length === 0 && (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-warm-500">
            Belum ada versi tersimpan. Apply AI optimization atau restore versi
            akan create snapshot di sini.
          </div>
        )}

        {!loading && versions.length > 0 && (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex items-start gap-3 rounded-lg border border-warm-200 p-3"
              >
                <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg bg-warm-100 text-warm-600">
                  {v.source === 'ai' ? (
                    <Sparkles className="size-4 text-purple-600" />
                  ) : v.source === 'restore' ? (
                    <RotateCcw className="size-4 text-amber-600" />
                  ) : (
                    <History className="size-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Badge
                      className={`${SOURCE_COLOR[v.source] ?? 'bg-warm-100'} text-xs`}
                    >
                      {SOURCE_LABEL[v.source] ?? v.source}
                    </Badge>
                    <span className="text-[11px] text-warm-500">
                      {new Date(v.createdAt).toLocaleString('id-ID', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  {v.note && (
                    <p className="mt-1 text-xs text-warm-700">{v.note}</p>
                  )}
                  {v.scoreSnapshot != null && (
                    <p className="mt-0.5 text-[11px] text-warm-500">
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
