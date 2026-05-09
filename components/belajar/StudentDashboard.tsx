'use client'

import { Clock, GraduationCap, LogOut, Play } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Enrollment {
  enrollmentId: string
  enrolledAt: string
  expiresAt: string | null
  course: {
    id: string
    slug: string
    title: string
    description: string | null
    coverUrl: string | null
    totalDurationSec: number
    moduleCount: number
    lessonCount: number
  }
  progressCount: number
  completedCount: number
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}d`
  const m = Math.floor(sec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}j ${m % 60}m`
}

export function StudentDashboard({
  student,
  enrollments,
}: {
  student: { phone: string; name: string | null }
  enrollments: Enrollment[]
}) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  async function logout() {
    setLoggingOut(true)
    try {
      await fetch('/api/lms/auth/logout', { method: 'POST' })
      toast.success('Logout berhasil')
      window.location.href = '/belajar'
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-warm-900">
            Hai{student.name ? `, ${student.name}` : ''}!
          </h1>
          <p className="text-sm text-warm-600">
            Login sebagai{' '}
            <span className="font-mono">{student.phone}</span>
          </p>
        </div>
        <Button
          onClick={logout}
          disabled={loggingOut}
          variant="outline"
          size="sm"
        >
          <LogOut className="mr-2 size-4" />
          Logout
        </Button>
      </header>

      {enrollments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <GraduationCap className="mx-auto mb-3 size-10 text-warm-300" />
            <p className="font-semibold text-warm-700">
              Belum ada course aktif
            </p>
            <p className="mt-1 text-sm text-warm-500">
              Akses course muncul otomatis setelah pembayaran kamu di-konfirmasi.
              Cek WhatsApp untuk konfirmasi atau hubungi penjual.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {enrollments.map((e) => {
            const pct =
              e.course.lessonCount > 0
                ? Math.round((e.completedCount / e.course.lessonCount) * 100)
                : 0
            return (
              <Card
                key={e.enrollmentId}
                className="overflow-visible rounded-xl border-warm-200"
              >
                <CardContent className="space-y-3 p-4">
                  {e.course.coverUrl && (
                    <img
                      src={e.course.coverUrl}
                      alt={e.course.title}
                      className="aspect-video w-full rounded-lg object-cover"
                    />
                  )}
                  <div>
                    <h3 className="font-display text-lg font-bold text-warm-900">
                      {e.course.title}
                    </h3>
                    {e.course.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-warm-600">
                        {e.course.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs text-warm-600">
                    <span>
                      {e.course.lessonCount} lesson · {e.course.moduleCount}{' '}
                      modul
                    </span>
                    {e.course.totalDurationSec > 0 && (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {formatDuration(e.course.totalDurationSec)}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-warm-600">
                      <span>
                        {e.completedCount}/{e.course.lessonCount} selesai
                      </span>
                      <span className="font-semibold">{pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-warm-100">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <Button
                    asChild
                    className="w-full bg-primary-500 text-white hover:bg-primary-600"
                  >
                    <Link href={`/belajar/${e.course.slug}`}>
                      <Play className="mr-2 size-4" />
                      {pct > 0 ? 'Lanjut Belajar' : 'Mulai Belajar'}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
