'use client'

// Agentic detail page untuk 1 HostTemplate.
// Layout:
//   - Hero: portrait host (gambar Gemini) + meta
//   - Section "Scenes": grid kartu scene (variations). Tiap scene 1 Kling video.
//   - Tombol "Tambah scene" → modal dengan tab Template / Custom.
//   - Tombol "Set Primary" pada scene READY → di-pakai live room.
//
// Visual koneksi host→scenes via subtle line dari hero ke section header.
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { HostImageGallery } from './HostImageGallery'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface HostDetail {
  id: string
  userId: string
  name: string
  visualStyle: string | null
  promptImage: string
  promptVideo: string
  sourceImageUrl: string | null
  videoLoopUrl: string | null
  status: string
  errorMessage: string | null
  createdAt: string
  // BARU Sprint 2 — kalau mode = NATIVE_LIBRARY, tampilkan link ke /clips.
  mode?: 'TTS_GENERATIVE' | 'NATIVE_LIBRARY'
}

interface Scene {
  id: string
  name: string
  description: string | null
  promptVideo: string
  source: string
  videoUrl: string | null
  videoSeconds: number | null
  status: 'DRAFT' | 'GENERATING' | 'READY' | 'FAILED'
  errorMessage: string | null
  isPrimary: boolean
  isEnabled: boolean
  sortOrder: number
  createdAt: string
}

type SceneCategory =
  | 'idle'
  | 'listening'
  | 'talking'
  | 'greeting'
  | 'excited'
  | 'thinking'
  | 'product'

interface SceneTemplate {
  id: string
  category: SceneCategory
  name: string
  description: string
  promptVideo: string
}

interface TemplatesResponse {
  categories: Record<SceneCategory, string>
  templates: SceneTemplate[]
}

const SCENE_STATUS_BADGE: Record<Scene['status'], { label: string; cls: string }> = {
  DRAFT: { label: 'Draft', cls: 'bg-warm-100 text-warm-700' },
  GENERATING: { label: 'Generate…', cls: 'bg-amber-100 text-amber-700' },
  READY: { label: 'Siap', cls: 'bg-emerald-100 text-emerald-700' },
  FAILED: { label: 'Gagal', cls: 'bg-red-100 text-red-700' },
}

const POLL_MS = 4000

