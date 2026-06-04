'use client'

// ClipLibraryBoard — UI generate + manage LiveClip per HostTemplate (Klip Live mode).
//
// Layout:
//   Header: host name + status + tombol kembali ke /host-templates
//   Section 1: Voice picker (dropdown dari ElevenLabs)
//   Section 2: Generate form — category + script + tombol "Generate Klip"
//   Section 3: List clips grouped by category, dengan status badge + video preview + actions
//
// Generate sinkron (max 2 menit) — show spinner sampai READY/FAILED.

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mic,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { BulkGenerateModal } from './BulkGenerateModal'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Voice {
  voice_id: string
  name: string
  category: string
  labels?: Record<string, string>
  preview_url?: string | null
}

interface Clip {
  id: string
  scriptOriginal: string
  transcript: string
  summary: string | null
  category: string
  tags: string[]
  productId: string | null
  audioUrl: string | null
  videoUrl: string | null
  durationMs: number | null
  source: string
  status: string
  errorMessage: string | null
  isActive: boolean
  isEvergreen: boolean
  isDefaultIdle: boolean
  triggerKeywords?: string[]
  matchMode?: string
  manualConfidence?: number | null
  useCount: number
  createdAt: string
}

const CATEGORIES = [
  { value: 'GREETING', label: '🔔 Greeting', hint: 'Sapaan saat customer masuk' },
  { value: 'PRODUCT_DEMO', label: '💊 Product Demo', hint: 'Jelasin produk spesifik' },
  { value: 'PRICE', label: '💰 Harga', hint: 'Jawab pertanyaan harga' },
  { value: 'OBJECTION', label: '🛡️ Objection', hint: 'Handle keberatan customer' },
  { value: 'CLOSING', label: '🛒 Closing', hint: 'Push checkout' },
  { value: 'IDLE', label: '😊 Idle', hint: 'Loop saat sepi (silent, no speech)' },
  { value: 'GENERAL', label: '💬 General', hint: 'Umum / fallback' },
] as const

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-warm-100 text-warm-700' },
  GENERATING_AUDIO: { label: 'Audio gen…', cls: 'bg-amber-100 text-amber-700' },
  GENERATING_VIDEO: { label: 'Video gen…', cls: 'bg-amber-100 text-amber-700' },
  PROCESSING_EMBEDDING: { label: 'Embed…', cls: 'bg-amber-100 text-amber-700' },
  READY: { label: 'Siap', cls: 'bg-emerald-100 text-emerald-700' },
  FAILED: { label: 'Gagal', cls: 'bg-red-100 text-red-700' },
}

