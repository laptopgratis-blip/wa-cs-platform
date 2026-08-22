'use client'

// Job log scraper untuk debug. Read-only, 50 job terakhir.
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatRelativeTime } from '@/lib/format-time'
import { scrapeJobStatusMeta, statusMeta } from '@/lib/status'
import { TONES } from '@/lib/ui-tones'

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
  const meta = statusMeta(scrapeJobStatusMeta, status)
  return <StatusBadge tone={meta.tone} label={meta.label} />
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
      <div>
        <Link href="/integrations/bank-mutation">
          <Button variant="ghost" size="sm" className="mb-2 -ml-2">
            <ArrowLeft className="mr-1 size-4" /> Kembali
          </Button>
        </Link>
        <PageHeader
          title="Scrape Job Logs"
          description="Riwayat eksekusi scraper mutasi — status, durasi, dan error tiap run."
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4">
              <CardGridSkeleton count={2} />
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              title="Belum ada job log"
              description="Log muncul setelah scraper jalan (terjadwal atau manual)."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr className="text-left">
                    <th className="p-3 font-medium">Waktu</th>
                    <th className="p-3 font-medium">Trigger</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 text-right font-medium">Durasi</th>
                    <th className="p-3 text-right font-medium">
                      Mutasi (baru/total)
                    </th>
                    <th className="p-3 text-right font-medium">Auto-confirm</th>
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
                        className={`max-w-[300px] truncate p-3 text-xs ${TONES.danger.text}`}
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
