'use client'

import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, MessageCircle, RefreshCw, ThumbsDown, ThumbsUp, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Lead {
  id: string
  customerName: string
  customerPhone: string
  productInterest: string | null
  status: 'NEW' | 'HANDOFF_SENT' | 'HANDOFF_FAILED' | 'CLOSED_WON' | 'CLOSED_LOST'
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

const STATUS_BADGE: Record<Lead['status'], { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  NEW: { label: 'Baru', cls: 'bg-sky-100 text-sky-700', icon: MessageCircle },
  HANDOFF_SENT: {
    label: 'Handoff WA ✓',
    cls: 'bg-emerald-100 text-emerald-700',
    icon: CheckCircle2,
  },
  HANDOFF_FAILED: {
    label: 'Handoff WA gagal',
    cls: 'bg-red-100 text-red-700',
    icon: XCircle,
  },
  CLOSED_WON: { label: 'Closed Won', cls: 'bg-emerald-200 text-emerald-800', icon: CheckCircle2 },
  CLOSED_LOST: { label: 'Closed Lost', cls: 'bg-warm-100 text-warm-600', icon: XCircle },
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

  async function markOutcome(leadId: string, status: 'CLOSED_WON' | 'CLOSED_LOST') {
    setMarking(leadId)
    try {
      const res = await fetch(`/api/live-rooms/${roomId}/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (json.success) {
        toast.success(status === 'CLOSED_WON' ? 'Mark sebagai Won' : 'Mark sebagai Lost')
        await fetchData()
      } else {
        toast.error(json.error ?? 'Gagal mark')
      }
    } finally {
      setMarking(null)
    }
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/live-rooms"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" /> Live Rooms
          </Link>
          <h1 className="text-2xl font-semibold">Leads — {data.room.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">/live/{data.room.slug}</span>
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void fetchData()} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Sessions</div>
            <div className="mt-1 text-2xl font-semibold">{data.stats.totalSessions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Leads</div>
            <div className="mt-1 text-2xl font-semibold">{data.stats.totalLeads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Conversion</div>
            <div className="mt-1 text-2xl font-semibold">{data.stats.conversionRate}%</div>
          </CardContent>
        </Card>
      </div>

      {data.leads.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Belum ada lead masuk untuk room ini.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {data.leads.map((l) => {
            const badge = STATUS_BADGE[l.status]
            const Icon = badge.icon
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
                        <h3 className="truncate text-base font-medium">{l.customerName}</h3>
                        <Badge className={badge.cls}>
                          <Icon className="mr-1 h-3 w-3" />
                          {badge.label}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="font-mono">{l.customerPhone}</span>
                        {l.productInterest ? (
                          <span>Minat: <strong>{l.productInterest}</strong></span>
                        ) : null}
                        <span>{l.messageCount} pesan</span>
                        <span>{l.productClicks} klik produk</span>
                        <span>{date}</span>
                      </div>
                      {l.handoffError ? (
                        <div className="mt-2 text-xs text-red-600">
                          ⚠ WA gagal: {l.handoffError}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-col gap-1">
                      {l.contactId ? (
                        <Link href={`/contacts/${l.contactId}`}>
                          <Button size="sm" variant="outline">
                            <ExternalLink className="mr-1 h-3 w-3" /> Buka chat WA
                          </Button>
                        </Link>
                      ) : null}
                      <a
                        href={`https://wa.me/${l.customerPhone.replace(/^\+/, '')}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Button size="sm" variant="outline">
                          <MessageCircle className="mr-1 h-3 w-3" /> wa.me
                        </Button>
                      </a>
                    </div>
                  </div>

                  {/* Outcome tracking */}
                  {l.status !== 'CLOSED_WON' && l.status !== 'CLOSED_LOST' ? (
                    <div className="flex items-center gap-2 border-t pt-2">
                      <span className="text-xs text-muted-foreground">Status order:</span>
                      {marking === l.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => markOutcome(l.id, 'CLOSED_WON')}
                          >
                            <ThumbsUp className="mr-1 h-3.5 w-3.5" /> Closing
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-warm-700 hover:bg-warm-100"
                            onClick={() => markOutcome(l.id, 'CLOSED_LOST')}
                          >
                            <ThumbsDown className="mr-1 h-3.5 w-3.5" /> Gagal
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
