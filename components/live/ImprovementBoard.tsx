'use client'

import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, Sparkles, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

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
  room: { id: string; name: string; systemPrompt: string; greeting: string | null }
  proposals: Proposal[]
}

const TARGET_LABEL: Record<TargetAsset, string> = {
  SYSTEM_PROMPT: 'Persona host',
  GREETING: 'Greeting',
  REBUTTAL_NOTE: 'Catatan rebuttal',
}

const STATUS_BADGE: Record<Status, { label: string; cls: string }> = {
  PENDING: { label: 'Menunggu approve', cls: 'bg-amber-100 text-amber-700' },
  APPROVED: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700' },
  APPLIED: { label: 'Aktif', cls: 'bg-emerald-200 text-emerald-800' },
  REJECTED: { label: 'Ditolak', cls: 'bg-red-100 text-red-700' },
  ROLLED_BACK: { label: 'Di-rollback', cls: 'bg-warm-100 text-warm-700' },
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

  async function decide(propId: string, action: 'approve' | 'reject' | 'rollback') {
    setActing(propId)
    try {
      const res = await fetch(
        `/api/live-rooms/${roomId}/proposals/${propId}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        },
      )
      const json = (await res.json()) as { success: boolean; error?: string }
      if (json.success) {
        toast.success(
          action === 'approve' ? 'Applied' : action === 'reject' ? 'Ditolak' : 'Rolled back',
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
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Kembali ke Leads
        </Link>
        <PageHeader
          title={`Optimasi AI — ${data.room.name}`}
          description="AI analisa pattern win/lost + objection → usulkan perbaikan persona / greeting. Anda approve atau tolak. Snapshot before disimpan supaya bisa rollback kalau hasil tidak bagus."
          actions={
            <Button onClick={generate} disabled={generating}>
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Minta Usul Baru
            </Button>
          }
        />
      </div>

      {/* PENDING */}
      {pending.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700">
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
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
                  ? () => setPendingDecision({ propId: p.id, action: 'rollback' })
                  : undefined
              }
            />
          ))}
        </section>
      ) : null}

      {/* OTHERS */}
      {others.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-600">
            History ({others.length})
          </h2>
          {others.slice(0, 10).map((p) => (
            <ProposalCard key={p.id} prop={p} currentValue={null} acting={false} />
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
        variant={pendingDecision?.action === 'approve' ? 'default' : 'destructive'}
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
  const badge = STATUS_BADGE[prop.status]
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={badge.cls}>{badge.label}</Badge>
              <Badge variant="outline">{TARGET_LABEL[prop.targetAsset]}</Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(prop.createdAt).toLocaleString('id-ID', { dateStyle: 'short' })}
              </span>
            </div>
            <h3 className="mt-1.5 text-base font-medium">{prop.title}</h3>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">{prop.rationale}</div>

        <div className="rounded-md border bg-warm-50 p-3 text-sm whitespace-pre-wrap">
          {prop.proposalText}
        </div>

        {currentValue !== null && currentValue !== prop.proposalText ? (
          <details className="text-xs">
            <summary
              className="cursor-pointer text-muted-foreground"
              onClick={() => setShowDiff((s) => !s)}
            >
              Lihat versi sekarang
            </summary>
            <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-2 whitespace-pre-wrap">
              {currentValue || '(kosong)'}
            </div>
          </details>
        ) : null}

        {prop.evidenceSessionIds.length > 0 ? (
          <div className="text-xs text-muted-foreground">
            <strong>Evidence sessions:</strong>{' '}
            {prop.evidenceSessionIds.map((s) => s.slice(-6)).join(', ')}
          </div>
        ) : null}

        {prop.decidedNote ? (
          <div className="text-xs text-muted-foreground italic">
            Catatan: {prop.decidedNote}
          </div>
        ) : null}

        {(onApprove || onReject || onRollback) && !acting ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {onApprove ? (
              <Button size="sm" onClick={onApprove}>
                <CheckCircle2 className="mr-1 h-4 w-4" /> Approve & Apply
              </Button>
            ) : null}
            {onReject ? (
              <Button size="sm" variant="outline" onClick={onReject}>
                <XCircle className="mr-1 h-4 w-4" /> Tolak
              </Button>
            ) : null}
            {onRollback ? (
              <Button size="sm" variant="outline" onClick={onRollback}>
                <RotateCcw className="mr-1 h-4 w-4" /> Rollback ke sebelumnya
              </Button>
            ) : null}
          </div>
        ) : null}
        {acting ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Memproses…
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
