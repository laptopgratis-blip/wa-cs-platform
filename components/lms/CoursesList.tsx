'use client'

import { Layers, Pencil, Users } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatRupiah } from '@/lib/format'

interface Course {
  id: string
  title: string
  slug: string
  status: string
  totalDurationSec: number
  product: { id: string; name: string; price: number } | null
  _count: { modules: number; enrollments: number }
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-warm-100 text-warm-700' },
  PUBLISHED: { label: 'Tayang', cls: 'bg-emerald-100 text-emerald-700' },
  ARCHIVED: { label: 'Arsip', cls: 'bg-rose-100 text-rose-700' },
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
        <CardContent className="py-16 text-center">
          <p className="text-sm text-warm-500">
            Belum ada course. Klik <strong>Buat Course Baru</strong> di pojok
            kanan atas untuk mulai.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {courses.map((c) => {
        const status = STATUS_LABEL[c.status] ?? STATUS_LABEL.DRAFT
        return (
          <Card
            key={c.id}
            className="overflow-visible rounded-xl border-warm-200"
          >
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <h3 className="font-display text-lg font-bold text-warm-900 dark:text-warm-50">
                    {c.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-warm-500">
                    /belajar/{c.slug}
                  </p>
                </div>
                <Badge className={status.cls}>{status.label}</Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs text-warm-600">
                <div className="flex flex-col items-start">
                  <Layers className="mb-1 size-3.5 text-primary-500" />
                  <span className="font-semibold">{c._count.modules}</span>
                  <span className="text-warm-500">modul</span>
                </div>
                <div className="flex flex-col items-start">
                  <Users className="mb-1 size-3.5 text-primary-500" />
                  <span className="font-semibold">{c._count.enrollments}</span>
                  <span className="text-warm-500">student</span>
                </div>
                <div className="flex flex-col items-start">
                  <span className="mb-1 text-[10px] uppercase tracking-wide text-warm-400">
                    Durasi
                  </span>
                  <span className="font-semibold">
                    {formatDuration(c.totalDurationSec)}
                  </span>
                </div>
              </div>

              {c.product ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
                  Linked ke produk: <strong>{c.product.name}</strong>
                  {c.product.price > 0 && (
                    <> · {formatRupiah(c.product.price)}</>
                  )}
                </div>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  ⚠️ Belum di-link ke produk — customer belum bisa beli akses.
                </div>
              )}

              <div className="flex justify-end">
                <Link
                  href={`/lms/courses/${c.id}/edit`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700"
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
