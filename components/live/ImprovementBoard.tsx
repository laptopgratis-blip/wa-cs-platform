'use client'

import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Sparkles,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { liveProposalStatusMeta, statusMeta } from '@/lib/status'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

type TargetAsset = 'SYSTEM_PROMPT' | 'GREETING' | 'REBUTTAL_NOTE'
type Status = 'PENDING' | 'APPROVED' | 'APPLIED' | 'REJECTED' | 'ROLLED_BACK'

interface Proposal {
  id: string
  targetAsset: TargetAsset
  title: string
  proposalText: string
  rationale: string
  evidenceSessionIds: string[]
  status: Status
  createdAt: string
  decidedAt: string | null
  appliedAt: string | null
  beforeSnapshot: string | null
  decidedNote: string | null
}

interface Response {
  room: {
    id: string
    name: string
    systemPrompt: string
    greeting: string | null
  }
  proposals: Proposal[]
}

const TARGET_LABEL: Record<TargetAsset, string> = {
  SYSTEM_PROMPT: 'Persona host',
  GREETING: 'Greeting',
  REBUTTAL_NOTE: 'Catatan rebuttal',
}

export function ImprovementBoard({ roomId }: { roomId: string }) {
  const [data, setData] = useState<Response | null>(null)
  const [generating, setGenerating] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  // Konfirmasi keputusan proposal — pengganti window.confirm().
  const [pendingDecision, setPendingDecision] = useState<{
    propId: string
    action: 'approve' | 'reject' | 'rollback'
  } | null>(null)

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/live-rooms/${roomId}/proposals`)
    const json = (await res.json()) as { success: boolean; data?: Response }
    if (json.success && json.data) setData(json.data)
  }, [roomId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/live-rooms/${roomId}/proposals`, {
        method: 'POST',
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { created: number; skipped?: string }
        error?: string
      }
      if (json.success && json.data) {
        if (json.data.created > 0) {
          toast.success(`${json.data.created} proposal baru dibuat.`)
        } else {
          toast.info(json.data.skipped ?? 'Tidak ada proposal baru.')
        }
        await fetchData()
      } else {
        toast.error(json.error ?? 'Gagal generate')
      }
    } finally {
      setGenerating(false)
    }
  }

  async function decide(
    propId: string,
    action: 'approve' | 'reject' | 'rollback',
  ) {
    setActing(propId)
    try {
      const res = await fetch(`/api/live-rooms/${roomId}/proposals/${propId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (json.success) {
        toast.success(
          action === 'approve'
            ? 'Applied'
            : action === 'reject'
              ? 'Ditolak'
              : 'Rolled back',
        )
        await fetchData()
      } else {
        toast.error(json.error ?? 'Gagal')
      }
    } finally {
      setActing(null)
    }
  }

  if (!data) {
    return <CardGridSkeleton count={4} />
  }

  const pending = data.proposals.filter((p) => p.status === 'PENDING')
  const applied = data.proposals.filter((p) => p.status === 'APPLIED')
  const others = data.proposals.filter(
    (p) => p.status !== 'PENDING' && p.status !== 'APPLIED',
  )

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/live-rooms/${roomId}/leads`}
          className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeft className="size-3" /> Kembali ke Leads
        </Link>
        <PageHeader
          title={`Optimasi AI — ${data.room.name}`}
          description="AI analisa pattern win/lost + objection → usulkan perbaikan persona / greeting. Anda approve atau tolak. Snapshot before disimpan supaya bisa rollback kalau hasil tidak bagus."
          actions={
            <Button onClick={generate} disabled={generating}>
              {generating ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-4" />
              )}
              Minta Usul Baru
            </Button>
          }
        />
      </div>

      {/* PENDING */}
      {pending.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-warm-900 text-xl font-semibold">
            Menunggu keputusan ({pending.length})
          </h2>
          {pending.map((p) => (
            <ProposalCard
              key={p.id}
              prop={p}
              currentValue={
                p.targetAsset === 'SYSTEM_PROMPT'
                  ? data.room.systemPrompt
                  : p.targetAsset === 'GREETING'
                    ? data.room.greeting
                    : null
              }
              acting={acting === p.id}
              onApprove={() =>
                setPendingDecision({ propId: p.id, action: 'approve' })
              }
              onReject={() =>
                setPendingDecision({ propId: p.id, action: 'reject' })
              }
            />
          ))}
        </section>
      ) : null}

      {/* APPLIED */}
      {applied.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-warm-900 text-xl font-semibold">
            Sedang aktif ({applied.length})
          </h2>
          {applied.map((p) => (
            <ProposalCard
              key={p.id}
              prop={p}
              currentValue={
                p.targetAsset === 'SYSTEM_PROMPT'
                  ? data.room.systemPrompt
                  : p.targetAsset === 'GREETING'
                    ? data.room.greeting
                    : null
              }
              acting={acting === p.id}
              onRollback={
                p.targetAsset !== 'REBUTTAL_NOTE'
                  ? () =>
                      setPendingDecision({ propId: p.id, action: 'rollback' })
                  : undefined
              }
            />
          ))}
        </section>
      ) : null}

      {/* OTHERS */}
      {others.length > 0 ? (
        <section className="space-y-3">
          <h2 className="font-display text-warm-900 text-xl font-semibold">
            History ({others.length})
          </h2>
          {others.slice(0, 10).map((p) => (
            <ProposalCard
              key={p.id}
              prop={p}
              currentValue={null}
              acting={false}
            />
          ))}
        </section>
      ) : null}

      {data.proposals.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Sparkles}
              title="Belum ada proposal"
              description="Klik Minta Usul Baru — AI akan analisa session dengan outcome WIN/LOST/OPEN dan usulkan 1-3 perbaikan."
            />
          </CardContent>
        </Card>
      ) : null}

      <ConfirmDialog
        open={pendingDecision !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDecision(null)
        }}
        title={
          pendingDecision?.action === 'approve'
            ? 'Apply proposal ini sekarang?'
            : pendingDecision?.action === 'reject'
              ? 'Tolak proposal ini?'
              : 'Rollback ke nilai sebelumnya?'
        }
        description={
          pendingDecision?.action === 'approve'
            ? 'Field LiveRoom akan langsung diganti (snapshot before disimpan untuk rollback).'
            : pendingDecision?.action === 'reject'
              ? 'Proposal ditandai ditolak dan tidak diterapkan.'
              : 'Field akan dikembalikan ke snapshot sebelum proposal diterapkan.'
        }
        confirmLabel={
          pendingDecision?.action === 'approve'
            ? 'Ya, Apply'
            : pendingDecision?.action === 'reject'
              ? 'Ya, Tolak'
              : 'Ya, Rollback'
        }
        variant={
          pendingDecision?.action === 'approve' ? 'default' : 'destructive'
        }
        onConfirm={() => {
          if (!pendingDecision) return
          const { propId, action } = pendingDecision
          setPendingDecision(null)
          void decide(propId, action)
        }}
      />
    </div>
  )
}

