'use client'

// Job log scraper untuk debug. Read-only, 50 job terakhir.
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatRelativeTime } from '@/lib/format-time'

interface Job {
  id: string
  status: string
  triggeredBy: string
  startedAt: string | null
  completedAt: string | null
  durationMs: number | null
  errorMessage: string | null
  mutationsFound: number
  newMutations: number
  autoConfirmed: number
  createdAt: string
}

function statusBadge(status: string) {
  switch (status) {
    case 'SUCCESS':
      return <Badge className="bg-emerald-600">SUCCESS</Badge>
    case 'FAILED':
      return <Badge variant="destructive">FAILED</Badge>
    case 'RUNNING':
      return <Badge variant="outline">RUNNING</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

export function JobsClient() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const res = await fetch('/api/integrations/bank-mutation/jobs')
      const j = await res.json()
      if (!cancelled && j.success) {
        setJobs(j.data.jobs)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/integrations/bank-mutation">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Kembali
          </Button>
        </Link>
        <h1 className="text-xl font-bold">Scrape Job Logs</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="h-6 w-6 animate-spin inline mr-2" />
              Memuat...
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              Belum ada job log.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Waktu</th>
                    <th className="p-3 font-medium">Trigger</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium text-right">Durasi</th>
                    <th className="p-3 font-medium text-right">Mutasi (baru/total)</th>
                    <th className="p-3 font-medium text-right">Auto-confirm</th>
                    <th className="p-3 font-medium">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <tr key={j.id} className="border-b">
                      <td className="p-3 whitespace-nowrap">
                        {formatRelativeTime(j.createdAt)}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">{j.triggeredBy}</Badge>
                      </td>
                      <td className="p-3">{statusBadge(j.status)}</td>
                      <td className="p-3 text-right font-mono text-xs">
                        {j.durationMs !== null
                          ? `${(j.durationMs / 1000).toFixed(1)}s`
                          : '—'}
                      </td>
                      <td className="p-3 text-right font-mono text-xs">
                        {j.newMutations}/{j.mutationsFound}
                      </td>
                      <td className="p-3 text-right font-mono text-xs">
                        {j.autoConfirmed}
                      </td>
                      <td
                        className="p-3 max-w-[300px] truncate text-xs text-red-600"
                        title={j.errorMessage ?? ''}
                      >
                        {j.errorMessage ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
