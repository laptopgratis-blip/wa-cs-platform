'use client'

// InlineLessonAdd — bikin lesson pertama langsung di wizard. Compound flow:
//   1. Bootstrap: GET /api/lms/courses, pick first course (kalau 0 → user
//      harus selesain step course_add dulu).
//   2. GET /api/lms/courses/[id] untuk dapat modules. Kalau 0 module,
//      auto-POST "Modul 1" via /api/lms/courses/[id]/modules.
//   3. Form lesson: title + tipe (TEXT atau VIDEO_EMBED). POST ke
//      /api/lms/modules/[moduleId]/lessons.

import {
  CheckCircle2,
  FileText,
  Loader2,
  Save,
  Video,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import type { InlineTaskCommonProps } from './InlineTaskHost'

interface CourseLite {
  id: string
  title: string
}

interface ModuleLite {
  id: string
  title: string
}

type ContentType = 'TEXT' | 'VIDEO_EMBED'

export function InlineLessonAdd({
  onCompleted,
  fallbackHref,
}: InlineTaskCommonProps) {
  const [bootstrapping, setBootstrapping] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [course, setCourse] = useState<CourseLite | null>(null)
  const [moduleData, setModuleData] = useState<ModuleLite | null>(null)
  const [title, setTitle] = useState('')
  const [contentType, setContentType] = useState<ContentType>('TEXT')
  const [richText, setRichText] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // 1. Cari course pertama user.
        const coursesRes = await fetch('/api/lms/courses', { cache: 'no-store' })
        if (!coursesRes.ok) throw new Error('Tidak bisa load courses')
        const coursesJson = (await coursesRes.json()) as {
          success: boolean
          data?: { courses: CourseLite[] }
        }
        if (cancelled) return
        const firstCourse = coursesJson.data?.courses?.[0]
        if (!firstCourse) {
          setErrorMsg(
            'Belum ada course. Selesaikan step "Bikin course" dulu sebelum tambah lesson.',
          )
          return
        }
        setCourse(firstCourse)

        // 2. Detail course untuk dapat modules.
        const detailRes = await fetch(`/api/lms/courses/${firstCourse.id}`, {
          cache: 'no-store',
        })
        if (!detailRes.ok) throw new Error('Tidak bisa load detail course')
        const detailJson = (await detailRes.json()) as {
          success: boolean
          data?: {
            course: { modules: ModuleLite[] }
          }
        }
        if (cancelled) return
        let firstModule = detailJson.data?.course?.modules?.[0]

        // Kalau belum ada module, auto-create "Modul 1".
        if (!firstModule) {
          const modRes = await fetch(
            `/api/lms/courses/${firstCourse.id}/modules`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: 'Modul 1' }),
            },
          )
          if (!modRes.ok) throw new Error('Tidak bisa auto-create modul')
          const modJson = (await modRes.json()) as {
            success: boolean
            data?: { module: ModuleLite }
          }
          firstModule = modJson.data?.module
        }
        if (cancelled) return
        if (!firstModule) {
          setErrorMsg('Tidak bisa siapkan modul untuk lesson')
          return
        }
        setModuleData(firstModule)
      } catch (err) {
        console.error('[InlineLessonAdd bootstrap]', err)
        if (!cancelled)
          setErrorMsg(
            'Tidak bisa siapkan course/modul. Coba refresh atau buka halaman lengkap.',
          )
      } finally {
        if (!cancelled) setBootstrapping(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting || !moduleData) return
    if (title.trim().length < 1) {
      toast.error('Judul lesson wajib diisi')
      return
    }
    if (contentType === 'TEXT' && richText.trim().length < 1) {
      toast.error('Isi teks tidak boleh kosong')
      return
    }
    if (contentType === 'VIDEO_EMBED') {
      if (!videoUrl.trim()) {
        toast.error('URL video wajib diisi')
        return
      }
      try {
        new URL(videoUrl.trim())
      } catch {
        toast.error('URL video tidak valid')
        return
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch(`/api/lms/modules/${moduleData.id}/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          contentType,
          richTextHtml: contentType === 'TEXT' ? richText.trim() : null,
          videoEmbedUrl: contentType === 'VIDEO_EMBED' ? videoUrl.trim() : null,
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        message?: string
        error?: string
      }
      if (!res.ok || !json.success) {
        toast.error(json.message || json.error || 'Gagal simpan lesson')
        setSubmitting(false)
        return
      }
      toast.success('Lesson tersimpan')
      setDone(true)
      setTimeout(() => onCompleted(), 800)
    } catch (err) {
      console.error('[InlineLessonAdd submit]', err)
      toast.error('Tidak bisa hubungi server')
      setSubmitting(false)
    }
  }

  if (bootstrapping) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-warm-200 bg-warm-50 p-6 text-center">
        <Loader2 className="mb-2 size-5 animate-spin text-primary-500" />
        <p className="text-xs text-warm-600">Menyiapkan course &amp; modul…</p>
      </div>
    )
  }

  if (errorMsg) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
        <p className="text-sm text-amber-900">{errorMsg}</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="font-display text-base font-bold text-emerald-900">
          Lesson tersimpan
        </p>
        <p className="text-xs text-emerald-700">
          Tambah lesson lain dari halaman lengkap.
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border-2 border-primary-200 bg-card p-5"
    >
      <div className="rounded-md bg-blue-50 px-3 py-2 text-[11px] text-blue-800">
        Lesson akan ditambah ke{' '}
        <strong>
          {course?.title} → {moduleData?.title}
        </strong>
        . Bisa pindahkan / atur ulang dari halaman LMS lengkap.
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ob-lesson-title" className="text-xs">
          Judul lesson
        </Label>
        <Input
          id="ob-lesson-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="mis. Pengenalan & Manfaat Skincare"
          className="h-9 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Tipe konten</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setContentType('TEXT')}
            className={cn(
              'flex items-center gap-2 rounded-lg border-2 p-3 text-left text-sm transition-all',
              contentType === 'TEXT'
                ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                : 'border-warm-200 bg-warm-50 hover:border-warm-300',
            )}
          >
            <FileText className="size-4 text-primary-600" />
            <span>Teks</span>
          </button>
          <button
            type="button"
            onClick={() => setContentType('VIDEO_EMBED')}
            className={cn(
              'flex items-center gap-2 rounded-lg border-2 p-3 text-left text-sm transition-all',
              contentType === 'VIDEO_EMBED'
                ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
                : 'border-warm-200 bg-warm-50 hover:border-warm-300',
            )}
          >
            <Video className="size-4 text-primary-600" />
            <span>Video (YouTube / Vimeo)</span>
          </button>
        </div>
      </div>

      {contentType === 'TEXT' ? (
        <div className="space-y-1.5">
          <Label htmlFor="ob-lesson-text" className="text-xs">
            Isi lesson
          </Label>
          <Textarea
            id="ob-lesson-text"
            rows={6}
            value={richText}
            onChange={(e) => setRichText(e.target.value)}
            maxLength={50_000}
            placeholder="Tulis materi lesson di sini. Bisa pakai HTML basic (paragraf, bold, list)."
            className="text-xs"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="ob-lesson-video" className="text-xs">
            URL video (YouTube / Vimeo)
          </Label>
          <Input
            id="ob-lesson-video"
            type="url"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            className="h-9 text-sm"
          />
          <p className="text-[10px] text-warm-500">
            Tempel URL standard YouTube / Vimeo. Auto-embed di portal student.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="submit"
          disabled={submitting}
          className="bg-primary-500 hover:bg-primary-600"
        >
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Menyimpan…
            </>
          ) : (
            <>
              <Save className="mr-2 size-4" />
              Simpan lesson
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
