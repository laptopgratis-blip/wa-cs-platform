'use client'

// Status sinkronisasi coexistence (kontak & riwayat dari HP) di kartu sesi.
// Poll tiap 5 dtk selama masih REQUESTED/IN_PROGRESS (maks 30 menit).

import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

export type CoexStatus =
  'REQUESTED' | 'IN_PROGRESS' | 'DONE' | 'DECLINED' | 'SKIPPED' | 'ERROR' | null

export interface CoexSyncSnapshot {
  contact: { status: CoexStatus; count: number }
  history: { status: CoexStatus; progress: number; count: number }
  error: string | null
  requestedAt: string | null
}

interface Props {
  sessionId: string
  initial: CoexSyncSnapshot
}

const POLL_MS = 5_000
const POLL_MAX_MS = 30 * 60 * 1000

function isActive(s: CoexSyncSnapshot): boolean {
  const a = s.contact.status
  const b = s.history.status
  return (
    a === 'REQUESTED' ||
    a === 'IN_PROGRESS' ||
    b === 'REQUESTED' ||
    b === 'IN_PROGRESS'
  )
}

function label(
  kind: 'kontak' | 'riwayat',
  status: CoexStatus,
  count: number,
  progress?: number,
): string {
  switch (status) {
    case 'REQUESTED':
      return `${kind} diminta…`
    case 'IN_PROGRESS':
      return kind === 'riwayat'
        ? `riwayat ${progress ?? 0}%`
        : `${kind} berjalan…`
    case 'DONE':
      return `${kind} selesai (${count})`
    case 'DECLINED':
      return `${kind}: ditolak dari HP`
    case 'SKIPPED':
      return `${kind}: lewat jendela 24 jam`
    case 'ERROR':
      return `${kind}: gagal`
    default:
      return `${kind}: belum`
  }
}

export function CoexSyncStatus({ sessionId, initial }: Props) {
  const [snap, setSnap] = useState<CoexSyncSnapshot>(initial)
  const [isStarting, setStarting] = useState(false)

  useEffect(() => {
    if (!isActive(snap)) return
    const started = Date.now()
    const timer = window.setInterval(async () => {
      if (Date.now() - started > POLL_MAX_MS) {
        window.clearInterval(timer)
        return
      }
      try {
        const res = await fetch(`/api/whatsapp/${sessionId}/coex-sync`, {
          cache: 'no-store',
        })
        const json = (await res.json().catch(() => null)) as {
          success?: boolean
          data?: CoexSyncSnapshot
        } | null
        if (json?.success && json.data) setSnap(json.data)
      } catch {
        // abaikan — coba lagi tick berikutnya
      }
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [sessionId, snap])

  async function start() {
    setStarting(true)
    try {
      const res = await fetch(`/api/whatsapp/${sessionId}/coex-sync`, {
        method: 'POST',
      })
      const json = (await res.json().catch(() => null)) as {
        success?: boolean
        data?: CoexSyncSnapshot
        error?: string
      } | null
      if (!json?.success || !json.data) {
        toast.error(json?.error || 'Gagal memulai sinkronisasi')
        return
      }
      setSnap(json.data)
      toast.success('Sinkronisasi diminta ke Meta')
    } finally {
      setStarting(false)
    }
  }

  const active = isActive(snap)
  const anyProblem = [snap.contact.status, snap.history.status].some(
    (s) => s === 'ERROR' || s === 'SKIPPED' || s === 'DECLINED',
  )
  const canStart =
    !active &&
    [snap.contact.status, snap.history.status].some(
      (s) => s === null || s === 'ERROR' || s === 'SKIPPED',
    )
  const showProgress = snap.history.status === 'IN_PROGRESS'

  return (
    <div className="border-warm-200 bg-warm-50/60 rounded-lg border px-2.5 py-2 text-xs">
      <div className="flex items-center gap-1.5">
        {active ? (
          <Loader2 className="text-primary-500 size-3.5 animate-spin" />
        ) : anyProblem ? (
          <AlertCircle className={cn('size-3.5', TONES.warning.text)} />
        ) : (
          <CheckCircle2 className={cn('size-3.5', TONES.success.text)} />
        )}
        <span className="text-muted-foreground">Sinkronisasi dari HP:</span>
        <span className="font-medium">
          {label('kontak', snap.contact.status, snap.contact.count)} ·{' '}
          {label(
            'riwayat',
            snap.history.status,
            snap.history.count,
            snap.history.progress,
          )}
        </span>
        {snap.error && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Detail"
                  className={cn(
                    'ml-auto underline underline-offset-2',
                    TONES.warning.text,
                  )}
                >
                  detail
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">
                {snap.error}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {showProgress && (
        <Progress value={snap.history.progress} className="mt-1.5 h-1.5" />
      )}
      {canStart && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7 text-xs"
          onClick={start}
          disabled={isStarting}
        >
          {isStarting ? (
            <Loader2 className="mr-1 size-3 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 size-3" />
          )}
          Mulai sinkronisasi
        </Button>
      )}
    </div>
  )
}