export function HostSceneBoard({
  hostId,
  apiHostBase,
  apiSceneBase,
  backHref,
}: {
  hostId: string
  apiHostBase: string // '/api/admin/host-templates' or '/api/host-templates'
  apiSceneBase: string // '/api/host-templates' (always — scene API)
  backHref: string
}) {
  const [host, setHost] = useState<HostDetail | null>(null)
  const [scenes, setScenes] = useState<Scene[] | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = useCallback(async () => {
    const [hostRes, scenesRes] = await Promise.all([
      fetch(`${apiHostBase}/${hostId}`),
      fetch(`${apiSceneBase}/${hostId}/scenes`),
    ])
    const hostJson = (await hostRes.json()) as { success: boolean; data?: HostDetail }
    const scenesJson = (await scenesRes.json()) as { success: boolean; data?: Scene[] }
    if (hostJson.success && hostJson.data) setHost(hostJson.data)
    if (scenesJson.success && scenesJson.data) setScenes(scenesJson.data)
  }, [hostId, apiHostBase, apiSceneBase])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  // Poll kalau ada scene yang sedang generate atau host yang sedang generate image.
  useEffect(() => {
    const generating =
      (scenes ?? []).some((s) => s.status === 'GENERATING') ||
      host?.status === 'GENERATING_IMAGE'
    if (!generating) {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
      return
    }
    if (!pollTimer.current) {
      pollTimer.current = setInterval(() => void fetchAll(), POLL_MS)
    }
    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current)
        pollTimer.current = null
      }
    }
  }, [scenes, host, fetchAll])

  async function setPrimary(sceneId: string) {
    const res = await fetch(`${apiSceneBase}/${hostId}/scenes/${sceneId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'set_primary' }),
    })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (json.success) {
      toast.success('Scene di-set sebagai Primary. Live room akan pakai video ini.')
      void fetchAll()
    } else {
      toast.error(json.error ?? 'Gagal set primary')
    }
  }

  async function regenerateScene(sceneId: string, duration: 5 | 10) {
    const res = await fetch(`${apiSceneBase}/${hostId}/scenes/${sceneId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'regenerate', durationSeconds: duration }),
    })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (json.success) {
      toast.success('Re-submit ke Kling.')
      void fetchAll()
    } else {
      toast.error(json.error ?? 'Gagal re-generate')
    }
  }

  async function deleteScene(sceneId: string, name: string) {
    if (!confirm(`Hapus scene "${name}"?`)) return
    const res = await fetch(`${apiSceneBase}/${hostId}/scenes/${sceneId}`, {
      method: 'DELETE',
    })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (json.success) {
      toast.success('Scene dihapus')
      void fetchAll()
    } else {
      toast.error(json.error ?? 'Gagal hapus')
    }
  }

  async function toggleScene(sceneId: string, next: boolean) {
    const res = await fetch(`${apiSceneBase}/${hostId}/scenes/${sceneId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', isEnabled: next }),
    })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (json.success) {
      toast.success(next ? 'Scene diaktifkan' : 'Scene dimatikan')
      void fetchAll()
    } else {
      toast.error(json.error ?? 'Gagal toggle')
    }
  }

  if (!host || !scenes) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Memuat…
      </div>
    )
  }

  const sortedScenes = [...scenes].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1
    return a.sortOrder - b.sortOrder
  })

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" /> Kembali ke daftar host
      </Link>

      {/* HERO */}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr]">
          <div className="aspect-[9/16] bg-warm-100 md:aspect-auto md:h-full">
            {host.sourceImageUrl ? (
              <img
                src={host.sourceImageUrl}
                alt={host.name}
                className="h-full w-full object-cover"
              />
            ) : host.status === 'GENERATING_IMAGE' ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-warm-500">
                <Loader2 className="h-10 w-10 animate-spin" />
                <span className="text-xs">Gemini sedang generate…</span>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-warm-300">
                <Sparkles className="h-12 w-12" />
              </div>
            )}
          </div>
          <CardContent className="space-y-3 p-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold">{host.name}</h1>
                <Badge className="bg-warm-100 text-warm-700">
                  {host.status.replace(/_/g, ' ')}
                </Badge>
                {host.mode === 'NATIVE_LIBRARY' ? (
                  <Badge className="bg-gradient-to-r from-red-500 to-orange-500 text-white">
                    🎙️ Klip Live
                  </Badge>
                ) : (
                  <Badge className="bg-sky-100 text-sky-700">🤖 TTS Host</Badge>
                )}
              </div>
              {host.visualStyle ? (
                <p className="mt-1 text-sm text-muted-foreground">{host.visualStyle}</p>
              ) : null}
              {host.mode === 'NATIVE_LIBRARY' && host.sourceImageUrl ? (
                <Link
                  href={`/host-templates/${host.id}/clips`}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:from-red-600 hover:to-orange-600"
                >
                  🎙️ Buka Library Klip Live →
                </Link>
              ) : null}
            </div>
            {host.errorMessage ? (
              <div className="flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span className="break-all">{host.errorMessage}</span>
              </div>
            ) : null}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Lihat prompt gambar (Gemini)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-warm-50 p-2 text-[11px]">
                {host.promptImage}
              </pre>
            </details>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Lihat prompt motion default (Kling)
              </summary>
              <pre className="mt-2 whitespace-pre-wrap rounded-md bg-warm-50 p-2 text-[11px]">
                {host.promptVideo}
              </pre>
            </details>
          </CardContent>
        </div>
      </Card>

      {/* GALERI GAMBAR HOST — generate/upload/pilih kandidat */}
      <Card>
        <CardContent className="p-4">
          <HostImageGallery
            hostId={host.id}
            defaultPromptImage={host.promptImage}
            onActiveChanged={fetchAll}
          />
        </CardContent>
      </Card>

      {/* SCENES SECTION HEADER */}
      <div className="relative">
        <div className="absolute left-1/2 top-[-24px] hidden h-6 w-px bg-gradient-to-b from-transparent to-orange-300 md:block" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Scenes (variasi gerakan)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Tiap scene = 1 video Kling. Tambah variasi (idle, joget, lompat,
              kungfu, sapaan, dll). Live room pakai scene yang ditandai{' '}
              <strong>Primary</strong>.
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)} disabled={!host.sourceImageUrl}>
            <Plus className="mr-2 h-4 w-4" /> Tambah Scene
          </Button>
        </div>
      </div>

      {sortedScenes.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Belum ada scene. Klik <strong>Tambah Scene</strong> untuk pilih
            preset atau bikin custom.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {sortedScenes.map((s) => (
            <SceneCard
              key={s.id}
              scene={s}
              onSetPrimary={() => setPrimary(s.id)}
              onRegenerate={(d) => regenerateScene(s.id, d)}
              onDelete={() => deleteScene(s.id, s.name)}
              onToggle={(next) => toggleScene(s.id, next)}
            />
          ))}
        </div>
      )}

      {showAdd ? (
        <AddSceneDialog
          apiSceneCreate={`${apiSceneBase}/${hostId}/scenes`}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false)
            void fetchAll()
          }}
        />
      ) : null}
    </div>
  )
}

function SceneCard({
  scene,
  onSetPrimary,
  onRegenerate,
  onDelete,
  onToggle,
}: {
  scene: Scene
  onSetPrimary: () => void
  onRegenerate: (d: 5 | 10) => void
  onDelete: () => void
  onToggle: (next: boolean) => void
}) {
  const badge = SCENE_STATUS_BADGE[scene.status]
  return (
    <Card
      className={`overflow-hidden transition ${scene.isPrimary ? 'ring-2 ring-orange-400' : ''} ${
        !scene.isEnabled ? 'opacity-60' : ''
      }`}
    >
      <div className="aspect-[9/16] bg-warm-100 relative flex items-center justify-center">
        {scene.videoUrl ? (
          <video
            src={scene.videoUrl}
            className="h-full w-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : scene.status === 'GENERATING' ? (
          <div className="flex flex-col items-center gap-2 text-warm-500">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="text-xs">Kling generate…</span>
            <span className="text-[10px] text-warm-400">Tunggu ~60dtk</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-warm-400">
            <Play className="h-8 w-8" />
            <span className="text-xs">{scene.status === 'DRAFT' ? 'Draft' : 'Belum di-generate'}</span>
          </div>
        )}
        <Badge className={`absolute top-2 right-2 ${badge.cls}`}>{badge.label}</Badge>
        {scene.isPrimary ? (
          <Badge className="absolute top-2 left-2 bg-orange-500 text-white">
            <Star className="mr-1 h-3 w-3 fill-current" /> Primary
          </Badge>
        ) : null}
      </div>
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{scene.name}</div>
            {scene.description ? (
              <p className="line-clamp-2 text-xs text-muted-foreground">{scene.description}</p>
            ) : null}
          </div>
          <Button size="icon" variant="ghost" onClick={onDelete} title="Hapus">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {scene.errorMessage ? (
          <div className="flex items-start gap-1.5 rounded-md bg-red-50 p-1.5 text-[11px] text-red-700">
            <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
            <span className="break-all">{scene.errorMessage}</span>
          </div>
        ) : null}

        <details className="text-[11px]">
          <summary className="cursor-pointer text-muted-foreground">Lihat prompt</summary>
          <pre className="mt-1.5 whitespace-pre-wrap rounded-md bg-warm-50 p-2">{scene.promptVideo}</pre>
        </details>

        <div className="flex flex-wrap gap-1.5">
          {scene.status === 'READY' && !scene.isPrimary ? (
            <Button size="sm" variant="default" onClick={onSetPrimary}>
              <Star className="mr-1 h-3.5 w-3.5" /> Set Primary
            </Button>
          ) : null}
          {(scene.status === 'DRAFT' || scene.status === 'FAILED') ? (
            <>
              <Button size="sm" variant="outline" onClick={() => onRegenerate(5)}>
                Generate 5dtk
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRegenerate(10)}>
                10dtk
              </Button>
            </>
          ) : null}
          {scene.status === 'READY' ? (
            <Button size="sm" variant="outline" onClick={() => onRegenerate(scene.videoSeconds === 10 ? 10 : 5)}>
              <RefreshCw className="mr-1 h-3 w-3" /> Re-generate
            </Button>
          ) : null}
        </div>
        {scene.status === 'READY' && scene.videoSeconds ? (
          <div className="flex items-center gap-1 text-[11px] text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> MP4 {scene.videoSeconds}dtk loop OK
          </div>
        ) : null}

        {scene.status === 'READY' ? (
          <label
            className="flex cursor-pointer items-center justify-between gap-2 rounded-md border bg-warm-50/60 px-2.5 py-1.5 text-xs"
            title={
              scene.isEnabled
                ? 'Scene aktif — masuk rotation di live room'
                : 'Scene mati — di-skip oleh state machine'
            }
          >
            <span className={scene.isEnabled ? 'text-warm-800' : 'text-warm-500'}>
              {scene.isEnabled ? 'Aktif di live room' : 'Di-skip dari live room'}
            </span>
            <button
              type="button"
              onClick={() => onToggle(!scene.isEnabled)}
              className={`relative h-5 w-9 rounded-full transition ${
                scene.isEnabled ? 'bg-emerald-500' : 'bg-warm-300'
              }`}
              aria-pressed={scene.isEnabled}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${
                  scene.isEnabled ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </button>
          </label>
        ) : null}
      </CardContent>
    </Card>
  )
}

function AddSceneDialog({
  apiSceneCreate,
  onClose,
  onCreated,
}: {
  apiSceneCreate: string
  onClose: () => void
  onCreated: () => void
}) {
  const [tab, setTab] = useState<'template' | 'custom'>('template')
  const [templates, setTemplates] = useState<TemplatesResponse | null>(null)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [customName, setCustomName] = useState('')
  const [customDesc, setCustomDesc] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [duration, setDuration] = useState<5 | 10>(5)
  const [generateNow, setGenerateNow] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void fetch('/api/host-scene-templates')
      .then((r) => r.json())
      .then((j: { success: boolean; data?: TemplatesResponse }) => {
        if (j.success && j.data) setTemplates(j.data)
      })
  }, [])

  async function submit() {
    let payload: {
      name: string
      description?: string
      promptVideo: string
      source: string
      generate: boolean
      durationSeconds: 5 | 10
    }
    if (tab === 'template') {
      const t = templates?.templates.find((x) => x.id === pickedId)
      if (!t) {
        toast.error('Pilih template dulu')
        return
      }
      payload = {
        name: t.name,
        description: t.description,
        promptVideo: t.promptVideo,
        source: `TEMPLATE:${t.id}`,
        generate: generateNow,
        durationSeconds: duration,
      }
    } else {
      if (customName.trim().length < 2) return toast.error('Nama minimal 2 karakter')
      if (customPrompt.trim().length < 20) return toast.error('Prompt motion minimal 20 karakter')
      payload = {
        name: customName.trim(),
        description: customDesc.trim() || undefined,
        promptVideo: customPrompt.trim(),
        source: 'CUSTOM',
        generate: generateNow,
        durationSeconds: duration,
      }
    }
    setSubmitting(true)
    try {
      const res = await fetch(apiSceneCreate, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (json.success) {
        toast.success(generateNow ? 'Scene di-submit Kling.' : 'Scene draft tersimpan.')
        onCreated()
      } else {
        toast.error(json.error ?? 'Gagal')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="max-h-[92vh] w-full max-w-3xl overflow-hidden">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-semibold">Tambah Scene</h2>
            <p className="text-xs text-muted-foreground">
              Pilih dari preset atau bikin custom prompt motion.
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-1 border-b px-4 pt-2">
          <button
            type="button"
            onClick={() => setTab('template')}
            className={`rounded-t-md px-3 py-2 text-sm transition ${
              tab === 'template'
                ? 'border-x border-t bg-white text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="mr-1 inline h-3.5 w-3.5" /> Pilih Template
          </button>
          <button
            type="button"
            onClick={() => setTab('custom')}
            className={`rounded-t-md px-3 py-2 text-sm transition ${
              tab === 'custom'
                ? 'border-x border-t bg-white text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Pencil className="mr-1 inline h-3.5 w-3.5" /> Custom Prompt
          </button>
        </div>

        <CardContent className="max-h-[55vh] overflow-y-auto p-4">
          {tab === 'template' ? (
            templates === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(templates.categories).map(([cat, label]) => {
                  const items = templates.templates.filter((t) => t.category === cat)
                  if (items.length === 0) return null
                  return (
                    <div key={cat}>
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        {label}
                      </Label>
                      <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {items.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setPickedId(t.id)}
                            className={`rounded-md border-2 p-3 text-left transition ${
                              pickedId === t.id
                                ? 'border-orange-500 bg-orange-50/50'
                                : 'border-warm-200 hover:border-warm-400'
                            }`}
                          >
                            <div className="text-sm font-medium">{t.name}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                              {t.description}
                            </div>
                            {pickedId === t.id ? (
                              <ChevronRight className="mt-1 inline h-3 w-3 text-orange-500" />
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          ) : (
            <div className="space-y-3">
              <div>
                <Label>Nama scene</Label>
                <Input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Mis: Idle - Putar 180 derajat"
                  className="mt-1.5"
                  maxLength={120}
                />
              </div>
              <div>
                <Label>Deskripsi (opsional)</Label>
                <Input
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  placeholder="Apa bedanya scene ini"
                  className="mt-1.5"
                  maxLength={800}
                />
              </div>
              <div>
                <Label>Prompt motion (untuk Kling)</Label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={6}
                  className="mt-1.5 w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="Host slowly turns body 180 degrees to the right, hands stay relaxed, returns to facing camera at end..."
                  maxLength={2000}
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Sistem auto-prepend safety constraints: silent video, no
                  lip-sync, kamera static, return to starting pose. Anda tinggal
                  fokus deskripsi gerakannya.
                </p>
              </div>
            </div>
          )}
        </CardContent>

        <div className="flex flex-col gap-3 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Durasi:</span>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) as 5 | 10)}
                className="rounded-md border bg-white px-2 py-1 text-sm"
              >
                <option value="5">5 detik</option>
                <option value="10">10 detik</option>
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={generateNow}
                onChange={(e) => setGenerateNow(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Langsung generate (potong token)
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submit…
                </>
              ) : generateNow ? (
                'Tambah & Generate'
              ) : (
                'Simpan Draft'
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
