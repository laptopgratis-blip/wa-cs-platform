'use client'

// InlineCourseAdd — form simple bikin course pertama di wizard. POST
// /api/lms/courses dengan title + description. Course di-create dengan
// status DRAFT — user tinggal tambah module/lesson di halaman lengkap.

import { CheckCircle2, GraduationCap, Loader2, Save } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

import type { InlineTaskCommonProps } from './InlineTaskHost'

export function InlineCourseAdd({
  onCompleted,
  fallbackHref,
}: InlineTaskCommonProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (title.trim().length < 2) {
      toast.error('Judul course minimal 2 karakter')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/lms/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        message?: string
        error?: string
      }
      if (!res.ok || !json.success) {
        toast.error(json.message || json.error || 'Gagal bikin course')
        setSubmitting(false)
        return
      }
      toast.success('Course tersimpan')
      setDone(true)
      setTimeout(() => onCompleted(), 800)
    } catch (err) {
      console.error('[InlineCourseAdd submit]', err)
      toast.error('Tidak bisa hubungi server')
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500 text-white">
          <CheckCircle2 className="size-6" />
        </div>
        <p className="font-display text-base font-bold text-emerald-900">
          Course tersimpan (DRAFT)
        </p>
        <p className="text-xs text-emerald-700">
          Lanjut tambah modul &amp; lesson di step berikutnya…
        </p>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border-2 border-primary-200 bg-card p-5"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-600">
          <GraduationCap className="size-5" />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-base font-bold text-warm-900">
            Bikin course baru
          </h3>
          <p className="mt-0.5 text-xs text-warm-600">
            Wadah lesson kamu. Module &amp; lesson ditambah belakangan.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ob-course-title" className="text-xs">
          Judul course
        </Label>
        <Input
          id="ob-course-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="mis. Belajar Skincare 7 Hari"
          className="h-9 text-sm"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ob-course-desc" className="text-xs">
          Deskripsi singkat (opsional)
        </Label>
        <Textarea
          id="ob-course-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          placeholder="Apa yang akan dipelajari peserta + target audience."
          className="text-xs"
        />
      </div>

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
              Simpan course
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
