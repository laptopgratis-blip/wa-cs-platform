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

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
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
import { courseStatusMeta, statusMeta } from '@/lib/status'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface Lesson {
  id: string
  title: string
  contentType: 'VIDEO_EMBED' | 'TEXT' | 'FILE'
  videoEmbedUrl: string | null
  richTextHtml: string | null
  durationSec: number
  isFreePreview: boolean
  // Phase 4 — drip days. null = unlock immediate.
  dripDays: number | null
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

interface BuilderQuota {
  tier: string
  canUseDripSchedule: boolean
  canIssueCertificate: boolean
}

export function CourseBuilder({
  course: initial,
  availableProducts,
  quota,
}: {
  course: Course
  availableProducts: Pkg[]
  quota: BuilderQuota
}) {
  const router = useRouter()
  const [course, setCourse] = useState<Course>(initial)
  const [savingMeta, setSavingMeta] = useState(false)
  const [publishing, setPublishing] = useState(false)
  // Konfirmasi hapus module/lesson — pengganti window.confirm().
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: 'module'; moduleId: string }
    | { kind: 'lesson'; moduleId: string; lessonId: string }
    | null
  >(null)

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
      toast.success(
        'Course di-publish! Customer yg beli produk linked auto-enroll.',
      )
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
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <Label htmlFor="title" className="text-warm-500 text-xs">
                Judul Course
              </Label>
              <Input
                id="title"
                value={course.title}
                onChange={(e) =>
                  setCourse({ ...course, title: e.target.value })
                }
                onBlur={(e) => {
                  if (e.target.value !== initial.title) {
                    saveCourseMeta({ title: e.target.value })
                  }
                }}
                className="font-display mt-1 text-xl font-semibold"
              />
              <p className="text-warm-500 mt-1 text-xs">
                URL portal: /belajar/{course.slug}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <StatusBadge
                tone={statusMeta(courseStatusMeta, course.status).tone}
                label={statusMeta(courseStatusMeta, course.status).label}
              />
              <Button
                onClick={publish}
                disabled={publishing}
                size="sm"
                variant={course.status === 'PUBLISHED' ? 'outline' : 'default'}
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
            <Label htmlFor="desc" className="text-warm-500 text-xs">
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
            <Label className="text-warm-500 text-xs">Linked Product</Label>
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
            <p className="text-warm-500 mt-1 text-xs">
              Saat customer beli produk yg di-link, akses course aktif otomatis.
              Untuk publish, course wajib di-link ke produk.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* MODULES */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-warm-900 text-xl font-semibold">
            Modules &amp; Lessons
          </h2>
          <Button onClick={addModule} size="sm" variant="outline">
            <Plus className="mr-1.5 size-4" />
            Tambah Module
          </Button>
        </div>

        {course.modules.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState
                title="Belum ada module"
                description="Klik Tambah Module untuk mulai menyusun materi course."
              />
            </CardContent>
          </Card>
        ) : (
          course.modules.map((m) => (
            <ModuleBlock
              key={m.id}
              mod={m}
              onRename={() => renameModule(m.id, m.title)}
              onDelete={() =>
                setPendingDelete({ kind: 'module', moduleId: m.id })
              }
              onAddLesson={() =>
                setLessonDialog({ moduleId: m.id, lesson: null })
              }
              onEditLesson={(l) =>
                setLessonDialog({ moduleId: m.id, lesson: l })
              }
              onDeleteLesson={(lId) =>
                setPendingDelete({
                  kind: 'lesson',
                  moduleId: m.id,
                  lessonId: lId,
                })
              }
            />
          ))
        )}
      </div>

      {lessonDialog && (
        <LessonDialog
          moduleId={lessonDialog.moduleId}
          lesson={lessonDialog.lesson}
          quota={quota}
          onClose={() => setLessonDialog(null)}
          onSaved={(l) => lessonSaved(lessonDialog.moduleId, l)}
        />
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null)
        }}
        title={
          pendingDelete?.kind === 'module'
            ? 'Hapus module ini?'
            : 'Hapus lesson ini?'
        }
        description={
          pendingDelete?.kind === 'module'
            ? 'Semua lesson di dalamnya ikut terhapus.'
            : 'Lesson dihapus dari course dan tidak bisa dikembalikan.'
        }
        onConfirm={() => {
          if (!pendingDelete) return
          const target = pendingDelete
          setPendingDelete(null)
          if (target.kind === 'module') void deleteModule(target.moduleId)
          else void deleteLesson(target.moduleId, target.lessonId)
        }}
      />
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
    <Card className="overflow-visible">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-warm-900 text-lg font-semibold">
            {mod.title}
            <span className="text-warm-500 ml-2 text-xs font-normal">
              {mod.lessons.length} lesson
            </span>
          </h3>
          <div className="flex gap-1">
            <Button onClick={onRename} variant="ghost" size="sm">
              <Pencil className="size-3.5" />
            </Button>
            <Button onClick={onDelete} variant="ghost" size="sm">
              <Trash2 className="text-destructive size-3.5" />
            </Button>
          </div>
        </div>

        {mod.lessons.length > 0 && (
          <ul className="space-y-1.5">
            {mod.lessons.map((l) => (
              <li
                key={l.id}
                className="border-warm-100 bg-warm-50 flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div className="flex flex-1 items-center gap-2">
                  <Badge variant="secondary">
                    {l.contentType === 'VIDEO_EMBED'
                      ? 'Video'
                      : l.contentType === 'TEXT'
                        ? 'Teks'
                        : 'File'}
                  </Badge>
                  <span className="text-warm-900 flex-1">{l.title}</span>
                  {l.isFreePreview && (
                    <StatusBadge tone="success" label="Free" />
                  )}
                  {l.dripDays && l.dripDays > 0 ? (
                    <StatusBadge tone="warning" label={`Drip ${l.dripDays}d`} />
                  ) : null}
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
                    <Trash2 className="text-destructive size-3.5" />
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
  quota,
  onClose,
  onSaved,
}: {
  moduleId: string
  lesson: Lesson | null
  quota: BuilderQuota
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
  // Phase 4 — drip days. 0 atau null = unlock immediate.
  const [dripDays, setDripDays] = useState(lesson?.dripDays ?? 0)
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
        // Hanya kirim dripDays kalau plan support — kalau tidak, biarkan
        // default 0 (immediate). Backend juga validate.
        dripDays: quota.canUseDripSchedule ? dripDays : 0,
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
              onValueChange={(v) => setContentType(v as 'VIDEO_EMBED' | 'TEXT')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="VIDEO_EMBED">
                  Video Embed (YT/Vimeo)
                </SelectItem>
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
              <p className="text-warm-500 text-xs">
                Pakai URL embed (YouTube: ganti /watch?v= jadi /embed/). Vimeo:
                pakai player.vimeo.com/video/...
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

          {/* Drip schedule — Phase 4. Plan PRO/UNLIMITED only. */}
          <div className="border-warm-200 bg-warm-50 space-y-1.5 rounded-lg border p-3">
            <Label className="text-warm-700 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
              Drip Schedule
              {!quota.canUseDripSchedule && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold',
                    TONES.brand.bg,
                    TONES.brand.text,
                  )}
                >
                  Plan PRO+
                </span>
              )}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={365}
                value={dripDays}
                disabled={!quota.canUseDripSchedule}
                onChange={(e) =>
                  setDripDays(Math.max(0, Number(e.target.value) || 0))
                }
                className="w-24"
              />
              <span className="text-warm-600 text-xs">
                hari sejak student enroll
              </span>
            </div>
            <p className="text-warm-500 text-xs">
              {!quota.canUseDripSchedule
                ? `Tier ${quota.tier} tidak support drip schedule. Upgrade ke PRO/UNLIMITED di /pricing-lms.`
                : dripDays > 0
                  ? `Lesson akan unlock ${dripDays} hari setelah student enroll.`
                  : '0 = unlock langsung saat enroll (default).'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button onClick={save} disabled={submitting}>
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
