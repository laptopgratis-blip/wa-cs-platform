'use client'

// Halaman /broadcast: form di atas + list broadcast.
// Auto-poll tiap 4 detik kalau ada broadcast SENDING supaya progress live.
import { Megaphone } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { BroadcastCard } from './BroadcastCard'
import { BroadcastForm } from './BroadcastForm'
import type { BroadcastListItem, SessionOption } from './types'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent } from '@/components/ui/card'

interface BroadcastViewProps {
  initialBroadcasts: BroadcastListItem[]
  sessions: SessionOption[]
  availableTags: string[]
}

export function BroadcastView({
  initialBroadcasts,
  sessions,
  availableTags,
}: BroadcastViewProps) {
  const [broadcasts, setBroadcasts] = useState(initialBroadcasts)

  const refresh = useCallback(async () => {
    const res = await fetch('/api/broadcast')
    const json = (await res.json()) as {
      success: boolean
      data?: BroadcastListItem[]
    }
    if (json.success && json.data) setBroadcasts(json.data)
  }, [])

  // Polling — hanya aktif kalau ada broadcast yang sedang SENDING.
  useEffect(() => {
    const hasActive = broadcasts.some((b) => b.status === 'SENDING')
    if (!hasActive) return
    const interval = setInterval(() => {
      void refresh()
    }, 4000)
    return () => clearInterval(interval)
  }, [broadcasts, refresh])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Broadcast"
        description="Kirim pesan massal ke segmen kontak — pilih by tag atau pipeline stage."
      />

      <BroadcastForm
        sessions={sessions}
        availableTags={availableTags}
        onCreated={refresh}
      />

      <div>
        <h2 className="font-display text-warm-900 mb-3 text-xl font-semibold">
          Broadcast Saya
        </h2>
        {broadcasts.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                icon={Megaphone}
                title="Belum ada broadcast"
                description="Bikin yang pertama lewat form di atas — pilih segmen, tulis pesan, kirim."
              />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {broadcasts.map((b) => (
              <BroadcastCard key={b.id} broadcast={b} onChanged={refresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
