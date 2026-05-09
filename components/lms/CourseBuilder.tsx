'use client'

// CourseBuilder — single-page builder dgn:
//  - Header: judul, status, tombol Publish + link product
//  - List Module → expandable, tambah/rename/hapus
//  - Per Module: list Lesson dgn dialog edit (embed URL atau text)
//
// Sederhana dulu (Phase 1): no drag-drop, no preview. Cukup untuk test
// flow create→link→publish→customer beli.
import {
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  Wand2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { formatRupiah } from '@/lib/format'

interface Lesson {
  id: string
  title: string
  contentType: 'VIDEO_EMBED' | 'TEXT' | 'FILE'
  videoEmbedUrl: string | null
  richTextHtml: string | null
  durationSec: number
  isFreePreview: boolean
  sortOrder: number
}

interface ModuleNode {
  id: string
  title: string
  sortOrder: number
  lessons: Lesson[]
}

interface Course {
  id: string
  title: string
  slug: string
  description: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  coverUrl: string | null
  productId: string | null
  modules: ModuleNode[]
}

interface Pkg {
  id: string
  name: string
  price: number
  courseId: string | null
}

const NONE = '__none__'

export function CourseBuilder({
  course: initial,
  availableProducts,
}: {
  course: Course
  availableProducts: Pkg[]
}) {
  const router = useRouter()
  const [course, setCourse] = useState<Course>(initial)
  const [savingMeta, setSavingMeta] = useState(false)
  const [publishing, setPublishing] = useState(false)

  // Dialog state untuk edit lesson
  const [lessonDialog, setLessonDialog] = useState<{
    moduleId: string
    lesson: Lesson | null // null = create new
  } | null>(null)

  async function saveCourseMeta(patch: Partial<Course>) {
    setSavingMeta(true)
    try {
      const res = await fetch(`/api/lms/courses/${course.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.message || json.error || 'Gagal save')
        return
      }
      setCourse({ ...course, ...patch })
      toast.success('Tersimpan')
      router.refresh()
    } finally {
      setSavingMeta(false)
    }
  }

  async function publish() {
    if (course.status === 'PUBLISHED') {
      // toggle ke DRAFT (unpublish)
      await saveCourseMeta({ status: 'DRAFT' })
      return
    }
    setPublishing(true)
    try {
      const res = await fetch(`/api/lms/courses/${course.id}/publish`, {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.message || json.error || 'Gagal publish')
        return
      }
      setCourse({ ...course, status: 'PUBLISHED' })
      toast.success('Course di-publish! Customer yg beli produk linked auto-enroll.')
      router.refresh()
    } finally {
      setPublishing(false)
    }
  }

  async function addModule() {
    const title = prompt('Judul module/bab baru?')
    if (!title?.trim()) return
    const res = await fetch(`/api/lms/courses/${course.id}/modules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.message || json.error || 'Gagal')
      return
    }
    setCourse({
      ...course,
      modules: [...course.modules, { ...json.data.module, lessons: [] }],
    })
  }

  async function renameModule(moduleId: string, currentTitle: string) {
    const title = prompt('Judul baru?', currentTitle)
    if (!title?.trim() || title.trim() === currentTitle) return
    const res = await fetch(`/api/lms/modules/${moduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.message || 'Gagal')
      return
    }
    setCourse({
      ...course,
      modules: course.modules.map((m) =>
        m.id === moduleId ? { ...m, title: title.trim() } : m,
      ),
    })
  }

  async function deleteModule(moduleId: string) {
    if (!confirm('Hapus module ini? Semua lesson di dalamnya ikut terhapus.'))
      return
    const res = await fetch(`/api/lms/modules/${moduleId}`, {
      method: 'DELETE',
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.message || 'Gagal')
      return
    }
    setCourse({
      ...course,
      modules: course.modules.filter((m) => m.id !== moduleId),
    })
  }

  async function deleteLesson(moduleId: string, lessonId: string) {
    if (!confirm('Hapus lesson ini?')) return
    const res = await fetch(`/api/lms/lessons/${lessonId}`, {
      method: 'DELETE',
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.message || 'Gagal')
      return
    }
    setCourse({
      ...course,
      modules: course.modules.map((m) =>
        m.id === moduleId
          ? { ...m, lessons: m.lessons.filter((l) => l.id !== lessonId) }
          : m,
      ),
    })
  }

  function lessonSaved(moduleId: string, lesson: Lesson) {
    setCourse({
      ...course,
      modules: course.modules.map((m) => {
        if (m.id !== moduleId) return m
        const exists = m.lessons.some((l) => l.id === lesson.id)
        return {
          ...m,
          lessons: exists
            ? m.lessons.map((l) => (l.id === lesson.id ? lesson : l))
            : [...m.lessons, lesson],
        }
      }),
    })
    setLessonDialog(null)
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="space-y-3 rounded-xl border border-warm-200 bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <Label htmlFor="title" className="text-xs text-warm-500">
              Judul Course
            </Label>
            <Input
              id="title"
              value={course.title}
              onChange={(e) => setCourse({ ...course, title: e.target.value })}
              onBlur={(e) => {
                if (e.target.value !== initial.title) {
                  saveCourseMeta({ title: e.target.value })
                }
              }}
              className="mt-1 font-display text-xl font-bold"
            />
            <p className="mt-1 text-xs text-warm-500">
              URL portal: /belajar/{course.slug}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge
              className={
                course.status === 'PUBLISHED'
                  ? 'bg-emerald-100 text-emerald-700'
                  : course.status === 'ARCHIVED'
                    ? 'bg-rose-100 text-rose-700'
                    : 'bg-warm-100 text-warm-700'
              }
            >
              {course.status === 'PUBLISHED'
                ? 'Tayang'
                : course.status === 'ARCHIVED'
                  ? 'Arsip'
                  : 'Draft'}
            </Badge>
            <Button
              onClick={publish}
              disabled={publishing}
              size="sm"
              className={
                course.status === 'PUBLISHED'
                  ? 'bg-warm-600 text-white hover:bg-warm-700'
                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }
            >
              {publishing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : course.status === 'PUBLISHED' ? (
                <>
                  <EyeOff className="mr-1.5 size-4" />
                  Unpublish
                </>
              ) : (
                <>
                  <Eye className="mr-1.5 size-4" />
                  Publish
                </>
              )}
            </Button>
          </div>
        </div>

        <div>
          <Label htmlFor="desc" className="text-xs text-warm-500">
            Deskripsi
          </Label>
          <Textarea
            id="desc"
            value={course.description ?? ''}
            onChange={(e) =>
              setCourse({ ...course, description: e.target.value })
            }
            onBlur={(e) => {
              if (e.target.value !== (initial.description ?? '')) {
                saveCourseMeta({ description: e.target.value || null })
              }
            }}
            rows={3}
            placeholder="Apa yg akan dipelajari student?"
          />
        </div>

        <div>
          <Label className="text-xs text-warm-500">Linked Product</Label>
          <Select
            value={course.productId ?? NONE}
            onValueChange={(v) => {
              const newProductId = v === NONE ? null : v
              saveCourseMeta({ productId: newProductId })
              setCourse({ ...course, productId: newProductId })
            }}
            disabled={savingMeta}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Belum di-link" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— Belum di-link —</SelectItem>
              {availableProducts.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.price > 0 && ` · ${formatRupiah(p.price)}`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-warm-500">
            Saat customer beli produk yg di-link, akses course aktif otomatis.
            Untuk publish, course wajib di-link ke produk.
          </p>
        </div>
      </div>

      {/* MODULES */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-warm-900 dark:text-warm-50">
            Modules &amp; Lessons
          </h2>
          <Button onClick={addModule} size="sm" variant="outline">
            <Plus className="mr-1.5 size-4" />
            Tambah Module
          </Button>
        </div>

        {course.modules.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-warm-500">
              Belum ada module. Klik <strong>Tambah Module</strong> untuk
              mulai.
            </CardContent>
          </Card>
        ) : (
          course.modules.map((m) => (
            <ModuleBlock
              key={m.id}
              mod={m}
              onRename={() => renameModule(m.id, m.title)}
              onDelete={() => deleteModule(m.id)}
              onAddLesson={() =>
                setLessonDialog({ moduleId: m.id, lesson: null })
              }
              onEditLesson={(l) =>
                setLessonDialog({ moduleId: m.id, lesson: l })
              }
              onDeleteLesson={(lId) => deleteLesson(m.id, lId)}
            />
          ))
        )}
      </div>

      {lessonDialog && (
        <LessonDialog
          moduleId={lessonDialog.moduleId}
          lesson={lessonDialog.lesson}
          onClose={() => setLessonDialog(null)}
          onSaved={(l) => lessonSaved(lessonDialog.moduleId, l)}
        />
      )}
    </div>
  )
}

function ModuleBlock({
  mod,
  onRename,
  onDelete,
  onAddLesson,
  onEditLesson,
  onDeleteLesson,
}: {
  mod: ModuleNode
  onRename: () => void
  onDelete: () => void
  onAddLesson: () => void
  onEditLesson: (l: Lesson) => void
  onDeleteLesson: (id: string) => void
}) {
  return (
    <Card className="overflow-visible rounded-xl border-warm-200">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-warm-900 dark:text-warm-50">
            {mod.title}
            <span className="ml-2 text-xs font-normal text-warm-500">
              {mod.lessons.length} lesson
            </span>
          </h3>
          <div className="flex gap-1">
            <Button onClick={onRename} variant="ghost" size="sm">
              <Pencil className="size-3.5" />
            </Button>
            <Button onClick={onDelete} variant="ghost" size="sm">
              <Trash2 className="size-3.5 text-rose-500" />
            </Button>
          </div>
        </div>

        {mod.lessons.length > 0 && (
          <ul className="space-y-1.5">
            {mod.lessons.map((l) => (
              <li
                key={l.id}
                className="flex items-center justify-between gap-2 rounded-md border border-warm-100 bg-warm-50 p-2 text-sm"
              >
                <div className="flex flex-1 items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="bg-purple-100 text-purple-700"
                  >
                    {l.contentType === 'VIDEO_EMBED'
                      ? 'Video'
                      : l.contentType === 'TEXT'
                        ? 'Teks'
                        : 'File'}
                  </Badge>
                  <span className="flex-1 text-warm-900">{l.title}</span>
                  {l.isFreePreview && (
                    <Badge className="bg-emerald-100 text-emerald-700">
                      Free
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditLesson(l)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteLesson(l.id)}
                  >
                    <Trash2 className="size-3.5 text-rose-500" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Button
          onClick={onAddLesson}
          variant="outline"
          size="sm"
          className="w-full border-dashed"
        >
          <Plus className="mr-1.5 size-4" />
          Tambah Lesson
        </Button>
      </CardContent>
    </Card>
  )
}

function LessonDialog({
  moduleId,
  lesson,
  onClose,
  onSaved,
}: {
  moduleId: string
  lesson: Lesson | null
  onClose: () => void
  onSaved: (l: Lesson) => void
}) {
  const [title, setTitle] = useState(lesson?.title ?? '')
  const [contentType, setContentType] = useState<'VIDEO_EMBED' | 'TEXT'>(
    (lesson?.contentType as 'VIDEO_EMBED' | 'TEXT') ?? 'VIDEO_EMBED',
  )
  const [videoEmbedUrl, setVideoEmbedUrl] = useState(
    lesson?.videoEmbedUrl ?? '',
  )
  const [richTextHtml, setRichTextHtml] = useState(lesson?.richTextHtml ?? '')
  const [durationSec, setDurationSec] = useState(lesson?.durationSec ?? 0)
  const [isFreePreview, setIsFreePreview] = useState(
    lesson?.isFreePreview ?? false,
  )
  const [submitting, setSubmitting] = useState(false)

  async function save() {
    if (!title.trim()) {
      toast.error('Judul lesson wajib diisi')
      return
    }
    if (contentType === 'VIDEO_EMBED' && !videoEmbedUrl.trim()) {
      toast.error('URL embed video wajib diisi')
      return
    }
    if (contentType === 'TEXT' && !richTextHtml.trim()) {
      toast.error('Konten teks wajib diisi')
      return
    }
    setSubmitting(true)
    try {
      const body = {
        title: title.trim(),
        contentType,
        videoEmbedUrl:
          contentType === 'VIDEO_EMBED' ? videoEmbedUrl.trim() : null,
        richTextHtml: contentType === 'TEXT' ? richTextHtml.trim() : null,
        durationSec,
        isFreePreview,
      }
      const url = lesson
        ? `/api/lms/lessons/${lesson.id}`
        : `/api/lms/modules/${moduleId}/lessons`
      const res = await fetch(url, {
        method: lesson ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.message || json.error || 'Gagal save')
        return
      }
      onSaved(json.data.lesson)
      toast.success(lesson ? 'Lesson tersimpan' : 'Lesson dibuat')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{lesson ? 'Edit Lesson' : 'Tambah Lesson'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Judul Lesson</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Mis. Cara Riset Pasar"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tipe Konten</Label>
            <Select
              value={contentType}
              onValueChange={(v) =>
                setContentType(v as 'VIDEO_EMBED' | 'TEXT')
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VIDEO_EMBED">Video Embed (YT/Vimeo)</SelectItem>
                <SelectItem value="TEXT">Teks / Markdown</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {contentType === 'VIDEO_EMBED' && (
            <div className="space-y-1.5">
              <Label>URL Embed Video</Label>
              <Input
                value={videoEmbedUrl}
                onChange={(e) => setVideoEmbedUrl(e.target.value)}
                placeholder="https://www.youtube.com/embed/..."
              />
              <p className="text-[11px] text-warm-500">
                Pakai URL embed (YouTube: ganti /watch?v= jadi /embed/).
                Vimeo: pakai player.vimeo.com/video/...
              </p>
            </div>
          )}

          {contentType === 'TEXT' && (
            <div className="space-y-1.5">
              <Label>Konten Teks (HTML / plain)</Label>
              <Textarea
                value={richTextHtml}
                onChange={(e) => setRichTextHtml(e.target.value)}
                rows={8}
                maxLength={50_000}
                placeholder="Tulis materi lesson di sini. Bisa pakai HTML basic <p>, <ul>, <a href>..."
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Durasi (detik, opsional)</Label>
              <Input
                type="number"
                min={0}
                max={43200}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value) || 0)}
              />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch
                checked={isFreePreview}
                onCheckedChange={setIsFreePreview}
                id="freePreview"
              />
              <Label htmlFor="freePreview" className="cursor-pointer">
                Free preview
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={save}
            disabled={submitting}
            className="bg-primary-500 text-white hover:bg-primary-600"
          >
            {submitting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
