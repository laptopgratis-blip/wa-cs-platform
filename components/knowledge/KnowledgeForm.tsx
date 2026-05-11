'use client'

// Form Tambah/Edit Pengetahuan. Multi-step: pilih jenis → isi konten → kata kunci.
// Kalau edit, jenis dikunci (tidak bisa ganti).
import {
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Upload,
  X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import type { KnowledgeListItem } from '@/components/knowledge/KnowledgeList'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type ContentType = 'TEXT' | 'IMAGE' | 'FILE' | 'LINK'

interface KnowledgeFormProps {
  initial?: KnowledgeListItem
  onDone: () => void
}

interface FormState {
  title: string
  textContent: string
  fileUrl: string
  fileName: string
  linkUrl: string
  caption: string
  keywords: string[]
}

const TYPE_OPTIONS: Array<{
  type: ContentType
  label: string
  description: string
  icon: typeof Type
}> = [
  {
    type: 'TEXT',
    label: 'Teks',
    description: 'Jawaban siap pakai (FAQ, info produk, kebijakan)',
    icon: Type,
  },
  {
    type: 'IMAGE',
    label: 'Gambar',
    description: 'Sertifikat, testimoni, brosur produk',
    icon: ImageIcon,
  },
  {
    type: 'FILE',
    label: 'File',
    description: 'PDF / Word / Excel — katalog, panduan, harga',
    icon: FileText,
  },
  {
    type: 'LINK',
    label: 'Link',
    description: 'URL eksternal — IG, Tokopedia, drive folder',
    icon: LinkIcon,
  },
]

export function KnowledgeForm({ initial, onDone }: KnowledgeFormProps) {
  const router = useRouter()
  const isEdit = Boolean(initial?.id)
  const fileRef = useRef<HTMLInputElement | null>(null)

  // Saat edit, type dikunci ke tipe entry. Saat create, default ke null
  // supaya user pilih dulu di step 1.
  const [contentType, setContentType] = useState<ContentType | null>(
    initial?.contentType ?? null,
  )
  const [state, setState] = useState<FormState>({
    title: initial?.title ?? '',
    textContent: initial?.textContent ?? '',
    fileUrl: initial?.fileUrl ?? '',
    fileName: initial?.fileUrl ? initial.fileUrl.split('/').pop() ?? '' : '',
    linkUrl: initial?.linkUrl ?? '',
    caption: initial?.caption ?? '',
    keywords: initial?.triggerKeywords ?? [],
  })
  const [keywordDraft, setKeywordDraft] = useState('')
  const [isUploading, setUploading] = useState(false)
  const [isSuggesting, setSuggesting] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)
  const [isDeleting, setDeleting] = useState(false)

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((s) => ({ ...s, [key]: value }))
  }

  function addKeyword(raw: string) {
    const v = raw.trim().toLowerCase()
    if (v.length < 2 || v.length > 40) return
    if (state.keywords.includes(v)) return
    if (state.keywords.length >= 20) {
      toast.error('Maksimal 20 kata kunci')
      return
    }
    update('keywords', [...state.keywords, v])
    setKeywordDraft('')
  }

  function removeKeyword(kw: string) {
    update(
      'keywords',
      state.keywords.filter((k) => k !== kw),
    )
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !contentType) return
    if (contentType !== 'IMAGE' && contentType !== 'FILE') return

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('kind', contentType)
      const res = await fetch('/api/knowledge/upload', {
        method: 'POST',
        body: fd,
      })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; data?: { url: string }; error?: string }
        | null
      if (!res.ok || !json?.success || !json.data) {
        toast.error(json?.error ?? 'Gagal mengunggah file')
        return
      }
      update('fileUrl', json.data.url)
      update('fileName', file.name)
      toast.success('File ter-upload')
    } finally {
      setUploading(false)
      // Reset input supaya kalau pilih file sama, change event tetap fire.
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleSuggestKeywords() {
    if (!contentType || state.title.trim().length < 2) {
      toast.error('Isi judul dulu sebelum optimasi kata kunci')
      return
    }
    setSuggesting(true)
    try {
      const res = await fetch('/api/knowledge/suggest-keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: state.title,
          contentType,
          textContent: state.textContent || null,
          caption: state.caption || null,
          existingKeywords: state.keywords,
        }),
      })
      const json = (await res.json().catch(() => null)) as
        | {
            success: boolean
            data?: {
              keywords: string[]
              charge?: { tokensCharged: number; modelName: string }
            }
            error?: string
          }
        | null
      if (!res.ok || !json?.success || !json.data) {
        toast.error(json?.error ?? 'Gagal panggil AI')
        return
      }
      const next = Array.from(
        new Set([...state.keywords, ...json.data.keywords.map((k) => k.toLowerCase())]),
      ).slice(0, 20)
      update('keywords', next)
      const tokenInfo = json.data.charge
        ? ` (−${json.data.charge.tokensCharged} token)`
        : ''
      if (json.data.keywords.length === 0) {
        toast.info(
          (state.keywords.length > 0
            ? 'AI tidak menemukan variasi baru — kata kunci sudah cukup lengkap'
            : 'AI tidak memberi saran, coba isi judul/caption lebih spesifik') +
            tokenInfo,
        )
      } else {
        toast.success(
          `${json.data.keywords.length} variasi kata kunci ditambahkan${tokenInfo}`,
        )
      }
    } finally {
      setSuggesting(false)
    }
  }

  async function handleSubmit() {
    if (!contentType) return
    // Validasi sederhana sebelum kirim — error spesifik di server tetap jalan.
    if (state.title.trim().length < 2) {
      toast.error('Judul minimal 2 karakter')
      return
    }
    if (contentType === 'TEXT' && state.textContent.trim().length < 1) {
      toast.error('Isi teks tidak boleh kosong')
      return
    }
    if ((contentType === 'IMAGE' || contentType === 'FILE') && !state.fileUrl) {
      toast.error('Upload file dulu')
      return
    }
    if (contentType === 'LINK' && !state.linkUrl.trim()) {
      toast.error('URL tidak boleh kosong')
      return
    }

    // Auto-suggest hint: kalau keyword sedikit, tawarkan ke user untuk
    // perluas pakai AI sebelum save. Hanya saat create — di edit user sudah
    // pegang kontrol.
    if (!isEdit && state.keywords.length < 3) {
      const ok = confirm(
        `Kata kunci baru ${state.keywords.length}. AI bisa tambah 10-15 variasi (sinonim, slang WA, typo) supaya trigger lebih luas.\n\nKlik OK untuk minta AI dulu, atau Cancel untuk simpan apa adanya.`,
      )
      if (ok) {
        await handleSuggestKeywords()
        // Setelah suggest, biarkan user lihat hasilnya dan klik Simpan lagi.
        return
      }
    }

    setSubmitting(true)
    try {
      const url = isEdit ? `/api/knowledge/${initial!.id}` : '/api/knowledge'
      const method = isEdit ? 'PATCH' : 'POST'

      // Build body. Pada PATCH kita kirim semua field relevan (server skip
      // yang undefined). Pada POST sesuai discriminated union: contentType +
      // field tipe.
      const body: Record<string, unknown> = {
        title: state.title.trim(),
        caption: state.caption.trim() || null,
        triggerKeywords: state.keywords,
      }
      if (!isEdit) {
        body.contentType = contentType
      }
      if (contentType === 'TEXT') body.textContent = state.textContent.trim()
      if (contentType === 'IMAGE' || contentType === 'FILE')
        body.fileUrl = state.fileUrl
      if (contentType === 'LINK') body.linkUrl = state.linkUrl.trim()

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Gagal menyimpan pengetahuan')
        return
      }
      toast.success(isEdit ? 'Pengetahuan diperbarui' : 'Pengetahuan disimpan')
      router.refresh()
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!initial?.id) return
    if (!confirm('Yakin hapus pengetahuan ini?')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/knowledge/${initial.id}`, {
        method: 'DELETE',
      })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? 'Gagal menghapus pengetahuan')
        return
      }
      toast.success('Pengetahuan dihapus')
      router.refresh()
      onDone()
    } finally {
      setDeleting(false)
    }
  }

  // Step 1: pilih tipe (hanya saat create)
  if (!isEdit && !contentType) {
    return (
      <div className="flex flex-col gap-3 py-2">
        <p className="text-sm text-muted-foreground">
          Pilih jenis pengetahuan yang mau ditambah:
        </p>
        <div className="grid gap-3">
          {TYPE_OPTIONS.map((opt) => {
            const Icon = opt.icon
            return (
              <button
                key={opt.type}
                type="button"
                onClick={() => setContentType(opt.type)}
                className="flex items-start gap-3 rounded-lg border border-warm-200 p-4 text-left transition hover:border-primary-500 hover:bg-primary-50/40 dark:border-warm-800 dark:hover:bg-primary-950/20"
              >
                <Icon className="mt-0.5 size-5 text-primary-500" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{opt.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {opt.description}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
        <div className="flex justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            Batal
          </Button>
        </div>
      </div>
    )
  }

  // Step 2 & 3: isi data
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="space-y-2">
        <Label htmlFor="kb-title">Judul</Label>
        <Input
          id="kb-title"
          placeholder="Misal: Sertifikat Halal MUI"
          value={state.title}
          onChange={(e) => update('title', e.target.value)}
        />
      </div>

      {contentType === 'TEXT' && (
        <div className="space-y-2">
          <Label htmlFor="kb-text">Isi</Label>
          <Textarea
            id="kb-text"
            rows={6}
            maxLength={2000}
            placeholder="Tuliskan jawaban / info yang AI bisa pakai langsung saat customer tanya."
            value={state.textContent}
            onChange={(e) => update('textContent', e.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground">
            {state.textContent.length} / 2000
          </p>
        </div>
      )}

      {(contentType === 'IMAGE' || contentType === 'FILE') && (
        <div className="space-y-2">
          <Label>{contentType === 'IMAGE' ? 'Gambar' : 'File'}</Label>
          {state.fileUrl ? (
            <div className="flex items-center gap-2 rounded-lg border p-3">
              <FileText className="size-4 text-primary-500" />
              <span className="flex-1 truncate text-sm">
                {state.fileName || state.fileUrl}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  update('fileUrl', '')
                  update('fileName', '')
                }}
              >
                Ganti
              </Button>
            </div>
          ) : (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept={
                  contentType === 'IMAGE'
                    ? 'image/jpeg,image/png,image/webp,image/gif'
                    : '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv'
                }
                onChange={handleFileChange}
                className="hidden"
                id="kb-file-input"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={isUploading}
                className="w-full"
              >
                {isUploading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 size-4" />
                )}
                {isUploading ? 'Mengunggah...' : 'Pilih file'}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">
                {contentType === 'IMAGE'
                  ? 'JPG / PNG / WebP / GIF, maks. 5 MB'
                  : 'PDF / Word / Excel / TXT / CSV, maks. 10 MB'}
              </p>
            </div>
          )}
          <div className="space-y-1 pt-2">
            <Label htmlFor="kb-caption">Caption (opsional)</Label>
            <Textarea
              id="kb-caption"
              rows={3}
              maxLength={1000}
              placeholder="AI akan kirim caption ini bersama file ke customer."
              value={state.caption}
              onChange={(e) => update('caption', e.target.value)}
            />
          </div>
        </div>
      )}

      {contentType === 'LINK' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="kb-link">URL</Label>
            <Input
              id="kb-link"
              type="url"
              placeholder="https://..."
              value={state.linkUrl}
              onChange={(e) => update('linkUrl', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kb-link-caption">Caption (opsional)</Label>
            <Textarea
              id="kb-link-caption"
              rows={3}
              maxLength={1000}
              placeholder="Kalimat singkat yang AI sebut saat kasih link ini."
              value={state.caption}
              onChange={(e) => update('caption', e.target.value)}
            />
          </div>
        </>
      )}

      <div className="space-y-2 border-t pt-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Label>Kata kunci pemicu</Label>
            <p className="text-xs text-muted-foreground">
              AI akan kirim info ini saat customer tanya tentang kata-kata berikut.
              Klik <strong>Optimasi AI</strong> untuk perluas variasi (sinonim, slang,
              typo) supaya trigger tidak gampang luput.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSuggestKeywords}
            disabled={isSuggesting}
          >
            {isSuggesting ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 size-4" />
            )}
            {state.keywords.length > 0 ? 'Perluas dengan AI' : 'Optimasi AI'}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5 rounded-lg border bg-warm-50/40 p-2 dark:bg-warm-950/20">
          {state.keywords.map((kw) => (
            <Badge
              key={kw}
              variant="secondary"
              className="gap-1 font-normal"
            >
              {kw}
              <button
                type="button"
                onClick={() => removeKeyword(kw)}
                className="rounded hover:bg-warm-200 dark:hover:bg-warm-800"
                aria-label={`Hapus ${kw}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {state.keywords.length === 0 && (
            <span className="px-1 text-xs text-muted-foreground">
              Belum ada kata kunci
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Ketik kata kunci, lalu Enter"
            value={keywordDraft}
            onChange={(e) => setKeywordDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addKeyword(keywordDraft)
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => addKeyword(keywordDraft)}
            disabled={keywordDraft.trim().length < 2}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
        <div>
          {isEdit && (
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={isDeleting || isSubmitting}
              className="text-destructive hover:text-destructive"
            >
              {isDeleting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              Hapus
            </Button>
          )}
        </div>
        <div className="flex gap-2 sm:justify-end">
          <Button type="button" variant="ghost" onClick={onDone}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || isUploading}
          >
            {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isEdit ? 'Simpan Perubahan' : 'Simpan'}
          </Button>
        </div>
      </div>
    </div>
  )
}
