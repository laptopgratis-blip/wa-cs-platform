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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Durasi</TableHead>
                  <TableHead className="text-right">
                    Mutasi (baru/total)
                  </TableHead>
                  <TableHead className="text-right">Auto-confirm</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell>{formatRelativeTime(j.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{j.triggeredBy}</Badge>
                    </TableCell>
                    <TableCell>{statusBadge(j.status)}</TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {j.durationMs !== null
                        ? `${(j.durationMs / 1000).toFixed(1)}s`
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {j.newMutations}/{j.mutationsFound}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {j.autoConfirmed}
                    </TableCell>
                    <TableCell
                      className={`max-w-[300px] truncate text-xs ${TONES.danger.text}`}
                      title={j.errorMessage ?? ''}
                    >
                      {j.errorMessage ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
