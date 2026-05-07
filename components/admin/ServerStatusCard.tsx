'use client'

// Card di /admin/dashboard — server & storage status untuk pantau capacity.
// Dipakai sebagai dashboard health check; data dari /api/admin/server-status.
import { HardDrive, Image as ImageIcon, Loader2, Users } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

interface ServerStatus {
  disk: {
    total: string
    used: string
    available: string
    usedPct: string
  } | null
  uploads: { totalGb: string; totalMb: string; files: number }
  tiers: { tier: string; count: number }[]
  topStorage: {
    userId: string
    email: string | null
    name: string | null
    totalMb: string
  }[]
  lp: { total: number; published: number; draft: number }
  visits30d: number
}

const TIER_COLOR: Record<string, string> = {
  FREE: 'bg-warm-200 text-warm-700',
  STARTER: 'bg-blue-100 text-blue-700',
  POPULAR: 'bg-amber-100 text-amber-700',
  POWER: 'bg-purple-100 text-purple-700',
}

export function ServerStatusCard() {
  const [data, setData] = useState<ServerStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/server-status')
        const json = (await res.json()) as {
          success: boolean
          data?: ServerStatus
          error?: string
        }
        if (!res.ok || !json.success || !json.data) {
          setError(json.error ?? 'Gagal memuat status server')
          return
        }
        setData(json.data)
      } catch (err) {
        setError((err as Error).message)
      }
    })()
  }, [])

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Server & Storage Status</CardTitle>
          <CardDescription className="text-red-600">{error}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Server & Storage Status</CardTitle>
          <CardDescription>
            <Loader2 className="mr-2 inline size-4 animate-spin" />
            Memuat...
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const diskPctNum = data.disk
    ? Number((data.disk.usedPct ?? '0').replace('%', ''))
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Server & Storage Status</CardTitle>
        <CardDescription>
          Snapshot kapasitas VPS — pantau supaya tidak boncos saat user free
          banyak.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {data.disk && (
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium">
                <HardDrive className="size-4" />
                Disk root
              </span>
              <span className="text-muted-foreground">
                {data.disk.used} / {data.disk.total} ({data.disk.usedPct})
              </span>
            </div>
            <Progress value={diskPctNum} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">Total Uploads</div>
            <div className="font-display text-xl font-bold">
              {data.uploads.totalGb} GB
            </div>
            <div className="text-xs text-muted-foreground">
              {data.uploads.files} file
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Landing Pages</div>
            <div className="font-display text-xl font-bold">
              {data.lp.total}
            </div>
            <div className="text-xs text-muted-foreground">
              {data.lp.published} published · {data.lp.draft} draft
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Visits 30 hari</div>
            <div className="font-display text-xl font-bold">
              {data.visits30d.toLocaleString('id-ID')}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Users className="size-4" />
            User per Tier
          </div>
          <div className="flex flex-wrap gap-2">
            {data.tiers.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                Belum ada user dgn LpQuota.
              </span>
            ) : (
              data.tiers.map((t) => (
                <span
                  key={t.tier}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${TIER_COLOR[t.tier] ?? 'bg-muted text-muted-foreground'}`}
                >
                  {t.tier}: {t.count}
                </span>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ImageIcon className="size-4" />
            Top 5 User by Storage
          </div>
          {data.topStorage.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Belum ada upload gambar.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {data.topStorage.map((u, i) => (
                <li
                  key={u.userId}
                  className="flex items-center justify-between border-b py-1 last:border-0"
                >
                  <span className="truncate">
                    <span className="text-muted-foreground">
                      #{i + 1}
                    </span>{' '}
                    {u.name || u.email || u.userId}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {u.totalMb} MB
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
