'use client'

import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Lock,
  PlayCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Lesson {
  id: string
  title: string
  contentType: 'VIDEO_EMBED' | 'TEXT' | 'FILE'
  durationSec: number
  isFreePreview: boolean
  sortOrder: number
  videoEmbedUrl: string | null
  richTextHtml: string | null
  locked: boolean
  watchedSec: number
  completedAt: string | null
}

interface ModuleNode {
  id: string
  title: string
  sortOrder: number
  lessons: Lesson[]
}

interface Course {
  id: string
  slug: string
  title: string
  description: string | null
  coverUrl: string | null
  totalDurationSec: number
}

export function CoursePlayer({
  course,
  isEnrolled,
  modules,
}: {
  course: Course
  isEnrolled: boolean
  modules: ModuleNode[]
}) {
  // Lesson aktif — default: lesson pertama yg accessible.
  const allAccessibleLessons = useMemo(
    () =>
      modules
        .flatMap((m) => m.lessons)
        .filter((l) => !l.locked),
    [modules],
  )
  const [activeLessonId, setActiveLessonId] = useState<string | null>(
    allAccessibleLessons[0]?.id ?? null,
  )
  const activeLesson = useMemo(
    () =>
      modules
        .flatMap((m) => m.lessons)
        .find((l) => l.id === activeLessonId) ?? null,
    [activeLessonId, modules],
  )

  // Track completed locally untuk update UI tanpa re-fetch.
  const [completedSet, setCompletedSet] = useState<Set<string>>(
    new Set(
      modules
        .flatMap((m) => m.lessons)
        .filter((l) => l.completedAt)
        .map((l) => l.id),
    ),
  )

  async function markCompleted(lessonId: string) {
    if (completedSet.has(lessonId)) return
    try {
      const res = await fetch(`/api/lms/lessons/${lessonId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watchedSec: activeLesson?.durationSec ?? 0,
          completed: true,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.message || 'Gagal mark selesai')
        return
      }
      const next = new Set(completedSet)
      next.add(lessonId)
      setCompletedSet(next)
      toast.success('Lesson ditandai selesai')
    } catch {
      toast.error('Gagal mark selesai')
    }
  }

  // Auto-mark watched setelah 30 detik buka lesson video (Phase 2 simple
  // tracking, no real video event integration).
  useEffect(() => {
    if (!activeLessonId || !activeLesson) return
    if (activeLesson.contentType !== 'VIDEO_EMBED') return
    if (completedSet.has(activeLessonId)) return
    const t = setTimeout(() => {
      // Best-effort save watchedSec progress (not completed).
      void fetch(`/api/lms/lessons/${activeLessonId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          watchedSec: Math.min(30, activeLesson.durationSec || 30),
          completed: false,
        }),
      }).catch(() => {})
    }, 30_000)
    return () => clearTimeout(t)
  }, [activeLessonId, activeLesson, completedSet])

  return (
    <div className="mx-auto max-w-6xl px-4 py-4 lg:py-6">
      <div className="mb-4">
        <Link
          href="/belajar"
          className="inline-flex items-center gap-1 text-xs text-warm-500 hover:text-warm-700"
        >
          <ArrowLeft className="size-3" />
          Dashboard
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* PLAYER */}
        <div className="space-y-4">
          <div>
            <h1 className="font-display text-2xl font-extrabold text-warm-900">
              {course.title}
            </h1>
            {course.description && (
              <p className="mt-1 text-sm text-warm-600">{course.description}</p>
            )}
            {!isEnrolled && (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                Kamu sedang lihat <strong>preview gratis</strong>. Untuk akses
                lesson lain, login dgn nomor WA yg dipakai saat order — atau
                hubungi penjual untuk beli.
              </div>
            )}
          </div>

          {activeLesson ? (
            <LessonView lesson={activeLesson} onComplete={() => markCompleted(activeLesson.id)} />
          ) : (
            <Card>
              <CardContent className="py-16 text-center text-sm text-warm-500">
                Pilih lesson dari daftar di samping.
              </CardContent>
            </Card>
          )}
        </div>

        {/* SIDEBAR — list modules + lessons */}
        <aside className="space-y-3">
          {modules.map((m) => (
            <Card
              key={m.id}
              className="overflow-visible rounded-xl border-warm-200"
            >
              <CardContent className="space-y-2 p-3">
                <h3 className="text-sm font-semibold text-warm-900">
                  {m.title}
                </h3>
                <ul className="space-y-1">
                  {m.lessons.map((l) => {
                    const isActive = l.id === activeLessonId
                    const isComplete = completedSet.has(l.id)
                    return (
                      <li key={l.id}>
                        <button
                          type="button"
                          disabled={l.locked}
                          onClick={() => setActiveLessonId(l.id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition',
                            isActive && 'bg-primary-50 text-primary-700',
                            !isActive && !l.locked && 'hover:bg-warm-50',
                            l.locked &&
                              'cursor-not-allowed text-warm-400 opacity-70',
                          )}
                        >
                          {l.locked ? (
                            <Lock className="size-3.5 shrink-0" />
                          ) : isComplete ? (
                            <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                          ) : isActive ? (
                            <PlayCircle className="size-3.5 shrink-0 text-primary-500" />
                          ) : (
                            <Circle className="size-3.5 shrink-0 text-warm-400" />
                          )}
                          <span className="flex-1 truncate">{l.title}</span>
                          {l.isFreePreview && !isEnrolled && (
                            <Badge className="bg-emerald-100 text-[9px] text-emerald-700">
                              Free
                            </Badge>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </aside>
      </div>
    </div>
  )
}

function LessonView({
  lesson,
  onComplete,
}: {
  lesson: Lesson
  onComplete: () => void
}) {
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-warm-900">
        {lesson.title}
      </h2>

      {lesson.contentType === 'VIDEO_EMBED' && lesson.videoEmbedUrl && (
        <div className="aspect-video overflow-hidden rounded-xl bg-warm-900">
          <iframe
            src={lesson.videoEmbedUrl}
            title={lesson.title}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}

      {lesson.contentType === 'TEXT' && lesson.richTextHtml && (
        <div className="rounded-xl border border-warm-200 bg-card p-4">
          <div
            className="prose prose-sm max-w-none text-warm-800"
            dangerouslySetInnerHTML={{ __html: lesson.richTextHtml }}
          />
        </div>
      )}

      {!lesson.videoEmbedUrl && !lesson.richTextHtml && (
        <div className="rounded-xl border border-warm-200 bg-warm-50 p-6 text-center text-sm text-warm-500">
          Lesson ini belum punya konten. Hubungi penjual.
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border border-warm-200 bg-card p-3">
        <div className="text-xs text-warm-600">
          {lesson.completedAt ? (
            <span className="flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="size-3.5" />
              Selesai pada{' '}
              {new Date(lesson.completedAt).toLocaleDateString('id-ID')}
            </span>
          ) : (
            <span>Tandai selesai kalau sudah paham materinya.</span>
          )}
        </div>
        {!lesson.completedAt && (
          <Button onClick={onComplete} size="sm" variant="outline">
            <CheckCircle2 className="mr-1.5 size-4" />
            Tandai Selesai
          </Button>
        )}
      </div>
    </div>
  )
}
