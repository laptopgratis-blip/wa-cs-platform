'use client'

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageCircle,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { liveLeadStatusMeta, statusMeta } from '@/lib/status'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface Lead {
  id: string
  customerName: string
  customerPhone: string
  productInterest: string | null
  status:
    'NEW' | 'HANDOFF_SENT' | 'HANDOFF_FAILED' | 'CLOSED_WON' | 'CLOSED_LOST'
  contactId: string | null
  handoffError: string | null
  createdAt: string
  messageCount: number
  productClicks: number
  sessionStartedAt: string
}

interface Stats {
  totalSessions: number
  totalLeads: number
  conversionRate: number
}

interface Response {
  room: { id: string; name: string; slug: string }
  stats: Stats
  leads: Lead[]
}

// Ikon per status — label & tone-nya dari registry lib/status.ts.
const STATUS_ICON: Record<Lead['status'], typeof CheckCircle2> = {
  NEW: MessageCircle,
  HANDOFF_SENT: CheckCircle2,
  HANDOFF_FAILED: XCircle,
  CLOSED_WON: CheckCircle2,
  CLOSED_LOST: XCircle,
}

export function LiveLeadsList({ roomId }: { roomId: string }) {
  const [data, setData] = useState<Response | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [marking, setMarking] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch(`/api/live-rooms/${roomId}/leads`)
      const json = (await res.json()) as { success: boolean; data?: Response }
      if (json.success && json.data) setData(json.data)
    } finally {
      setRefreshing(false)
    }
  }, [roomId])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  async function markOutcome(
    leadId: string,
    status: 'CLOSED_WON' | 'CLOSED_LOST',
  ) {
    setMarking(leadId)
    try {
      const res = await fetch(`/api/live-rooms/${roomId}/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (json.success) {
        toast.success(
          status === 'CLOSED_WON' ? 'Mark sebagai Won' : 'Mark sebagai Lost',
        )
        await fetchData()
      } else {
        toast.error(json.error ?? 'Gagal mark')
      }
    } finally {
      setMarking(null)
    }
  }

  if (!data) {
    return <CardGridSkeleton count={4} />
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/live-rooms"
          className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-xs"
        >
          <ArrowLeft className="size-3" /> Live Rooms
        </Link>
        <PageHeader
          title={`Leads — ${data.room.name}`}
          description={
            <span className="font-mono">/live/{data.room.slug}</span>
          }
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchData()}
              disabled={refreshing}
            >
              <RefreshCw
                className={`mr-2 size-3.5 ${refreshing ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
          }
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-muted-foreground text-xs uppercase">
              Sessions
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {data.stats.totalSessions}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-muted-foreground text-xs uppercase">Leads</div>
            <div className="mt-1 text-2xl font-semibold">
              {data.stats.totalLeads}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-muted-foreground text-xs uppercase">
              Conversion
            </div>
            <div className="mt-1 text-2xl font-semibold">
              {data.stats.conversionRate}%
            </div>
          </CardContent>
        </Card>
      </div>

      {data.leads.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={MessageCircle}
              title="Belum ada lead masuk"
              description="Lead muncul otomatis begitu penonton ninggalin kontak di live room ini."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.leads.map((l) => {
            const badge = statusMeta(liveLeadStatusMeta, l.status)
            const date = new Date(l.createdAt).toLocaleString('id-ID', {
              dateStyle: 'short',
              timeStyle: 'short',
            })
            return (
              <Card key={l.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-medium">
                          {l.customerName}
                        </h3>
                        <StatusBadge
                          tone={badge.tone}
                          label={badge.label}
                          icon={STATUS_ICON[l.status]}
                        />
                      </div>
                      <div className="text-muted-foreground mt-1 flex flex-wrap gap-3 text-xs">
                        <span className="font-mono">{l.customerPhone}</span>
                        {l.productInterest ? (
                          <span>
                            Minat: <strong>{l.productInterest}</strong>
                          </span>
                        ) : null}
                        <span>{l.messageCount} pesan</span>
                        <span>{l.productClicks} klik produk</span>
                        <span>{date}</span>
                      </div>
                      {l.handoffError ? (
                        <div
                          className={cn(
                            'mt-2 flex items-center gap-1 text-xs',
                            TONES.danger.text,
                          )}
                        >
                          <AlertTriangle
                            className="size-3 shrink-0"
                            aria-hidden
                          />
                          WA gagal: {l.handoffError}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1">
                      {l.contactId ? (
                        <Link href={`/contacts/${l.contactId}`}>
                          <Button size="sm" variant="outline">
                            <ExternalLink className="mr-1 size-3" /> Buka chat
                            WA
                          </Button>
                        </Link>
                      ) : null}
                      <a
                        href={`https://wa.me/${l.customerPhone.replace(/^\+/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button size="sm" variant="outline">
                          <MessageCircle className="mr-1 size-3" /> wa.me
                        </Button>
                      </a>
                    </div>
                  </div>

                  {/* Outcome tracking */}
                  {l.status !== 'CLOSED_WON' && l.status !== 'CLOSED_LOST' ? (
                    <div className="flex items-center gap-2 border-t pt-2">
                      <span className="text-muted-foreground text-xs">
                        Status order:
                      </span>
                      {marking === l.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className={cn('h-7', TONES.success.text)}
                            onClick={() => markOutcome(l.id, 'CLOSED_WON')}
                          >
                            <ThumbsUp className="mr-1 size-3.5" /> Closing
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-warm-700 hover:bg-warm-100 h-7"
                            onClick={() => markOutcome(l.id, 'CLOSED_LOST')}
                          >
                            <ThumbsDown className="mr-1 size-3.5" /> Gagal
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
