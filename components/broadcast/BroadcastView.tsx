'use client'

// Halaman /broadcast: form di atas + list broadcast.
// Auto-poll tiap 4 detik kalau ada broadcast SENDING supaya progress live.
import { Megaphone } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { BroadcastCard } from './BroadcastCard'
import { BroadcastForm } from './BroadcastForm'
import type { BroadcastListItem, SessionOption } from './types'
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
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Broadcast
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Kirim pesan massal ke segmen kontak — pilih by tag atau pipeline stage.
        </p>
      </div>

      <BroadcastForm
        sessions={sessions}
        availableTags={availableTags}
        onCreated={refresh}
      />

      <div>
        <h2 className="mb-3 font-display text-lg font-bold text-warm-900 dark:text-warm-50">
          Broadcast Saya
        </h2>
        {broadcasts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <Megaphone className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Belum ada broadcast. Bikin yang pertama di form di atas.
              </p>
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
