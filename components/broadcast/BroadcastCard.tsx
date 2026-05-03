'use client'

// Card per broadcast: status, progress, action.
import type { BroadcastStatus } from '@prisma/client'
import {
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  Send,
  XCircle,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatRelativeTime } from '@/lib/format-time'
import { PIPELINE_LABELS } from '@/lib/validations/contact'

import type { BroadcastListItem } from './types'

interface BroadcastCardProps {
  broadcast: BroadcastListItem
  onChanged: () => void
}

const statusBadge: Record<
  BroadcastStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  DRAFT: { label: 'Draft', variant: 'outline' },
  SCHEDULED: { label: 'Terjadwal', variant: 'secondary' },
  SENDING: { label: 'Mengirim', variant: 'default' },
  COMPLETED: { label: 'Selesai', variant: 'default' },
  FAILED: { label: 'Gagal', variant: 'destructive' },
  CANCELLED: { label: 'Dibatalkan', variant: 'outline' },
}

export function BroadcastCard({ broadcast, onChanged }: BroadcastCardProps) {
  const [isStarting, setStarting] = useState(false)
  const [isCancelling, setCancelling] = useState(false)

  const total = broadcast.totalTargets
  const done = broadcast.totalSent + broadcast.totalFailed
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100))
  const badge = statusBadge[broadcast.status]
  const canStart = broadcast.status === 'DRAFT' || broadcast.status === 'SCHEDULED'
  const canCancel =
    broadcast.status === 'DRAFT' ||
    broadcast.status === 'SCHEDULED' ||
    broadcast.status === 'SENDING'

  async function start() {
    setStarting(true)
    try {
      const res = await fetch(`/api/broadcast/${broadcast.id}/send`, {
        method: 'POST',
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menjalankan broadcast')
        return
      }
      toast.success('Broadcast dimulai')
      onChanged()
    } finally {
      setStarting(false)
    }
  }

  async function cancel() {
    if (!confirm('Yakin batalkan broadcast ini?')) return
    setCancelling(true)
    try {
      const res = await fetch(`/api/broadcast/${broadcast.id}`, {
        method: 'DELETE',
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal membatalkan')
        return
      }
      toast.success('Broadcast dibatalkan')
      onChanged()
    } finally {
      setCancelling(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-base">{broadcast.name}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            via{' '}
            {broadcast.waSession?.displayName ||
              `+${broadcast.waSession?.phoneNumber ?? '?'}`}{' '}
            · dibuat {formatRelativeTime(broadcast.createdAt)}
          </p>
        </div>
        <Badge variant={badge.variant} className="gap-1">
          {broadcast.status === 'SENDING' && <Loader2 className="size-3 animate-spin" />}
          {broadcast.status === 'COMPLETED' && <CheckCircle2 className="size-3" />}
          {broadcast.status === 'CANCELLED' && <XCircle className="size-3" />}
          {broadcast.status === 'SCHEDULED' && <Clock className="size-3" />}
          {badge.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="line-clamp-2 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
          {broadcast.message}
        </p>

        <div className="flex flex-wrap gap-1">
          {broadcast.targetTags.map((t) => (
            <Badge key={`tag-${t}`} variant="secondary" className="font-normal">
              #{t}
            </Badge>
          ))}
          {broadcast.targetStages.map((s) => (
            <Badge key={`stage-${s}`} variant="outline" className="font-normal">
              {PIPELINE_LABELS[s]}
            </Badge>
          ))}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {broadcast.totalSent} terkirim
              {broadcast.totalFailed > 0 && ` · ${broadcast.totalFailed} gagal`}
            </span>
            <span className="font-medium">
              {done} / {total}
            </span>
          </div>
          <Progress value={percent} />
        </div>

        {broadcast.scheduledAt && broadcast.status === 'SCHEDULED' && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" /> Terjadwal{' '}
            {new Date(broadcast.scheduledAt).toLocaleString('id-ID')}
          </p>
        )}

        <div className="flex gap-2">
          {canStart && (
            <Button
              size="sm"
              onClick={start}
              disabled={isStarting || isCancelling}
              className="flex-1"
            >
              {isStarting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : broadcast.status === 'SCHEDULED' ? (
                <Send className="mr-2 size-4" />
              ) : (
                <Play className="mr-2 size-4" />
              )}
              {broadcast.status === 'SCHEDULED' ? 'Kirim Sekarang' : 'Mulai'}
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              onClick={cancel}
              disabled={isCancelling || isStarting}
              className={canStart ? '' : 'flex-1'}
            >
              {isCancelling ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <XCircle className="mr-2 size-4" />
              )}
              Batalkan
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
