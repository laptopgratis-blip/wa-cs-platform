'use client'

// Card per broadcast: status, progress, action.
import type { BroadcastStatus } from '@prisma/client'
import {
  BadgeCheck,
  CheckCircle2,
  Clock,
  Loader2,
  PauseCircle,
  Play,
  Send,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { formatRelativeTime } from '@/lib/format-time'
import { broadcastStatusMeta, statusMeta } from '@/lib/status'
import { PIPELINE_LABELS } from '@/lib/validations/contact'

import type { BroadcastListItem } from './types'

interface BroadcastCardProps {
  broadcast: BroadcastListItem
  onChanged: () => void
}

// Ikon pelengkap per status — tone/label datang dari registry lib/status.ts.
const STATUS_ICON: Partial<Record<BroadcastStatus, LucideIcon>> = {
  COMPLETED: CheckCircle2,
  CANCELLED: XCircle,
  SCHEDULED: Clock,
  PAUSED: PauseCircle,
}

const CATEGORY_LABEL: Record<string, string> = {
  MARKETING: 'Marketing',
  UTILITY: 'Utility',
  AUTHENTICATION: 'OTP',
}

export function BroadcastCard({ broadcast, onChanged }: BroadcastCardProps) {
  const [isStarting, setStarting] = useState(false)
  const [isCancelling, setCancelling] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const isCloud = broadcast.provider === 'CLOUD_API'
  const total = broadcast.totalTargets
  const done =
    broadcast.totalSent +
    broadcast.totalFailed +
    (isCloud ? broadcast.totalSkipped : 0)
  const percent =
    total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100))
  const badge = statusMeta(broadcastStatusMeta, broadcast.status)
  const canStart =
    broadcast.status === 'DRAFT' ||
    broadcast.status === 'SCHEDULED' ||
    (isCloud && broadcast.status === 'PAUSED')
  const canCancel =
    broadcast.status === 'DRAFT' ||
    broadcast.status === 'SCHEDULED' ||
    broadcast.status === 'SENDING' ||
    broadcast.status === 'PAUSED'

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
      toast.success(
        broadcast.status === 'PAUSED'
          ? 'Broadcast dilanjutkan'
          : 'Broadcast dimulai',
      )
      onChanged()
    } finally {
      setStarting(false)
    }
  }

  async function cancel() {
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
      setConfirmOpen(false)
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
          <p className="text-muted-foreground mt-1 text-xs">
            via{' '}
            {broadcast.waSession?.displayName ||
              `+${broadcast.waSession?.phoneNumber ?? '?'}`}{' '}
            · dibuat {formatRelativeTime(broadcast.createdAt)}
          </p>
        </div>
        <StatusBadge
          tone={badge.tone}
          label={badge.label}
          icon={STATUS_ICON[broadcast.status]}
          pulse={broadcast.status === 'SENDING'}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {isCloud && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <StatusBadge tone="success" icon={BadgeCheck} label="Cloud API" />
            {broadcast.template && (
              <Badge variant="secondary" className="font-normal">
                {broadcast.template.name} ·{' '}
                {CATEGORY_LABEL[broadcast.template.category] ??
                  broadcast.template.category}
              </Badge>
            )}
            {(broadcast.chargedCreditRp > 0 ||
              broadcast.estimatedCreditRp > 0) && (
              <span className="text-muted-foreground">
                Kredit: Rp {broadcast.chargedCreditRp.toLocaleString('id-ID')}
                {broadcast.status !== 'COMPLETED' &&
                broadcast.estimatedCreditRp > 0
                  ? ` / est. Rp ${broadcast.estimatedCreditRp.toLocaleString('id-ID')}`
                  : ''}
              </span>
            )}
          </div>
        )}
        <p className="bg-muted/30 text-muted-foreground line-clamp-2 rounded-md border p-2 text-xs">
          {broadcast.message}
        </p>
        {broadcast.status === 'PAUSED' && broadcast.pausedReason && (
          <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-2 text-xs">
            Dijeda: {broadcast.pausedReason}
          </p>
        )}

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
              {isCloud &&
                broadcast.totalDelivered > 0 &&
                ` · ${broadcast.totalDelivered} sampai`}
              {isCloud &&
                broadcast.totalRead > 0 &&
                ` · ${broadcast.totalRead} dibaca`}
              {broadcast.totalFailed > 0 && ` · ${broadcast.totalFailed} gagal`}
              {isCloud &&
                broadcast.totalSkipped > 0 &&
                ` · ${broadcast.totalSkipped} dilewati`}
            </span>
            <span className="font-medium">
              {done} / {total}
            </span>
          </div>
          <Progress value={percent} />
        </div>

        {broadcast.scheduledAt && broadcast.status === 'SCHEDULED' && (
          <p className="text-muted-foreground flex items-center gap-1 text-xs">
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
              {broadcast.status === 'SCHEDULED'
                ? 'Kirim Sekarang'
                : broadcast.status === 'PAUSED'
                  ? 'Lanjutkan'
                  : 'Mulai'}
            </Button>
          )}
          {canCancel && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmOpen(true)}
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

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!o) setConfirmOpen(false)
        }}
        title="Batalkan broadcast?"
        description={
          <>
            Yakin ingin membatalkan broadcast <strong>{broadcast.name}</strong>?
            Tindakan ini tidak bisa dibatalkan.
          </>
        }
        confirmLabel="Ya, Batalkan"
        isLoading={isCancelling}
        onConfirm={cancel}
      />
    </Card>
  )
}
