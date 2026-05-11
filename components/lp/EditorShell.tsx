'use client'

// EditorShell — top-level state holder & auto-save coordinator untuk LP editor.
// Dua mode:
//   - 'visual' (default): Visual Editor (preview + inline edit) + ColorsPanel
//     untuk user awam. Layout 2 kolom (ImageManager + main).
//   - 'lanjutan': HTML editor mentah + Live Preview untuk power user.
//     Layout 3 kolom (ImageManager + center HTML + preview).
import { Code2, MousePointerClick } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { AiGenerator } from '@/components/lp/AiGenerator'
import { ColorsPanel } from '@/components/lp/ColorsPanel'
import { EditorTopbar, type SaveStatus, type Viewport } from '@/components/lp/EditorTopbar'
import { HtmlEditor } from '@/components/lp/HtmlEditor'
import { ImageManager } from '@/components/lp/ImageManager'
import { LivePreview } from '@/components/lp/LivePreview'
import { PublishDialog } from '@/components/lp/PublishDialog'
import { SeoSettingsSheet } from '@/components/lp/SeoSettingsSheet'
import { VisualEditor } from '@/components/lp/VisualEditor'
import { findEditableTagOffset } from '@/lib/lp/html-mutation'
import { cn } from '@/lib/utils'

type EditorMode = 'visual' | 'lanjutan'

// ModeBar — tab switcher di bawah topbar. Pakai bahasa awam: "Edit Mudah"
// untuk visual, "HTML Lanjutan" untuk power user.
function ModeBar({
  mode,
  onChange,
}: {
  mode: EditorMode
  onChange: (m: EditorMode) => void
}) {
  return (
    <div className="flex items-center gap-1 border-b border-warm-200 bg-warm-50/50 px-4 py-1.5">
      <button
        type="button"
        onClick={() => onChange('visual')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
          mode === 'visual'
            ? 'bg-card text-warm-900 shadow-sm ring-1 ring-warm-200'
            : 'text-warm-600 hover:bg-warm-100 hover:text-warm-900',
        )}
        aria-pressed={mode === 'visual'}
      >
        <MousePointerClick className="size-3.5" />
        Edit Mudah
        {mode === 'visual' && (
          <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
            disarankan
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={() => onChange('lanjutan')}
        className={cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
          mode === 'lanjutan'
            ? 'bg-card text-warm-900 shadow-sm ring-1 ring-warm-200'
            : 'text-warm-600 hover:bg-warm-100 hover:text-warm-900',
        )}
        aria-pressed={mode === 'lanjutan'}
      >
        <Code2 className="size-3.5" />
        HTML Lanjutan
      </button>
      <span className="ml-2 hidden text-[10px] text-warm-500 md:inline">
        {mode === 'visual'
          ? 'Klik teks/tombol di preview untuk ubah · ganti warna di panel atas'
          : 'Edit HTML mentah · cocok kalau kamu mau custom struktur'}
      </span>
    </div>
  )
}

const AUTO_SAVE_INTERVAL_MS = 30_000

interface InitialLp {
  id: string
  title: string
  slug: string
  htmlContent: string
  metaTitle: string | null
  metaDesc: string | null
  isPublished: boolean
  updatedAt: string
}

