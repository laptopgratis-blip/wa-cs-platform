'use client'

import {
  AlertTriangle,
  BarChart3,
  GraduationCap,
  Layers,
  Pencil,
  Users,
} from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { formatRupiah } from '@/lib/format'
import { courseStatusMeta, statusMeta } from '@/lib/status'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface Course {
  id: string
  title: string
  slug: string
  status: string
  totalDurationSec: number
  product: { id: string; name: string; price: number } | null
  _count: { modules: number; enrollments: number }
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec} detik`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m} menit`
  const h = Math.floor(m / 60)
  return `${h}j ${m % 60}m`
}

export function CoursesList({ courses }: { courses: Course[] }) {
  if (courses.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={GraduationCap}
            title="Belum ada course"
            description="Klik Buat Course Baru di pojok kanan atas untuk mulai."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {courses.map((c) => {
        const status = statusMeta(courseStatusMeta, c.status)
        return (
          <Card key={c.id} className="overflow-visible">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="text-warm-900 text-lg font-semibold">
                    {c.title}
                  </h3>
                  <p className="text-warm-500 mt-0.5 text-xs">
                    /belajar/{c.slug}
                  </p>
                </div>
                <StatusBadge tone={status.tone} label={status.label} />
              </div>

              <div className="text-warm-600 grid grid-cols-3 gap-2 text-xs">
                <div className="flex flex-col items-start">
                  <Layers className="text-primary-500 mb-1 size-3.5" />
                  <span className="font-semibold">{c._count.modules}</span>
                  <span className="text-warm-500">modul</span>
                </div>
                <div className="flex flex-col items-start">
                  <Users className="text-primary-500 mb-1 size-3.5" />
                  <span className="font-semibold">{c._count.enrollments}</span>
                  <span className="text-warm-500">student</span>
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-warm-400 mb-1 text-xs tracking-wide uppercase">
                    Durasi
                  </span>
                  <span className="font-semibold">
                    {formatDuration(c.totalDurationSec)}
                  </span>
                </div>
              </div>

              {c.product ? (
                <div
                  className={cn(
                    'rounded-md border p-2 text-xs',
                    TONES.success.bg,
                    TONES.success.border,
                    TONES.success.text,
                  )}
                >
                  Linked ke produk: <strong>{c.product.name}</strong>
                  {c.product.price > 0 && (
                    <> · {formatRupiah(c.product.price)}</>
                  )}
                </div>
              ) : (
                <div
                  className={cn(
                    'flex items-start gap-1.5 rounded-md border p-2 text-xs',
                    TONES.warning.bg,
                    TONES.warning.border,
                    TONES.warning.text,
                  )}
                >
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Belum di-link ke produk — customer belum bisa beli akses.
                  </span>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <Link
                  href={`/lms/courses/${c.id}/analytics`}
                  className="text-warm-600 hover:text-warm-900 inline-flex items-center gap-1 text-xs font-medium"
                >
                  <BarChart3 className="size-3.5" />
                  Analytics
                </Link>
                <Link
                  href={`/lms/courses/${c.id}/edit`}
                  className="text-primary-600 hover:text-primary-700 inline-flex items-center gap-1 text-xs font-medium"
                >
                  <Pencil className="size-3.5" />
                  Edit Course
                </Link>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