export function ClipLibraryBoard({
  hostId,
  hostName,
  hostMode,
  hasSourceImage,
  hasVisionAnalysis: initialHasVision,
  isAdmin = false,
  backHref = '/host-templates',
}: {
  hostId: string
  hostName: string
  hostMode: 'TTS_GENERATIVE' | 'NATIVE_LIBRARY'
  hasSourceImage: boolean
  hasVisionAnalysis: boolean
  isAdmin?: boolean
  backHref?: string
}) {
  // hasVisionAnalysis dapat berubah saat auto-prep selesai — track di state.
  const [hasVisionAnalysis, setHasVisionAnalysis] = useState(initialHasVision)
  // Baseline video status — pulled dari prep-status endpoint.
  const [prepStatus, setPrepStatus] = useState<{
    visionReady: boolean
    baselineVideoReady: boolean
    baselineVideoStatus: string | null
    baselineError?: string | null
    sourceImageUrl?: string | null
    baselineVideoUrl?: string | null
  } | null>(null)
  const [voices, setVoices] = useState<Voice[] | null>(null)
  const [voicesError, setVoicesError] = useState<string | null>(null)
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('')
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [category, setCategory] = useState<string>('GREETING')
  // Baseline grid — load list dengan video preview (klingVideoId untuk lipsync, videoUrl untuk preview)
  const [baselines, setBaselines] = useState<Array<{ klingVideoId: string; name: string; videoUrl: string; durationSec: number; isPrimary: boolean; sceneId: string }> | null>(null)
  // Variant catalog (preview before generate) — load lazy saat empty baseline
  const [variantCatalog, setVariantCatalog] = useState<Array<{
    key: 'A' | 'B' | 'C'
    name: string
    category: string
    description: string
    motionScript: string
    alreadyExists: boolean
    durationSec: number
    estimatedCostUsd: number
  }> | null>(null)
  const [selectedVariants, setSelectedVariants] = useState<Array<'A' | 'B' | 'C'>>(['A', 'B', 'C'])
  const [generatingBaselines, setGeneratingBaselines] = useState(false)
  // IDLE motion picker — load 30 presets
  const [idleMotions, setIdleMotions] = useState<Array<{ id: string; label: string; category: string; emoji: string; durationSec: number }> | null>(null)
  const [selectedIdleMotion, setSelectedIdleMotion] = useState<string>('')
  const [idleMotionFilter, setIdleMotionFilter] = useState<string>('')
  const [script, setScript] = useState('')
  const [generating, setGenerating] = useState(false)
  const [sourceVideoId, setSourceVideoId] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  // Edit + delete state
  const [editingClip, setEditingClip] = useState<Clip | null>(null)
  // Attach pertanyaan low-confidence ke klip existing (close-loop analytics)
  const [attachQuestion, setAttachQuestion] = useState<string | null>(null)
  const [showBulk, setShowBulk] = useState(false)
  // Admin upload
  const [uploading, setUploading] = useState(false)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  // Analytics
  const [analytics, setAnalytics] = useState<{
    topClips: Array<{ id: string; transcript: string; category: string; useCount: number; avgConfidence: number | null }>
    lowConfidenceQuestions: Array<{ question: string; count: number; avgConfidence: number; lastSeen: string }>
    coverage: number
    totalUsages: number
  } | null>(null)

  const fetchVoices = useCallback(async () => {
    try {
      const res = await fetch('/api/elevenlabs/voices')
      const json = (await res.json()) as { success: boolean; data?: { voices: Voice[] }; error?: string }
      if (!json.success || !json.data) {
        setVoicesError(json.error ?? 'Gagal load voices')
        return
      }
      setVoices(json.data.voices)
      // Default Indonesian voice priority: Cahaya → Lunetta → any ID lang → first.
      const cahaya = json.data.voices.find((v) => v.voice_id === 'iWydkXKoiVtvdn4vLKp9')
      const lunetta = json.data.voices.find((v) => v.voice_id === 'uQyqjJGSy9EJK7ZcWe4B')
      const anyId = json.data.voices.find((v) => v.labels?.language === 'id')
      setSelectedVoiceId(
        cahaya?.voice_id ?? lunetta?.voice_id ?? anyId?.voice_id ?? json.data.voices[0]?.voice_id ?? '',
      )
    } catch (e) {
      setVoicesError((e as Error).message)
    }
  }, [])

  const fetchClips = useCallback(async () => {
    const res = await fetch(`/api/host-templates/${hostId}/clips`)
    const json = (await res.json()) as { success: boolean; data?: { clips: Clip[] } }
    if (json.success && json.data) setClips(json.data.clips)
  }, [hostId])

  const fetchAnalytics = useCallback(async () => {
    const res = await fetch(`/api/host-templates/${hostId}/clips/analytics`)
    const json = (await res.json()) as {
      success: boolean
      data?: typeof analytics
    }
    if (json.success && json.data) setAnalytics(json.data)
  }, [hostId])

  const fetchPrepStatus = useCallback(async () => {
    const res = await fetch(`/api/host-templates/${hostId}/clips/prep-status`)
    const json = (await res.json()) as {
      success: boolean
      data?: typeof prepStatus
    }
    if (json.success && json.data) {
      setPrepStatus(json.data)
      if (json.data.visionReady) setHasVisionAnalysis(true)
    }
  }, [hostId])

  // Fetch baselines + idle motions sekali di mount
  const fetchBaselines = useCallback(async () => {
    const res = await fetch(`/api/host-templates/${hostId}/baselines`)
    const j = (await res.json()) as { success: boolean; data?: { baselines: typeof baselines } }
    if (j.success && j.data?.baselines) {
      setBaselines(j.data.baselines)
      // Auto-set sourceVideoId ke primary kalau ada, else baseline pertama
      const primary = j.data.baselines.find((b) => b.isPrimary) ?? j.data.baselines[0]
      if (primary) setSourceVideoId(primary.klingVideoId)
    }
  }, [hostId])
  const fetchIdleMotions = useCallback(async () => {
    const res = await fetch('/api/clip-library/idle-motions')
    const j = (await res.json()) as { success: boolean; data?: { motions: typeof idleMotions } }
    if (j.success && j.data?.motions) setIdleMotions(j.data.motions)
  }, [])
  const fetchVariantCatalog = useCallback(async () => {
    const res = await fetch(`/api/host-templates/${hostId}/baselines/variants`)
    const j = (await res.json()) as { success: boolean; data?: { variants: typeof variantCatalog } }
    if (j.success && j.data?.variants) {
      setVariantCatalog(j.data.variants)
      // Default ke varian yg BELUM exist
      const notYet = j.data.variants.filter((v) => !v.alreadyExists).map((v) => v.key)
      if (notYet.length > 0) setSelectedVariants(notYet)
    }
  }, [hostId])
  const handleGenerateBaselines = useCallback(async () => {
    if (selectedVariants.length === 0) {
      toast.error('Pilih minimal 1 varian')
      return
    }
    const cost = selectedVariants.length * 1.5
    if (!confirm(`Generate ${selectedVariants.length} baseline (~$${cost.toFixed(2)} = ~Rp ${(cost * 17000).toLocaleString('id-ID')})? Tunggu ~3 menit per varian.`)) {
      return
    }
    setGeneratingBaselines(true)
    try {
      const res = await fetch(`/api/host-templates/${hostId}/baselines/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variantKeys: selectedVariants }),
      })
      const j = (await res.json()) as { success: boolean; data?: { submitted: number; message: string }; error?: string }
      if (!j.success) throw new Error(j.error ?? 'Generate gagal')
      toast.success(j.data?.message ?? `${j.data?.submitted ?? 0} baseline submitted`)
      // Re-fetch setelah delay supaya scene baru muncul (status: DRAFT → READY)
      setTimeout(() => {
        void fetchBaselines()
        void fetchVariantCatalog()
      }, 2000)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGeneratingBaselines(false)
    }
  }, [hostId, selectedVariants, fetchBaselines, fetchVariantCatalog])

  useEffect(() => {
    void fetchVoices()
    void fetchClips()
    void fetchAnalytics()
    void fetchPrepStatus()
    void fetchBaselines()
    void fetchIdleMotions()
    void fetchVariantCatalog()
  }, [fetchVoices, fetchClips, fetchAnalytics, fetchPrepStatus, fetchBaselines, fetchIdleMotions, fetchVariantCatalog])

  // Auto-poll prep-status tiap 6dtk kalau belum ready (vision atau baseline video)
  useEffect(() => {
    if (!prepStatus) return
    if (prepStatus.visionReady && prepStatus.baselineVideoReady) return
    const t = setInterval(() => void fetchPrepStatus(), 6000)
    return () => clearInterval(t)
  }, [prepStatus, fetchPrepStatus])

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/host-templates/${hostId}/analyze-image`, { method: 'POST' })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!json.success) {
        toast.error(json.error ?? 'Vision analyze gagal')
      } else {
        toast.success('Vision analyze sukses — reload halaman buat ke step generate klip')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleReembedBackfill() {
    if (!confirm('Re-embed semua klip yang belum punya embedding? Cost ~Rp 1/klip.')) return
    try {
      const res = await fetch(`/api/host-templates/${hostId}/clips/embed-backfill`, {
        method: 'POST',
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { total: number; succeeded: number; failed: number }
        error?: string
      }
      if (json.success && json.data) {
        toast.success(
          `Re-embed selesai: ${json.data.succeeded}/${json.data.total} sukses${
            json.data.failed > 0 ? `, ${json.data.failed} gagal` : ''
          }`,
        )
        void fetchClips()
      } else {
        toast.error(json.error ?? 'Backfill gagal')
      }
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function handleDelete(clip: Clip) {
    const used = clip.useCount > 0
    const force = used
      ? confirm(`Klip ini sudah dipakai ${clip.useCount}x. Yakin hapus?`)
      : confirm('Hapus klip ini? File MP4 + MP3 juga dihapus dari disk.')
    if (!force) return
    const url = `/api/host-templates/${hostId}/clips/${clip.id}${used ? '?force=true' : ''}`
    const res = await fetch(url, { method: 'DELETE' })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (json.success) {
      toast.success('Klip dihapus')
      void fetchClips()
    } else {
      toast.error(json.error ?? 'Gagal hapus')
    }
  }

  async function handleAdminUpload(file: File) {
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/admin/host-templates/${hostId}/clips/upload`, {
        method: 'POST',
        body: form,
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { transcript: string; suggestedCategory: string; suggestedTags: string[] }
        error?: string
      }
      if (json.success && json.data) {
        toast.success(
          `Upload OK. Transcript: "${json.data.transcript.slice(0, 60)}…" Suggested: ${json.data.suggestedCategory}`,
        )
        void fetchClips()
      } else {
        toast.error(json.error ?? 'Upload gagal')
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setUploading(false)
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      let res: Response
      // IDLE category pakai endpoint khusus — Kling image2video langsung, no TTS
      if (category === 'IDLE') {
        if (!selectedIdleMotion) {
          toast.error('Pilih motion preset dulu')
          return
        }
        res = await fetch(`/api/host-templates/${hostId}/clips/idle-motion`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ motionPresetId: selectedIdleMotion }),
        })
      } else {
        if (!script.trim() || script.length < 3) {
          toast.error('Tulis script dulu')
          return
        }
        res = await fetch(`/api/host-templates/${hostId}/clips`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            script: script.trim(),
            category,
            voiceId: selectedVoiceId || undefined,
            sourceVideoId: sourceVideoId.trim() || undefined,
          }),
        })
      }
      const json = (await res.json()) as {
        success: boolean
        data?: { clipId: string; status?: string; videoUrl?: string; errorMessage?: string }
        error?: string
      }
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'Generate gagal')
        return
      }
      const status = json.data.status ?? 'READY'
      if (status === 'READY') {
        toast.success(category === 'IDLE' ? 'Klip IDLE motion siap!' : 'Klip siap!')
      } else if (status === 'FAILED') {
        toast.error(`Klip gagal: ${json.data.errorMessage ?? '?'}`)
      } else {
        toast(`Klip status: ${status}`)
      }
      setScript('')
      setSelectedIdleMotion('')
      void fetchClips()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  // Pre-req checks — kalau belum siap, tampilkan guide.
  if (hostMode !== 'NATIVE_LIBRARY') {
    return (
      <PrereqWarning
        title="Host bukan mode Klip Live"
        message="Halaman ini hanya untuk host mode Klip Live (NATIVE_LIBRARY). Host saat ini = TTS Host. Buat host baru pilih Klip Live mode, atau migrate via admin tool."
        backHref={backHref}
      />
    )
  }
  if (!hasSourceImage) {
    return (
      <PrereqWarning
        title="Belum ada source image"
        message="Generate image dulu sebelum bisa bikin klip. Klik 'Generate Image' di halaman host detail."
        backHref={backHref}
      />
    )
  }
  // Pre-req auto-prep: vision + baseline video. Tampil panel progress kalau
  // salah satu belum ready. Auto-poll tiap 6dtk sampai keduanya ready.
  const visionReady = hasVisionAnalysis || prepStatus?.visionReady
  const baselineReady = prepStatus?.baselineVideoReady ?? false
  const baselineStatus = prepStatus?.baselineVideoStatus ?? null
  if (!visionReady || !baselineReady) {
    return (
      <div className="space-y-4">
        <Link href={backHref} className="text-xs text-muted-foreground hover:underline">
          ← Kembali
        </Link>
        <h1 className="text-xl font-semibold">🎙️ Klip Live — {hostName}</h1>
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="text-sm font-semibold">
              ⏳ Menyiapkan host untuk Klip Live…
            </div>
            <p className="text-xs text-muted-foreground">
              Setelah image ready, sistem auto-jalankan vision analyzer + generate
              baseline silent loop video (sumber lipsync untuk semua klip nanti).
              Tunggu sampai keduanya ready (~1-2 menit).
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-warm-50 p-2.5">
                {visionReady ? (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                ) : (
                  <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-amber-500" />
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium">Vision Analyzer (Claude Vision)</div>
                  <div className="text-[10px] text-warm-500">
                    Analisis pose host, visual hook, background motion, dan produk di scene
                    untuk adaptive Kling prompt.
                  </div>
                </div>
                {!visionReady ? (
                  <Button onClick={handleAnalyze} disabled={analyzing} size="sm" variant="outline">
                    {analyzing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Trigger Manual'}
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-warm-50 p-2.5">
                {baselineReady ? (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                ) : baselineStatus === 'FAILED' ? (
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
                ) : (
                  <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-amber-500" />
                )}
                <div className="flex-1">
                  <div className="text-sm font-medium">Baseline Silent Loop (Kling)</div>
                  <div className="text-[10px] text-warm-500">
                    Generate 1 video silent dari image (Kling image2video) — dipakai sebagai
                    sumber video untuk semua lipsync klip. Status:{' '}
                    <strong>{baselineStatus ?? 'belum dimulai'}</strong>
                  </div>
                  {prepStatus?.baselineError ? (
                    <div className="mt-1 text-[10px] text-red-700">
                      ⚠️ {prepStatus.baselineError.slice(0, 200)}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground">
              💡 Auto-refresh tiap 6dtk. Status update otomatis di halaman ini.
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={backHref} className="text-xs text-muted-foreground hover:underline">
            ← Kembali ke host list
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            🎙️ Klip Live — {hostName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate klip dengan suara natural + lip-sync presisi. Tiap klip akan jadi opsi untuk match pertanyaan customer live.
          </p>
          {/* Persistent prep status row — clarity untuk owner */}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
              <CheckCircle2 className="h-2.5 w-2.5" /> Vision analyzed
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700">
              <CheckCircle2 className="h-2.5 w-2.5" /> Baseline video ready
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 font-medium text-sky-700">
              🎙️ {voices?.length ?? 0} voices loaded
            </span>
          </div>
        </div>
      </div>

      {/* Preview header: source image + baseline silent video side-by-side */}
      {prepStatus?.sourceImageUrl || prepStatus?.baselineVideoUrl ? (
        <Card>
          <CardContent className="p-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-warm-600">
              Asset host — preview
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {prepStatus?.sourceImageUrl ? (
                <div>
                  <div className="mb-1 text-[10px] font-medium text-warm-500">
                    🖼️ Source Image (Gemini)
                  </div>
                  <img
                    src={prepStatus.sourceImageUrl}
                    alt={`${hostName} source`}
                    className="aspect-[9/16] max-h-72 w-full rounded-lg border border-warm-200 bg-black object-contain"
                  />
                </div>
              ) : null}
              {prepStatus?.baselineVideoUrl ? (
                <div>
                  <div className="mb-1 text-[10px] font-medium text-warm-500">
                    🎬 Baseline Silent Video (Kling) — sumber lipsync semua klip
                  </div>
                  <video
                    src={prepStatus.baselineVideoUrl}
                    controls
                    muted
                    loop
                    className="aspect-[9/16] max-h-72 w-full rounded-lg border border-warm-200 bg-black object-contain"
                  />
                  <div className="mt-1 text-[9px] text-warm-500">
                    File: <code>{prepStatus.baselineVideoUrl}</code>
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Voice picker — card grid, filter Indonesian default, preview + test */}
      <VoicePickerCard
        voices={voices}
        voicesError={voicesError}
        selectedVoiceId={selectedVoiceId}
        onSelect={setSelectedVoiceId}
      />

      {/* Generate form */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">+ Generate klip baru</h2>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowBulk(true)}
              className="border-orange-300 text-orange-700 hover:bg-orange-50"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Bulk Generate (AI)
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label htmlFor="category-select" className="text-xs font-semibold uppercase tracking-wide text-warm-600">
                Kategori
              </label>
              <select
                id="category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-warm-200 bg-white px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label} — {c.hint}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {/* Baseline grid preview — span 2 col, video auto-play biar owner langsung tau motion variant */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
              Pilih Baseline {baselines && baselines.length > 0 ? `(${baselines.length} tersedia)` : ''}
            </label>
            {baselines === null ? (
              <div className="mt-1 text-xs text-warm-500">Loading…</div>
            ) : baselines.length === 0 ? (
              <div className="mt-1 space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                <div className="text-xs font-semibold text-amber-900">
                  ⚠️ Belum ada baseline — preview 3 varian motion di bawah, pilih yang mau, konfirm baru generate.
                </div>
                {variantCatalog === null ? (
                  <div className="text-[10px] text-warm-500">Loading varian…</div>
                ) : (
                  <>
                    <div className="grid gap-2 md:grid-cols-3">
                      {variantCatalog.map((v) => {
                        const checked = selectedVariants.includes(v.key)
                        return (
                          <label
                            key={v.key}
                            className={`group cursor-pointer rounded-md border-2 bg-white p-2 transition ${
                              checked ? 'border-orange-500 shadow-sm' : 'border-warm-200 hover:border-warm-300'
                            } ${v.alreadyExists ? 'opacity-50' : ''}`}
                          >
                            <div className="flex items-start gap-1.5">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={v.alreadyExists}
                                onChange={() => {
                                  if (v.alreadyExists) return
                                  setSelectedVariants((prev) =>
                                    prev.includes(v.key) ? prev.filter((k) => k !== v.key) : [...prev, v.key],
                                  )
                                }}
                                className="mt-0.5 h-3.5 w-3.5 accent-orange-500"
                              />
                              <div className="flex-1">
                                <div className="text-[11px] font-bold">{v.name}</div>
                                <div className="text-[9px] text-warm-600">{v.description}</div>
                                {v.alreadyExists ? (
                                  <span className="mt-0.5 inline-block rounded bg-emerald-100 px-1 py-px text-[8px] text-emerald-700">
                                    ✓ udah ada
                                  </span>
                                ) : (
                                  <span className="mt-0.5 inline-block text-[9px] text-warm-500">
                                    ~${v.estimatedCostUsd.toFixed(2)} · {v.durationSec}s
                                  </span>
                                )}
                              </div>
                            </div>
                            <details className="mt-1.5 border-t border-warm-100 pt-1">
                              <summary className="cursor-pointer text-[9px] font-semibold uppercase tracking-wide text-warm-500 hover:text-warm-700">
                                Lihat motion script
                              </summary>
                              <pre className="mt-1 max-h-32 overflow-auto rounded bg-warm-50 p-1.5 text-[8px] leading-tight text-warm-700 whitespace-pre-wrap">
                                {v.motionScript}
                              </pre>
                            </details>
                          </label>
                        )
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-amber-200 pt-2">
                      <div className="text-[10px] text-warm-600">
                        Pilih: <strong>{selectedVariants.length}</strong> varian · est. cost{' '}
                        <strong>${(selectedVariants.length * 1.5).toFixed(2)}</strong> (~Rp{' '}
                        {(selectedVariants.length * 1.5 * 17000).toLocaleString('id-ID')})
                      </div>
                      <Button
                        size="sm"
                        onClick={handleGenerateBaselines}
                        disabled={generatingBaselines || selectedVariants.length === 0}
                        className="bg-orange-600 hover:bg-orange-700"
                      >
                        {generatingBaselines ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Submitting…
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-1 h-3 w-3" /> Generate {selectedVariants.length} baseline
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {baselines.map((b) => {
                  const active = sourceVideoId === b.klingVideoId
                  return (
                    <button
                      key={b.klingVideoId}
                      type="button"
                      onClick={() => setSourceVideoId(b.klingVideoId)}
                      className={`group relative flex flex-col overflow-hidden rounded-lg border-2 transition ${
                        active
                          ? 'border-orange-500 shadow-md ring-2 ring-orange-200'
                          : 'border-warm-200 hover:border-orange-300'
                      }`}
                    >
                      {active ? (
                        <CheckCircle2 className="absolute right-1.5 top-1.5 z-10 h-4 w-4 rounded-full bg-white text-orange-600" />
                      ) : null}
                      {b.isPrimary ? (
                        <span className="absolute left-1.5 top-1.5 z-10 rounded bg-amber-500 px-1.5 py-px text-[8px] font-bold text-white shadow">
                          ⭐ Default
                        </span>
                      ) : null}
                      <video
                        src={b.videoUrl}
                        className="aspect-[9/16] w-full bg-black object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                      />
                      <div className="bg-white px-1.5 py-1 text-left">
                        <div className="line-clamp-1 text-[10px] font-semibold">{b.name}</div>
                        <div className="text-[9px] text-warm-500">{b.durationSec}s</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            <p className="mt-1 text-[10px] text-warm-500">
              💡 Klip lipsync inherit gerakan dari baseline ini. Pilih variant yang cocok sama kategori klip.
            </p>
            {baselines && baselines.length > 0 && variantCatalog && variantCatalog.some((v) => !v.alreadyExists) ? (
              <details className="mt-2 rounded border border-warm-200 bg-warm-50 px-2 py-1.5">
                <summary className="cursor-pointer text-[10px] font-semibold text-warm-700 hover:text-orange-700">
                  + Tambah varian motion lain ({variantCatalog.filter((v) => !v.alreadyExists).length} belum dibuat)
                </summary>
                <div className="mt-2 space-y-2">
                  {variantCatalog
                    .filter((v) => !v.alreadyExists)
                    .map((v) => {
                      const checked = selectedVariants.includes(v.key)
                      return (
                        <label key={v.key} className="flex items-start gap-1.5 rounded bg-white p-1.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedVariants((prev) =>
                                prev.includes(v.key) ? prev.filter((k) => k !== v.key) : [...prev, v.key],
                              )
                            }}
                            className="mt-0.5 h-3.5 w-3.5 accent-orange-500"
                          />
                          <div className="flex-1">
                            <div className="text-[11px] font-bold">{v.name}</div>
                            <div className="text-[9px] text-warm-600">{v.description}</div>
                          </div>
                        </label>
                      )
                    })}
                  <Button
                    size="sm"
                    onClick={handleGenerateBaselines}
                    disabled={generatingBaselines || selectedVariants.length === 0}
                    className="w-full bg-orange-600 hover:bg-orange-700"
                  >
                    {generatingBaselines ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Submitting…
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-1 h-3 w-3" /> Generate ({selectedVariants.length}) · ~$
                        {(selectedVariants.length * 1.5).toFixed(2)}
                      </>
                    )}
                  </Button>
                </div>
              </details>
            ) : null}
          </div>
          {category === 'IDLE' ? (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
                Pilih Motion Idle — host gerakan menarik, no suara
              </label>
              <div className="mt-1 mb-2 flex flex-wrap gap-1">
                {[{ value: '', label: 'Semua' }, ...['subtle','playful','energetic','dance','interact'].map((c) => ({ value: c, label: c }))].map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setIdleMotionFilter(f.value)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                      idleMotionFilter === f.value
                        ? 'bg-orange-500 text-white'
                        : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              {idleMotions === null ? (
                <div className="text-xs text-warm-500">Loading…</div>
              ) : (
                <div className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto rounded-lg border border-warm-200 bg-warm-50/40 p-2 sm:grid-cols-4 md:grid-cols-5">
                  {idleMotions
                    .filter((m) => !idleMotionFilter || m.category === idleMotionFilter)
                    .map((m) => {
                      const active = selectedIdleMotion === m.id
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedIdleMotion(m.id)}
                          title={m.label}
                          className={`relative flex aspect-square flex-col items-center justify-center rounded-lg border-2 p-1.5 text-center transition ${
                            active
                              ? 'border-orange-500 bg-orange-50 shadow-md'
                              : 'border-warm-200 bg-white hover:border-orange-300'
                          }`}
                        >
                          {active ? <CheckCircle2 className="absolute right-1 top-1 h-3 w-3 text-orange-600" /> : null}
                          <span className="text-2xl">{m.emoji}</span>
                          <span className="mt-0.5 line-clamp-2 text-[9px] font-semibold leading-tight">{m.label}</span>
                          <span className="text-[8px] text-warm-500">{m.durationSec}s</span>
                        </button>
                      )
                    })}
                </div>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                💡 Klip IDLE = video silent (no suara). Loop saat tidak ada chat customer.
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="script" className="text-xs font-semibold uppercase tracking-wide text-warm-600">
                Script (yang host akan ucapkan)
              </label>
              <textarea
                id="script"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={3}
                placeholder="Contoh: Halo kak sayang, di Cleanoz lagi flash sale 49rb aja sampai jam 2 sore!"
                className="mt-1 w-full rounded-md border border-warm-200 bg-white px-3 py-2 text-sm placeholder-warm-400"
                maxLength={2500}
              />
              {(() => {
                const baselineSec = (prepStatus as { baselineDurationSec?: number } | null)?.baselineDurationSec ?? 5
                const baselineMs = baselineSec * 1000
                const maxSafe = Math.max(10, Math.floor((baselineMs - 400) / 72) - 4)
                const estSec = ((script.length * 72 + 400) / 1000).toFixed(1)
                const overBudget = script.length > maxSafe
                const pct = Math.min(100, (script.length / maxSafe) * 100)
                return (
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className={overBudget ? 'font-bold text-red-700' : 'text-warm-600'}>
                        {overBudget ? (
                          <>⚠️ Script terlalu panjang — audio {estSec}s, video cuma {baselineSec}s</>
                        ) : (
                          <>✓ Pas — audio {estSec}s, video {baselineSec}s</>
                        )}
                      </span>
                      <span className="tabular-nums text-warm-500">
                        {script.length}/{maxSafe} karakter
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-warm-100">
                      <div
                        className={`h-full transition-all ${
                          pct > 100 ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    {overBudget ? (
                      <div className="rounded bg-red-50 px-1.5 py-1 text-[10px] text-red-700">
                        Bagian akhir script bakal kepotong. Pendekin atau pilih baseline yang lebih panjang.
                      </div>
                    ) : null}
                  </div>
                )
              })()}
            </div>
          )}
          <Button
            onClick={handleGenerate}
            disabled={
              generating ||
              (category === 'IDLE' ? !selectedIdleMotion : script.trim().length < 3) ||
              (category !== 'IDLE' && !selectedVoiceId)
            }
            className="w-full md:w-auto"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating… (max 2 menit)
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Generate Klip
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Test Match — simulate customer question, lihat klip mana yg play */}
      {clips && clips.length > 0 ? (
        <Card className="border-orange-200 bg-orange-50/30">
          <CardContent className="space-y-2 p-4">
            <TestMatchPanel hostId={hostId} clips={clips} />
          </CardContent>
        </Card>
      ) : null}

      {/* Analytics widget — show kalau library punya usage */}
      {analytics && analytics.totalUsages > 0 ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">📊 Analytics</h2>
              <div className="flex items-center gap-3 text-xs">
                <span>
                  <span className="font-bold text-emerald-600">{analytics.coverage}%</span> coverage
                </span>
                <span className="text-warm-500">
                  {analytics.totalUsages} chat matched
                </span>
              </div>
            </div>

            {analytics.topClips.length > 0 ? (
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-warm-600">
                  Top 5 klip paling dipakai
                </div>
                <div className="space-y-1">
                  {analytics.topClips.map((c, i) => (
                    <div key={c.id} className="flex items-start gap-2 rounded-md bg-warm-50 px-2 py-1.5">
                      <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-[10px] font-bold text-white">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="line-clamp-1 text-xs font-medium">{c.transcript}</div>
                        <div className="text-[10px] text-warm-500">
                          {c.category} · {c.useCount} dipakai
                          {c.avgConfidence ? ` · avg conf ${(c.avgConfidence * 100).toFixed(0)}%` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {analytics.lowConfidenceQuestions.length > 0 ? (
              <div className="border-t border-warm-200 pt-3">
                <div className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                  ⚠️ Topik tidak ke-cover — rekam klip untuk ini
                </div>
                <p className="mb-2 text-[10px] text-muted-foreground">
                  Customer nanya soal ini tapi confidence match rendah. Pilih: tunjuk klip yang udah ada (jadiin trigger),
                  atau bikin klip baru khusus.
                </p>
                <div className="space-y-1.5">
                  {analytics.lowConfidenceQuestions.map((q, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-amber-200 bg-amber-50/50 px-2 py-1.5"
                    >
                      <div className="flex items-start gap-2">
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                          {q.count}×
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="line-clamp-2 text-xs font-medium">"{q.question}"</div>
                          <div className="text-[10px] text-warm-500">
                            Avg confidence {(q.avgConfidence * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setAttachQuestion(q.question)}
                          className="rounded bg-orange-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-orange-700"
                        >
                          🎯 Tunjuk klip yang udah ada
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setScript(`Hmm soal ${q.question}... `)
                            window.scrollTo({ top: 0, behavior: 'smooth' })
                          }}
                          className="rounded border border-amber-300 bg-white px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-50"
                        >
                          + Bikin klip baru
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Edit modal */}
      {editingClip ? (
        <EditClipModal
          clip={editingClip}
          hostId={hostId}
          onClose={() => setEditingClip(null)}
          onSaved={() => {
            setEditingClip(null)
            void fetchClips()
          }}
        />
      ) : null}

      {/* Attach question → existing clip (close-loop analytics) */}
      {attachQuestion && clips ? (
        <AttachQuestionToClipModal
          hostId={hostId}
          question={attachQuestion}
          clips={clips}
          onClose={() => setAttachQuestion(null)}
          onAttached={() => {
            setAttachQuestion(null)
            void fetchClips()
            void fetchAnalytics()
          }}
        />
      ) : null}

      {/* Bulk Generate modal */}
      {showBulk && selectedVoiceId && voices ? (
        <BulkGenerateModal
          hostId={hostId}
          voiceId={selectedVoiceId}
          voiceName={voices.find((v) => v.voice_id === selectedVoiceId)?.name ?? selectedVoiceId}
          onClose={() => setShowBulk(false)}
          onStarted={() => {
            setShowBulk(false)
            void fetchClips()
            // Auto-refresh clips tiap 30dtk untuk catch progress bulk
            const interval = setInterval(() => {
              void fetchClips()
            }, 30000)
            // Clear after 30 menit
            setTimeout(() => clearInterval(interval), 30 * 60 * 1000)
          }}
        />
      ) : null}

      {/* Clips list */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Library Klip</h2>
            <div className="flex flex-wrap items-center gap-2">
              {clips && clips.some((c) => c.status === 'READY' && !c.errorMessage) ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleReembedBackfill()}
                  title="Sync klip ke model embedding baru — pakai kalau abis enable model OpenAI baru"
                >
                  <Sparkles className="mr-1.5 h-3 w-3" />
                  Sync embed
                </Button>
              ) : null}
              {isAdmin ? (
                <>
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void handleAdminUpload(f)
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => uploadInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                        Whisper…
                      </>
                    ) : (
                      <>
                        <Upload className="mr-1.5 h-3 w-3" />
                        Upload Klip (Admin)
                      </>
                    )}
                  </Button>
                </>
              ) : null}
              <span className="text-xs text-warm-500">
                {clips === null ? '…' : `${clips.length} klip`}
              </span>
            </div>
          </div>
          {/* Coverage view — grid kategori, kelihatan langsung mana yg kosong */}
          {clips && clips.length > 0 ? (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-warm-500">
                Cakupan per kategori
              </div>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-7">
                {CATEGORIES.map((c) => {
                  const readyClips = clips.filter((x) => x.category === c.value && x.status === 'READY')
                  const count = readyClips.length
                  const isEmpty = count === 0
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => {
                        setCategory(c.value)
                        const formEl = document.getElementById('category-select')
                        formEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }}
                      className={`rounded-md border px-2 py-1.5 text-left transition hover:shadow-sm ${
                        isEmpty
                          ? 'border-red-200 bg-red-50 hover:border-red-400'
                          : count < 2
                          ? 'border-amber-200 bg-amber-50 hover:border-amber-400'
                          : 'border-emerald-200 bg-emerald-50 hover:border-emerald-400'
                      }`}
                      title={isEmpty ? `Belum ada klip ${c.label} — klik buat tambah` : `${count} klip ${c.label}`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[10px] font-semibold">{c.label}</span>
                        <span
                          className={`text-[11px] font-bold tabular-nums ${
                            isEmpty ? 'text-red-700' : count < 2 ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {isEmpty ? '⚠️ 0' : count}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
              <p className="mt-1 text-[10px] text-warm-500">
                🔴 0 klip = customer tanya hal itu, host gak bisa jawab. Klik kategori → langsung ke form generate.
              </p>
            </div>
          ) : null}
          {clips === null ? (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </div>
          ) : clips.length === 0 ? (
            <div className="space-y-3 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-orange-500" />
                Belum ada klip — bikin library starter dulu
              </div>
              <p className="text-xs text-muted-foreground">
                Saran skenario minimum buat live shopping host yang siap pakai. Tiap klip ~Rp 5-8rb (ElevenLabs + Kling lipsync).
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {[
                  { cat: 'GREETING', label: 'Sapaan customer', example: 'Halo kak sayang, welcome ke live Cleanoz!' },
                  { cat: 'PRICE', label: 'Jawab harga', example: 'Harganya 49rb aja kak, flash sale sampai jam 2!' },
                  { cat: 'PRODUCT_DEMO', label: 'Demo manfaat', example: 'Cleanoz ini bahan alami, aman buat sensitive skin.' },
                  { cat: 'OBJECTION', label: 'Handle keberatan', example: 'Iya aku tau mahal, tapi worth-it banget.' },
                  { cat: 'CLOSING', label: 'Closing push', example: 'Yuk klik kartu produk, stocknya tinggal sedikit!' },
                  { cat: 'IDLE', label: 'Loop sepi (wajib)', example: '(diam senyum, tanpa bicara — untuk loop saat tidak ada interaksi)' },
                ].map((s) => (
                  <button
                    key={s.cat}
                    type="button"
                    onClick={() => {
                      setCategory(s.cat)
                      setScript(s.example.includes('diam') ? '' : s.example)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="rounded-lg border border-orange-200 bg-white px-3 py-2 text-left transition hover:border-orange-400 hover:bg-orange-50"
                  >
                    <div className="text-xs font-semibold">{s.label}</div>
                    <div className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{s.example}</div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                💡 <strong>Catatan</strong>: minimal 1 klip kategori <code>IDLE</code> atau yang ditandai <em>Default Idle</em> WAJIB sebelum live bisa dibuka — buat loop saat tidak ada interaksi.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {clips.map((c) => {
                const badge = STATUS_BADGE[c.status] ?? { label: c.status, cls: 'bg-warm-100 text-warm-700' }
                return (
                  <div
                    key={c.id}
                    className="flex flex-col gap-3 rounded-lg border border-warm-200 bg-white p-3 sm:flex-row sm:items-start"
                  >
                    {/* Video preview kiri — full 9:16 aspect ratio */}
                    {c.videoUrl ? (
                      <video
                        src={c.videoUrl}
                        controls
                        playsInline
                        className="aspect-[9/16] w-full max-w-[200px] flex-shrink-0 rounded-lg bg-black object-contain shadow-sm"
                      />
                    ) : c.status === 'READY' ? (
                      <div className="flex aspect-[9/16] w-full max-w-[200px] flex-shrink-0 items-center justify-center rounded-lg bg-warm-50">
                        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                      </div>
                    ) : c.status.startsWith('GENERATING') || c.status === 'DRAFT' || c.status === 'PROCESSING_EMBEDDING' ? (
                      <div className="flex aspect-[9/16] w-full max-w-[200px] flex-shrink-0 items-center justify-center rounded-lg bg-warm-50">
                        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
                      </div>
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className={badge.cls}>{badge.label}</Badge>
                        <span className="rounded-full bg-warm-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warm-700">
                          {c.category}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${c.source === 'UPLOADED' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>
                          {c.source === 'UPLOADED' ? '📎 Upload' : '⚡ Generated'}
                        </span>
                        {c.isDefaultIdle ? (
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                            Default Idle
                          </span>
                        ) : null}
                        {c.isEvergreen ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                            🌲 Evergreen
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-warm-800">{c.scriptOriginal}</p>
                      {c.tags && c.tags.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.tags.map((t) => (
                            <span key={t} className="rounded bg-warm-50 px-1.5 py-px text-[9px] font-medium text-warm-600">
                              #{t}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      {c.errorMessage ? (
                        <div className="mt-1 flex items-start gap-1 text-xs text-red-700">
                          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                          <span>{c.errorMessage.slice(0, 200)}</span>
                        </div>
                      ) : null}
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-warm-500">
                        <span>{c.useCount} dipakai</span>
                        {c.durationMs ? <span>· {(c.durationMs / 1000).toFixed(1)}s</span> : null}
                        {c.audioUrl ? <span>· audio: <a href={c.audioUrl} className="underline">MP3</a></span> : null}
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => setEditingClip(c)}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        {c.status === 'FAILED' && c.source === 'GENERATED' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs text-orange-700 hover:bg-orange-50"
                            onClick={async () => {
                              // Retry = re-trigger generate dengan script + category sama.
                              // Delete failed dulu, lalu re-generate.
                              if (!confirm('Retry generate klip ini (akan hapus yang gagal lalu re-run pipeline)?')) return
                              await fetch(`/api/host-templates/${hostId}/clips/${c.id}?force=true`, { method: 'DELETE' })
                              const res = await fetch(`/api/host-templates/${hostId}/clips`, {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({
                                  script: c.scriptOriginal,
                                  category: c.category,
                                  voiceId: selectedVoiceId,
                                }),
                              })
                              const j = (await res.json()) as { success: boolean; error?: string }
                              if (j.success) {
                                toast.success('Retry sukses')
                                void fetchClips()
                              } else {
                                toast.error(j.error ?? 'Retry gagal')
                              }
                            }}
                          >
                            <Sparkles className="mr-1 h-3 w-3" />
                            Retry
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs text-red-700 hover:bg-red-50"
                          onClick={() => void handleDelete(c)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Hapus
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface SharedVoice {
  voice_id: string
  public_owner_id: string
  name: string
  gender?: string
  language?: string
  accent?: string
  descriptive?: string
  preview_url?: string
  free_users_allowed?: boolean
}

function VoicePickerCard({
  voices,
  voicesError,
  selectedVoiceId,
  onSelect,
}: {
  voices: Voice[] | null
  voicesError: string | null
  selectedVoiceId: string
  onSelect: (id: string) => void
}) {
  const [filter, setFilter] = useState<'id' | 'en' | 'all'>('id')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [testText, setTestText] = useState('Halo kak, welcome ke live kami!')
  const [testing, setTesting] = useState(false)
  const [showBrowse, setShowBrowse] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  function playPreview(url: string, voiceId: string) {
    // Stop existing
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (playingId === voiceId) {
      setPlayingId(null)
      return
    }
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => setPlayingId(null)
    audio.onerror = () => {
      toast.error('Preview gagal play')
      setPlayingId(null)
    }
    audio.play().catch(() => {
      toast.error('Browser block autoplay')
      setPlayingId(null)
    })
    setPlayingId(voiceId)
  }

  async function testVoice() {
    if (!selectedVoiceId || !testText.trim()) return
    setTesting(true)
    try {
      const res = await fetch('/api/elevenlabs/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ voiceId: selectedVoiceId, text: testText.trim() }),
      })
      const j = (await res.json()) as {
        success: boolean
        data?: { audioUrl: string }
        error?: string
      }
      if (j.success && j.data) {
        playPreview(j.data.audioUrl, 'test-' + selectedVoiceId)
      } else {
        toast.error(j.error ?? 'Test voice gagal')
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  const filteredVoices = (voices ?? []).filter((v) => {
    const lang = v.labels?.language
    if (filter === 'id') return lang === 'id'
    if (filter === 'en') return lang === 'en'
    return true
  })
  const idCount = (voices ?? []).filter((v) => v.labels?.language === 'id').length
  const enCount = (voices ?? []).filter((v) => v.labels?.language === 'en').length

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Mic className="mt-0.5 h-5 w-5 flex-shrink-0 text-orange-500" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Suara host</div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Pilih suara untuk semua klip. Klik 🔊 dengar preview, atau ketik teks test di bawah.
                </p>
              </div>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setFilter('id')}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                    filter === 'id' ? 'bg-orange-500 text-white' : 'bg-warm-100 text-warm-700'
                  }`}
                >
                  🇮🇩 ID ({idCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('en')}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                    filter === 'en' ? 'bg-orange-500 text-white' : 'bg-warm-100 text-warm-700'
                  }`}
                >
                  🇺🇸 EN ({enCount})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                    filter === 'all' ? 'bg-orange-500 text-white' : 'bg-warm-100 text-warm-700'
                  }`}
                >
                  Semua ({voices?.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setShowBrowse(true)}
                  className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-200"
                >
                  + Browse Library
                </button>
              </div>
            </div>

            {voicesError ? (
              <div className="mt-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
                Gagal load: {voicesError}
              </div>
            ) : voices === null ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading…
              </div>
            ) : filteredVoices.length === 0 ? (
              <div className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-700">
                ⚠️ Tidak ada voice {filter === 'id' ? 'Indonesian' : 'English'} di library kamu. Tambah voice dari ElevenLabs Voice Library (filter language=Indonesian). Cahaya & Lunetta itu gratis untuk subscriber.
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {filteredVoices.map((v) => {
                  const active = selectedVoiceId === v.voice_id
                  const isPlaying = playingId === v.voice_id
                  const lang = v.labels?.language
                  const isId = lang === 'id'
                  return (
                    <button
                      key={v.voice_id}
                      type="button"
                      onClick={() => onSelect(v.voice_id)}
                      className={`relative flex flex-col gap-1 rounded-lg border-2 p-2.5 text-left transition ${
                        active
                          ? 'border-orange-500 bg-orange-50 shadow-md'
                          : 'border-warm-200 bg-white hover:border-orange-300'
                      }`}
                    >
                      {active ? (
                        <CheckCircle2 className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-orange-600" />
                      ) : null}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px]">{isId ? '🇮🇩' : '🇺🇸'}</span>
                        <span className="line-clamp-1 text-xs font-semibold">{v.name.split(' - ')[0]}</span>
                      </div>
                      <div className="line-clamp-1 text-[9px] text-warm-500">
                        {v.labels?.gender} · {v.labels?.age} · {v.labels?.descriptive ?? v.category}
                      </div>
                      {v.preview_url ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation()
                            playPreview(v.preview_url!, v.voice_id)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.stopPropagation()
                              e.preventDefault()
                              playPreview(v.preview_url!, v.voice_id)
                            }
                          }}
                          className="mt-0.5 inline-flex cursor-pointer items-center justify-center gap-1 rounded bg-warm-100 px-2 py-1 text-[10px] font-semibold text-warm-700 hover:bg-warm-200"
                        >
                          {isPlaying ? '⏸ Stop' : '🔊 Preview'}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )}

            {showBrowse ? (
              <BrowseSharedVoicesModal
                existingVoiceIds={new Set((voices ?? []).map((v) => v.voice_id))}
                onClose={() => setShowBrowse(false)}
                onAdded={() => {
                  setShowBrowse(false)
                  // Trigger parent reload — emit via window event biar simple.
                  window.location.reload()
                }}
              />
            ) : null}

            {/* Test voice dengan teks custom */}
            {selectedVoiceId ? (
              <div className="mt-3 rounded-lg bg-warm-50 p-3">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-warm-600">
                  🧪 Test voice dengan teks
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={testText}
                    onChange={(e) => setTestText(e.target.value)}
                    placeholder="Ketik teks untuk test voice…"
                    maxLength={200}
                    className="flex-1 rounded-md border border-warm-200 bg-white px-2.5 py-1.5 text-xs"
                  />
                  <Button
                    size="sm"
                    onClick={() => void testVoice()}
                    disabled={testing || !testText.trim()}
                  >
                    {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : '▶ Test'}
                  </Button>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Generate sample TTS (~Rp 50-100) — gak commit ke klip full. Pakai untuk dengar voice sebelum generate.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function BrowseSharedVoicesModal({
  existingVoiceIds,
  onClose,
  onAdded,
}: {
  existingVoiceIds: Set<string>
  onClose: () => void
  onAdded: () => void
}) {
  const [voices, setVoices] = useState<SharedVoice[] | null>(null)
  const [gender, setGender] = useState<'male' | 'female' | ''>('')
  const [adding, setAdding] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const load = useCallback(async () => {
    setVoices(null)
    const qs = new URLSearchParams({ lang: 'id', pageSize: '30' })
    if (gender) qs.set('gender', gender)
    const res = await fetch(`/api/elevenlabs/shared-voices?${qs.toString()}`)
    const j = (await res.json()) as { success: boolean; data?: { voices: SharedVoice[] }; error?: string }
    if (j.success && j.data) setVoices(j.data.voices)
    else toast.error(j.error ?? 'Gagal load')
  }, [gender])

  useEffect(() => {
    void load()
  }, [load])

  function playPreview(url: string, id: string) {
    if (audioRef.current) audioRef.current.pause()
    if (playingId === id) {
      setPlayingId(null)
      return
    }
    const audio = new Audio(url)
    audioRef.current = audio
    audio.onended = () => setPlayingId(null)
    audio.play().catch(() => setPlayingId(null))
    setPlayingId(id)
  }

  async function addVoice(v: SharedVoice) {
    setAdding(v.voice_id)
    try {
      const res = await fetch('/api/elevenlabs/shared-voices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          voiceId: v.voice_id,
          publicOwnerId: v.public_owner_id,
          newName: v.name.split(' - ')[0],
        }),
      })
      const j = (await res.json()) as { success: boolean; error?: string }
      if (j.success) {
        toast.success(`${v.name.split(' - ')[0]} ditambahkan ke library`)
        onAdded()
      } else {
        toast.error(j.error ?? 'Add gagal')
      }
    } finally {
      setAdding(null)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">🇮🇩 Browse Voice Library Indonesia</h3>
            <p className="text-xs text-muted-foreground">
              Pilih voice dari ElevenLabs community library, klik "+ Add" untuk simpan ke library kamu.
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-warm-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-3 flex gap-1.5">
          {[
            { val: '', label: 'Semua' },
            { val: 'male', label: '🧑 Cowok' },
            { val: 'female', label: '👩 Cewek' },
          ].map((g) => (
            <button
              key={g.val}
              type="button"
              onClick={() => setGender(g.val as 'male' | 'female' | '')}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                gender === g.val ? 'bg-orange-500 text-white' : 'bg-warm-100 text-warm-700'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {voices === null ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Loading…
          </div>
        ) : voices.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Tidak ada voice ditemukan
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {voices.map((v) => {
              const alreadyHave = existingVoiceIds.has(v.voice_id)
              const isPlaying = playingId === v.voice_id
              return (
                <div
                  key={v.voice_id}
                  className="flex items-center gap-2 rounded-lg border border-warm-200 bg-white p-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold">{v.name.split(' - ')[0]}</span>
                      <span className="rounded bg-warm-100 px-1 py-px text-[9px] text-warm-700">
                        {v.gender}
                      </span>
                      {v.accent && v.accent !== 'standard' ? (
                        <span className="rounded bg-amber-100 px-1 py-px text-[9px] text-amber-700">
                          {v.accent}
                        </span>
                      ) : null}
                      {v.free_users_allowed === false ? (
                        <span className="rounded bg-purple-100 px-1 py-px text-[9px] text-purple-700">
                          paid
                        </span>
                      ) : null}
                    </div>
                    <div className="line-clamp-1 text-[10px] text-warm-500">
                      {v.descriptive ?? v.name}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-1">
                    {v.preview_url ? (
                      <button
                        type="button"
                        onClick={() => playPreview(v.preview_url!, v.voice_id)}
                        className="rounded bg-warm-100 px-2 py-1 text-[10px] font-semibold text-warm-700"
                      >
                        {isPlaying ? '⏸' : '🔊'}
                      </button>
                    ) : null}
                    {alreadyHave ? (
                      <span className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                        ✓ Ada
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void addVoice(v)}
                        disabled={adding === v.voice_id}
                        className="rounded bg-orange-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-orange-600 disabled:bg-warm-300"
                      >
                        {adding === v.voice_id ? '…' : '+ Add'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Normalisasi pertanyaan jadi trigger: lowercase, strip punctuation,
// collapse whitespace. Pakai default value di input — user bisa edit lagi.
function questionToTrigger(q: string): string {
  return q
    .toLowerCase()
    .replace(/[?!.,;:"'`~()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function AttachQuestionToClipModal({
  hostId,
  question,
  clips,
  onClose,
  onAttached,
}: {
  hostId: string
  question: string
  clips: Clip[]
  onClose: () => void
  onAttached: () => void
}) {
  const [trigger, setTrigger] = useState(questionToTrigger(question))
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
  const [saving, setSaving] = useState(false)

  // Filter klip ready saja, group/filter by category
  const eligible = clips.filter((c) => c.status === 'READY' && c.isActive)
  const filtered =
    categoryFilter === 'ALL' ? eligible : eligible.filter((c) => c.category === categoryFilter)
  const categoriesWithClips = new Set(eligible.map((c) => c.category))

  async function handleAttach() {
    if (!selectedClipId || !trigger.trim()) return
    const target = clips.find((c) => c.id === selectedClipId)
    if (!target) return
    setSaving(true)
    try {
      // Merge trigger ke triggerKeywords existing (dedupe)
      const existing = target.triggerKeywords ?? []
      const newKw = trigger.trim()
      if (existing.includes(newKw)) {
        toast.info('Trigger ini sudah ada di klip tersebut')
        return
      }
      const merged = [...existing, newKw].slice(0, 20)
      // Auto-switch ke KEYWORD_FIRST kalau masih COSINE
      const newMode = (target.matchMode ?? 'COSINE') === 'COSINE' ? 'KEYWORD_FIRST' : target.matchMode

      const res = await fetch(`/api/host-templates/${hostId}/clips/${selectedClipId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          triggerKeywords: merged,
          matchMode: newMode,
        }),
      })
      const j = (await res.json()) as { success: boolean; error?: string }
      if (!j.success) throw new Error(j.error ?? 'Save gagal')
      toast.success(`Trigger "${newKw}" dipasang ke klip ${target.category}`)
      onAttached()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">🎯 Tunjuk klip jawaban</h3>
            <p className="text-xs text-warm-600">
              Customer nanya <strong>"{question}"</strong> — pilih klip yang udah ada untuk jawabannya.
              Trigger di bawah otomatis dipasang ke klip pilihan kamu.
            </p>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="rounded-full p-1.5 hover:bg-warm-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Trigger input (editable) */}
          <div className="rounded-md border-2 border-orange-200 bg-orange-50/60 p-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-warm-700">
              Trigger yang akan dipasang
            </label>
            <input
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              maxLength={80}
              className="mt-1 w-full rounded-md border border-warm-300 bg-white px-3 py-2 text-sm font-mono"
              placeholder="frasa yg trigger klip ini"
            />
            <p className="mt-1 text-[10px] text-warm-600">
              💡 Pendekin biar match juga ke variasi pertanyaan. Mis. dari "berapa harga sih sis?" jadi "harga" atau "berapa".
            </p>
          </div>

          {/* Category filter */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-warm-700">
              Filter kategori
            </label>
            <div className="mt-1 flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                  categoryFilter === 'ALL'
                    ? 'bg-orange-500 text-white'
                    : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                }`}
              >
                Semua ({eligible.length})
              </button>
              {CATEGORIES.filter((c) => categoriesWithClips.has(c.value)).map((c) => {
                const cnt = eligible.filter((x) => x.category === c.value).length
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategoryFilter(c.value)}
                    className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition ${
                      categoryFilter === c.value
                        ? 'bg-orange-500 text-white'
                        : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                    }`}
                  >
                    {c.label} ({cnt})
                  </button>
                )
              })}
            </div>
          </div>

          {/* Clip picker */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-warm-700">
              Pilih klip ({filtered.length})
            </label>
            <div className="mt-1 max-h-80 space-y-1.5 overflow-y-auto rounded-md border border-warm-200 p-2">
              {filtered.length === 0 ? (
                <div className="py-4 text-center text-xs text-warm-500">
                  Gak ada klip di kategori ini. Pilih kategori lain atau bikin klip baru.
                </div>
              ) : (
                filtered.map((c) => {
                  const isSelected = selectedClipId === c.id
                  const hasTriggerAlready = (c.triggerKeywords ?? []).includes(trigger.trim())
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer gap-2 rounded-md border-2 p-2 transition ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-warm-200 bg-white hover:border-orange-300'
                      } ${hasTriggerAlready ? 'opacity-60' : ''}`}
                    >
                      <input
                        type="radio"
                        name="clip-pick"
                        checked={isSelected}
                        onChange={() => setSelectedClipId(c.id)}
                        disabled={hasTriggerAlready}
                        className="mt-0.5 accent-orange-600"
                      />
                      {c.videoUrl ? (
                        <video
                          src={c.videoUrl}
                          muted
                          playsInline
                          className="aspect-[9/16] h-20 flex-shrink-0 rounded bg-black object-cover"
                          onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                          onMouseLeave={(e) => {
                            const v = e.currentTarget as HTMLVideoElement
                            v.pause()
                            v.currentTime = 0
                          }}
                        />
                      ) : null}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge>{c.category}</Badge>
                          {c.matchMode && c.matchMode !== 'COSINE' ? (
                            <span className="rounded bg-orange-100 px-1 py-px text-[8px] font-semibold text-orange-700">
                              {c.matchMode}
                            </span>
                          ) : null}
                          <span className="text-[10px] text-warm-500">{c.useCount}× dipakai</span>
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-xs">
                          {c.summary || c.transcript.slice(0, 100)}
                        </div>
                        {(c.triggerKeywords ?? []).length > 0 ? (
                          <div className="mt-1 line-clamp-1 text-[9px] text-warm-500">
                            Trigger: {c.triggerKeywords?.slice(0, 5).join(', ')}
                            {(c.triggerKeywords ?? []).length > 5 ? '…' : ''}
                          </div>
                        ) : null}
                        {hasTriggerAlready ? (
                          <div className="mt-0.5 text-[10px] text-emerald-700">
                            ✓ Trigger ini sudah ada di klip ini
                          </div>
                        ) : null}
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-warm-200 pt-3">
          <p className="text-[10px] text-warm-600">
            Setelah disimpan, klip auto switch ke <strong>KEYWORD_FIRST</strong> kalau masih COSINE.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button
              onClick={handleAttach}
              disabled={saving || !selectedClipId || !trigger.trim()}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Saving…
                </>
              ) : (
                'Pasang trigger'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface TestMatchResult {
  chosen: {
    clipId: string
    category: string
    summary: string | null
    transcript: string
    confidence: number
    isFallback: boolean
    isKeywordMatch: boolean
    keywordHit?: string
    matchMode?: string
  } | null
  top3: Array<{
    clipId: string
    summary: string | null
    category: string
    score: number
    source: 'keyword' | 'cosine'
    hit?: string
  }>
  threshold: number
}

function TestMatchPanel({ hostId, clips }: { hostId: string; clips: Clip[] }) {
  const [question, setQuestion] = useState('')
  const [result, setResult] = useState<TestMatchResult | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleTest() {
    if (!question.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/host-templates/${hostId}/clips/test-match`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })
      const j = (await res.json()) as { success: boolean; data?: TestMatchResult; error?: string }
      if (!j.success) throw new Error(j.error ?? 'Test gagal')
      setResult(j.data ?? null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const findClipScript = (clipId: string) =>
    clips.find((c) => c.id === clipId)?.scriptOriginal.slice(0, 80) ?? '?'

  return (
    <>
      <div>
        <h2 className="text-base font-semibold text-orange-900">🧪 Tes Trigger — Simulasi Pertanyaan Customer</h2>
        <p className="text-[10px] text-warm-600">
          Ketik pertanyaan yang mungkin customer tanyakan → lihat klip mana yang bakal play.
          Kalau salah klip → buka Edit di klip yang benar, klik ✨ Optimasi AI atau tambah trigger manual.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading) void handleTest()
          }}
          placeholder="Contoh: berapa harga sih?"
          className="flex-1 rounded-md border border-warm-300 bg-white px-3 py-2 text-sm"
          maxLength={500}
        />
        <Button onClick={handleTest} disabled={loading || !question.trim()} className="bg-orange-600 hover:bg-orange-700">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Test'}
        </Button>
      </div>
      {result ? (
        <div className="space-y-2 rounded-md border border-orange-300 bg-white p-3">
          {result.chosen ? (
            <div className="flex items-start gap-2">
              <div
                className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-base ${
                  result.chosen.isFallback
                    ? 'bg-amber-100 text-amber-800'
                    : result.chosen.isKeywordMatch
                    ? 'bg-orange-500 text-white'
                    : 'bg-emerald-500 text-white'
                }`}
              >
                {result.chosen.isFallback ? '⚠️' : result.chosen.isKeywordMatch ? '🎯' : '✓'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs">
                  <Badge>{result.chosen.category}</Badge>
                  <span className="font-bold">
                    Confidence {(result.chosen.confidence * 100).toFixed(0)}%
                  </span>
                  {result.chosen.isKeywordMatch ? (
                    <span className="rounded bg-orange-100 px-1.5 py-px text-[9px] font-semibold text-orange-700">
                      KEYWORD: "{result.chosen.keywordHit}" · {result.chosen.matchMode}
                    </span>
                  ) : result.chosen.isFallback ? (
                    <span className="rounded bg-amber-100 px-1.5 py-px text-[9px] font-semibold text-amber-700">
                      FALLBACK · di bawah threshold {(result.threshold * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="rounded bg-emerald-100 px-1.5 py-px text-[9px] font-semibold text-emerald-700">
                      AI MATCH
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs">
                  <strong>Klip menang:</strong> {result.chosen.summary ?? findClipScript(result.chosen.clipId)}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[10px] text-warm-600 italic">
                  "{result.chosen.transcript.slice(0, 200)}"
                </div>
                {result.chosen.isFallback ? (
                  <div className="mt-1 rounded bg-amber-50 p-1.5 text-[10px] text-amber-800">
                    💡 Score terlalu rendah — tambahin keyword di klip yg mau dipakai, atau bikin klip baru
                    khusus pertanyaan ini.
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded bg-red-50 p-2 text-xs text-red-700">
              ❌ Tidak ada klip yang cocok — bikin klip dulu untuk topik ini.
            </div>
          )}
          {result.top3.length > 1 ? (
            <details className="border-t border-warm-200 pt-1.5">
              <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-warm-500 hover:text-warm-700">
                Top kandidat ({result.top3.length})
              </summary>
              <div className="mt-1 space-y-1">
                {result.top3.map((t, i) => (
                  <div key={`${t.source}-${t.clipId}-${i}`} className="flex items-center gap-2 text-[10px]">
                    <span
                      className={`flex h-4 w-10 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold ${
                        t.source === 'keyword' ? 'bg-orange-200 text-orange-900' : 'bg-warm-200 text-warm-700'
                      }`}
                    >
                      {t.source === 'keyword' ? 'KW' : 'AI'}
                    </span>
                    <span className="font-semibold tabular-nums">{(t.score * 100).toFixed(0)}%</span>
                    <span className="truncate text-warm-700">
                      [{t.category}] {t.summary ?? findClipScript(t.clipId)}
                      {t.hit ? ` (hit: "${t.hit}")` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

function EditClipModal({
  clip,
  hostId,
  onClose,
  onSaved,
}: {
  clip: Clip
  hostId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [transcript, setTranscript] = useState(clip.transcript)
  const [summary, setSummary] = useState(clip.summary ?? '')
  const [category, setCategory] = useState(clip.category)
  const [tagsInput, setTagsInput] = useState((clip.tags ?? []).join(', '))
  const [isActive, setIsActive] = useState(clip.isActive)
  const [isEvergreen, setIsEvergreen] = useState(clip.isEvergreen)
  const [isDefaultIdle, setIsDefaultIdle] = useState(clip.isDefaultIdle)
  // Manual routing state — owner control override matching otomatis.
  const [triggerKeywordsInput, setTriggerKeywordsInput] = useState(
    (clip.triggerKeywords ?? []).join('\n'),
  )
  const [matchMode, setMatchMode] = useState(clip.matchMode ?? 'COSINE')
  const [forceConfidence, setForceConfidence] = useState(clip.manualConfidence === 1)
  const [saving, setSaving] = useState(false)
  const [suggestingTriggers, setSuggestingTriggers] = useState(false)

  async function handleSuggestTriggers() {
    setSuggestingTriggers(true)
    try {
      const existing = triggerKeywordsInput
        .split(/[\n,]/)
        .map((t) => t.trim())
        .filter(Boolean)
      const res = await fetch(`/api/host-templates/${hostId}/clips/${clip.id}/suggest-triggers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ existingTriggers: existing }),
      })
      const j = (await res.json()) as {
        success: boolean
        data?: { triggers: string[]; charge?: { tokensCharged: number } }
        error?: string
      }
      if (!j.success) throw new Error(j.error ?? 'AI gagal')
      const newTriggers = j.data?.triggers ?? []
      if (newTriggers.length === 0) {
        toast.info('AI gak nemu trigger baru')
        return
      }
      // Merge with existing — gak ngapus yg udah ada
      const merged = [...existing, ...newTriggers]
      setTriggerKeywordsInput(merged.join('\n'))
      // Auto-switch ke KEYWORD_FIRST kalau masih COSINE (biar trigger aktif)
      if (matchMode === 'COSINE') setMatchMode('KEYWORD_FIRST')
      toast.success(
        `+${newTriggers.length} trigger baru${j.data?.charge ? ` (${j.data.charge.tokensCharged} token)` : ''}`,
      )
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSuggestingTriggers(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10)
      const triggerKeywords = triggerKeywordsInput
        .split(/[\n,]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 20)
      const res = await fetch(`/api/host-templates/${hostId}/clips/${clip.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          transcript: transcript.trim(),
          summary: summary.trim() || null,
          category,
          tags,
          isActive,
          isEvergreen,
          isDefaultIdle,
          triggerKeywords,
          matchMode,
          manualConfidence: forceConfidence ? 1.0 : null,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (json.success) {
        toast.success('Klip diupdate')
        onSaved()
      } else {
        toast.error(json.error ?? 'Gagal update')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Edit Klip</h3>
            <p className="text-xs text-muted-foreground">
              Source: {clip.source} · {clip.useCount} dipakai
            </p>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="rounded-full p-1.5 hover:bg-warm-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {clip.videoUrl ? (
          <video
            src={clip.videoUrl}
            controls
            className="mb-3 aspect-video w-full rounded-md bg-black"
          />
        ) : null}

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
              Transcript / Script
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-warm-200 px-3 py-2 text-sm"
              maxLength={2500}
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
              Summary (1 baris)
            </label>
            <input
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-md border border-warm-200 px-3 py-2 text-sm"
              placeholder="Auto kalau kosong"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">Kategori</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-md border border-warm-200 px-3 py-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
                Tags (comma-separated)
              </label>
              <input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="cleanoz, flash sale, 49rb"
                className="mt-1 w-full rounded-md border border-warm-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="space-y-2 rounded-md bg-warm-50 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <span>Aktif (bisa di-match saat live)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isEvergreen} onChange={(e) => setIsEvergreen(e.target.checked)} />
              <span>
                Evergreen — fallback saat tidak ada klip cocok
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isDefaultIdle} onChange={(e) => setIsDefaultIdle(e.target.checked)} />
              <span>
                Default Idle — loop saat sepi (otomatis unset klip lain)
              </span>
            </label>
          </div>

          {/* ── Trigger Klip (Routing) ────────────────────────────────────── */}
          <div className="space-y-3 rounded-md border-2 border-orange-200 bg-orange-50/60 p-3">
            <div>
              <h4 className="text-sm font-bold text-orange-900">🎯 Trigger Klip — Kapan klip ini main?</h4>
              <p className="mt-0.5 text-[10px] text-warm-700">
                Customer ngomong frasa di bawah → klip ini auto-play. Pakai tombol{' '}
                <strong>✨ AI</strong> buat dapet trigger relevan dari isi script.
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-warm-700">
                  Trigger phrases <span className="font-normal text-warm-500">(per baris)</span>
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSuggestTriggers}
                  disabled={suggestingTriggers}
                  className="h-7 border-orange-300 text-orange-700 hover:bg-orange-50"
                  title="AI nyaranin trigger dari transcript + kategori (Claude Haiku)"
                >
                  {suggestingTriggers ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="mr-1 h-3 w-3" />
                  )}
                  <span className="text-[11px]">
                    {triggerKeywordsInput.trim() ? 'Perluas AI' : '✨ Optimasi AI'}
                  </span>
                </Button>
              </div>
              <textarea
                value={triggerKeywordsInput}
                onChange={(e) => setTriggerKeywordsInput(e.target.value)}
                placeholder={'berapa harga\nharga\nbiaya\nbrp'}
                rows={5}
                maxLength={1500}
                className="mt-1 w-full rounded-md border border-warm-200 bg-white px-3 py-2 text-xs font-mono"
              />
              <p className="mt-0.5 text-[10px] text-warm-500">
                💡 Frasa per baris. Substring case-insensitive — "harga" trigger oleh "berapa harga sih kak".
                AI bantu nemu frasa real customer (typo, slang, keraguan).
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-warm-700">
                Strategi Matching
              </label>
              <select
                value={matchMode}
                onChange={(e) => setMatchMode(e.target.value)}
                className="mt-1 w-full rounded-md border border-warm-200 bg-white px-3 py-2 text-sm"
              >
                <option value="COSINE">🤖 AI only (cosine) — default, no keyword check</option>
                <option value="KEYWORD_FIRST">🎯 Keywords prioritas, AI fallback (RECOMMENDED utk routing)</option>
                <option value="KEYWORD_ONLY">🔒 Cuma keywords (no AI fallback) — strict supervisor mode</option>
                <option value="BOOST">⬆️ AI + boost (keyword nambah 0.15 ke cosine score)</option>
              </select>
              <p className="mt-0.5 text-[10px] text-warm-500">
                {matchMode === 'COSINE'
                  ? 'Default: AI matching otomatis. Keywords gak dipakai.'
                  : matchMode === 'KEYWORD_FIRST'
                  ? '✅ Direkomendasikan: keyword exact match override AI. Kalau tidak ada keyword hit, fallback ke AI matching.'
                  : matchMode === 'KEYWORD_ONLY'
                  ? '⚠️ Hanya match kalau ada keyword hit — kalau tidak ada, klip ini gak akan dipilih sama sekali.'
                  : 'Klip ini di-boost +0.15 saat ada keyword hit di cosine ranking (lebih halus dari KEYWORD_FIRST).'}
              </p>
            </div>
            {matchMode !== 'COSINE' ? (
              <label className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={forceConfidence}
                  onChange={(e) => setForceConfidence(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-orange-600"
                />
                <span>
                  <strong>Force confidence = 1.0</strong> saat keyword match (klip ini selalu menang kalau ada beberapa
                  klip yang match keyword sama).
                </span>
              </label>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button onClick={handleSave} disabled={saving || transcript.trim().length < 1}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                Saving…
              </>
            ) : (
              'Simpan'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function PrereqWarning({
  title,
  message,
  backHref,
}: {
  title: string
  message: string
  backHref: string
}) {
  return (
    <div className="space-y-4">
      <Link href={backHref} className="text-xs text-muted-foreground hover:underline">
        ← Kembali
      </Link>
      <div className="flex items-start gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
        <div>
          <div className="font-semibold">{title}</div>
          <p className="mt-1 text-sm text-warm-700">{message}</p>
        </div>
      </div>
    </div>
  )
}