export function EditorShell({ initial }: { initial: InitialLp }) {
  // Field yang user edit sehari-hari di main panel — di-track untuk auto-save & dirty.
  const [title, setTitle] = useState(initial.title)
  const [htmlContent, setHtmlContent] = useState(initial.htmlContent)

  // Field yang di-edit lewat sheet/dialog — sumber kebenaran setelah save.
  // PublishDialog & SeoSettingsSheet update via PATCH langsung, bukan lewat
  // auto-save flow, jadi kita expose state ini terpisah.
  const [slug, setSlug] = useState(initial.slug)
  const [metaTitle, setMetaTitle] = useState<string | null>(initial.metaTitle)
  const [metaDesc, setMetaDesc] = useState<string | null>(initial.metaDesc)
  const [isPublished, setIsPublished] = useState(initial.isPublished)

  // Snapshot terakhir yang ter-save di server — pembanding untuk dirty check
  // pada field yang di-track auto-save (title + htmlContent saja).
  const savedSnapshotRef = useRef({
    title: initial.title,
    htmlContent: initial.htmlContent,
  })

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<string>(initial.updatedAt)
  const [viewport, setViewport] = useState<Viewport>('desktop')

  // Mode default: Visual untuk user awam; user bisa switch ke Lanjutan kalau
  // butuh edit HTML mentah.
  const [mode, setMode] = useState<EditorMode>('visual')

  // Modal/sheet open state
  const [seoOpen, setSeoOpen] = useState(false)
  const [publishDialogOpen, setPublishDialogOpen] = useState(false)

  // Highlight range untuk HtmlEditor — diset saat user klik elemen di LivePreview
  // (mode lanjutan). Object baru tiap klik (walau index sama) supaya effect
  // re-trigger untuk klik berulang ke elemen yang sama.
  const [htmlHighlight, setHtmlHighlight] = useState<
    { start: number; end: number } | null
  >(null)

  const handlePreviewElementClick = useCallback(
    (editIndex: number) => {
      const range = findEditableTagOffset(htmlContent, editIndex)
      if (range) setHtmlHighlight({ ...range })
    },
    [htmlContent],
  )

  const isDirty =
    title !== savedSnapshotRef.current.title ||
    htmlContent !== savedSnapshotRef.current.htmlContent

  useEffect(() => {
    if (isDirty && saveStatus === 'saved') setSaveStatus('unsaved')
  }, [isDirty, saveStatus])

  // Ref pattern supaya effect tidak re-arm tiap render.
  const stateRef = useRef({ title, htmlContent, isDirty })
  useEffect(() => {
    stateRef.current = { title, htmlContent, isDirty }
  }, [title, htmlContent, isDirty])

  const performSave = useCallback(
    async (opts?: { silent?: boolean }) => {
      const snap = stateRef.current
      if (!snap.isDirty) return true
      setSaveStatus('saving')
      try {
        const res = await fetch(`/api/lp/${initial.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: snap.title,
            htmlContent: snap.htmlContent,
          }),
        })
        const json = (await res.json()) as {
          success: boolean
          data?: { updatedAt: string }
          error?: string
        }
        if (!res.ok || !json.success) {
          setSaveStatus('error')
          if (!opts?.silent) toast.error(json.error || 'Gagal menyimpan')
          return false
        }
        savedSnapshotRef.current = {
          title: snap.title,
          htmlContent: snap.htmlContent,
        }
        setLastSavedAt(json.data?.updatedAt ?? new Date().toISOString())
        setSaveStatus('saved')
        if (!opts?.silent) toast.success('Tersimpan')
        return true
      } catch (err) {
        console.error('[lp save]', err)
        setSaveStatus('error')
        if (!opts?.silent) toast.error('Terjadi kesalahan jaringan')
        return false
      }
    },
    [initial.id],
  )

  // Auto-save tiap 30s kalau dirty.
  useEffect(() => {
    const id = setInterval(() => {
      if (stateRef.current.isDirty) {
        void performSave({ silent: true })
      }
    }, AUTO_SAVE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [performSave])

  // Beforeunload guard kalau ada unsaved changes.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (stateRef.current.isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // ─── Publish/Unpublish flow lewat PublishDialog ──────────────
  // Sebelum buka dialog publish, save dulu draft kalau ada perubahan
  // (supaya konten yang dipublish adalah konten terbaru).
  const openPublishFlow = useCallback(async () => {
    if (stateRef.current.isDirty) {
      const ok = await performSave({ silent: true })
      if (!ok) {
        toast.error('Simpan dulu sebelum publish')
        return
      }
    }
    setPublishDialogOpen(true)
  }, [performSave])

  // Confirm action dari PublishDialog: PATCH isPublished saja.
  // Return true kalau sukses (PublishDialog pakai untuk transition success state).
  const confirmPublishToggle = useCallback(async (): Promise<boolean> => {
    const next = !isPublished
    try {
      const res = await fetch(`/api/lp/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: next }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { updatedAt: string }
        error?: string
      }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal mengubah status publish')
        return false
      }
      setIsPublished(next)
      setLastSavedAt(json.data?.updatedAt ?? new Date().toISOString())
      // Toast unpublish — publish sukses ditampilkan di success state dialog.
      if (!next) toast.success('LP di-unpublish')
      return true
    } catch (err) {
      console.error('[publish toggle]', err)
      toast.error('Terjadi kesalahan jaringan')
      return false
    }
  }, [initial.id, isPublished])

  // ─── Setelah save SEO settings ───────────────────────────────
  const handleSeoSaved = useCallback(
    (next: {
      metaTitle: string | null
      metaDesc: string | null
      slug: string
      isPublished: boolean
    }) => {
      setMetaTitle(next.metaTitle)
      setMetaDesc(next.metaDesc)
      setSlug(next.slug)
      setIsPublished(next.isPublished)
      setLastSavedAt(new Date().toISOString())
    },
    [],
  )

  const handleGeneratedHtml = useCallback((html: string) => {
    setHtmlContent(html)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <EditorTopbar
        lpId={initial.id}
        title={title}
        onTitleChange={setTitle}
        slug={slug}
        onSlugSaved={(next) => {
          setSlug(next)
          setLastSavedAt(new Date().toISOString())
        }}
        isPublished={isPublished}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        viewport={viewport}
        onViewportChange={setViewport}
        onSaveDraft={() => void performSave()}
        onPublishClick={() => void openPublishFlow()}
        onSeoClick={() => setSeoOpen(true)}
      />

      <ModeBar mode={mode} onChange={setMode} />

      {mode === 'visual' ? (
        <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[280px_1fr]">
          <aside className="hidden border-r border-warm-200 bg-card lg:flex lg:flex-col lg:overflow-hidden">
            <ImageManager lpId={initial.id} />
          </aside>

          <section className="flex min-h-0 flex-col bg-warm-50/30">
            <AiGenerator lpId={initial.id} onGenerated={handleGeneratedHtml} />
            <ColorsPanel html={htmlContent} onChange={setHtmlContent} />
            <div className="flex min-h-0 flex-1 flex-col">
              <VisualEditor
                htmlContent={htmlContent}
                viewport={viewport}
                onChange={setHtmlContent}
              />
            </div>
          </section>
        </div>
      ) : (
        <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[280px_1fr_1fr]">
          <aside className="hidden border-r border-warm-200 bg-card lg:flex lg:flex-col lg:overflow-hidden">
            <ImageManager lpId={initial.id} />
          </aside>

          <section className="flex min-h-0 flex-col border-r border-warm-200 bg-warm-50/30">
            <AiGenerator lpId={initial.id} onGenerated={handleGeneratedHtml} />
            <div className="flex min-h-0 flex-1 flex-col border-t border-warm-200">
              <HtmlEditor
                value={htmlContent}
                onChange={setHtmlContent}
                onSaveNow={() => void performSave()}
                highlightRange={htmlHighlight}
              />
            </div>
          </section>

          <section className="flex min-h-0 flex-col bg-warm-100/40">
            <LivePreview
              htmlContent={htmlContent}
              viewport={viewport}
              onElementClick={handlePreviewElementClick}
            />
          </section>
        </div>
      )}

      <SeoSettingsSheet
        open={seoOpen}
        onOpenChange={setSeoOpen}
        lpId={initial.id}
        initial={{ metaTitle, metaDesc, slug, isPublished }}
        onSaved={handleSeoSaved}
      />

      <PublishDialog
        open={publishDialogOpen}
        onOpenChange={setPublishDialogOpen}
        mode={isPublished ? 'unpublish' : 'publish'}
        slug={slug}
        htmlLength={htmlContent.length}
        onConfirm={confirmPublishToggle}
      />
    </div>
  )
}