function ProposalCard({
  prop,
  currentValue,
  acting,
  onApprove,
  onReject,
  onRollback,
}: {
  prop: Proposal
  currentValue: string | null
  acting: boolean
  onApprove?: () => void
  onReject?: () => void
  onRollback?: () => void
}) {
  const [showDiff, setShowDiff] = useState(false)
  const badge = statusMeta(liveProposalStatusMeta, prop.status)
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={badge.tone} label={badge.label} />
              <Badge variant="outline">{TARGET_LABEL[prop.targetAsset]}</Badge>
              <span className="text-muted-foreground text-xs">
                {new Date(prop.createdAt).toLocaleString('id-ID', {
                  dateStyle: 'short',
                })}
              </span>
            </div>
            <h3 className="mt-1.5 text-base font-medium">{prop.title}</h3>
          </div>
        </div>

        <div className="text-muted-foreground text-sm">{prop.rationale}</div>

        <div className="bg-warm-50 rounded-md border p-3 text-sm whitespace-pre-wrap">
          {prop.proposalText}
        </div>

        {currentValue !== null && currentValue !== prop.proposalText ? (
          <details className="text-xs">
            <summary
              className="text-muted-foreground cursor-pointer"
              onClick={() => setShowDiff((s) => !s)}
            >
              Lihat versi sekarang
            </summary>
            <div
              className={cn(
                'mt-2 rounded-md border p-2 whitespace-pre-wrap',
                TONES.danger.bg,
                TONES.danger.border,
              )}
            >
              {currentValue || '(kosong)'}
            </div>
          </details>
        ) : null}

        {prop.evidenceSessionIds.length > 0 ? (
          <div className="text-muted-foreground text-xs">
            <strong>Evidence sessions:</strong>{' '}
            {prop.evidenceSessionIds.map((s) => s.slice(-6)).join(', ')}
          </div>
        ) : null}

        {prop.decidedNote ? (
          <div className="text-muted-foreground text-xs italic">
            Catatan: {prop.decidedNote}
          </div>
        ) : null}

        {(onApprove || onReject || onRollback) && !acting ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {onApprove ? (
              <Button size="sm" onClick={onApprove}>
                <CheckCircle2 className="mr-1 size-4" /> Approve & Apply
              </Button>
            ) : null}
            {onReject ? (
              <Button size="sm" variant="outline" onClick={onReject}>
                <XCircle className="mr-1 size-4" /> Tolak
              </Button>
            ) : null}
            {onRollback ? (
              <Button size="sm" variant="outline" onClick={onRollback}>
                <RotateCcw className="mr-1 size-4" /> Rollback ke sebelumnya
              </Button>
            ) : null}
          </div>
        ) : null}
        {acting ? (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <Loader2 className="size-3 animate-spin" /> Memproses…
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
