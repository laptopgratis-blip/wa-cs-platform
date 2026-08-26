'use client'

// 4-step wizard untuk bikin host: orkestrasi Claude → Gemini → preview →
// Kling animate. Replace CreateHostDialog yang manual.
//
// Step 1: pilih karakter (gender, age, outfit, vibe, background, motion, products)
// Step 2: AI generate prompts → editable preview + regenerate
// Step 3: generate gambar Gemini → preview + regenerate atau lanjut
// Step 4: animate via Kling (5/10dtk) — submit, sisa progress di list utama.
//
// Step 3 & 4 sebenernya bisa skip langsung "submit" — backend create row →
// auto Gemini → admin balik ke list. Wizard ini cuma generate prompt + nama,
// submit pipeline biasa.

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Mic,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  KlipLivePresetsPicker,
  type KlipLivePresetSelection,
} from './KlipLivePresetsPicker'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type Gender = 'female' | 'male'
type AgeRange = 'young' | 'adult' | 'mature'
type Outfit =
  | 'hijab_casual'
  | 'hijab_formal'
  | 'non_hijab_casual'
  | 'non_hijab_formal'
  | 'tshirt_jeans'
type Vibe = 'friendly' | 'professional' | 'energetic' | 'calm'
type Background =
  | 'studio_white'
  | 'studio_warm'
  | 'retail_shop'
  | 'home_cozy'
  | 'outdoor_bright'
  | 'gradient_soft'
type MotionIntensity = 'subtle' | 'moderate' | 'energetic'
type ArtStyle =
  | 'photoreal_natural'
  | 'photoreal_cinematic'
  | 'pixar_3d'
  | 'realistic_3d'
  | 'anime_modern'
  | 'painterly'
  | 'ghibli'

interface ProductOption {
  id: string
  name: string
  imageUrl: string | null
  images?: string[]
  price?: number
}

interface OrchestratedHostWizardProps {
  apiOrchestrate: string // '/api/host-templates/orchestrate'
  apiCreate: string // '/api/admin/host-templates' atau '/api/host-templates/me'
  apiUpload: string
  // Mode bicara untuk host yang akan dibuat. Default TTS_GENERATIVE (existing
  // behavior). Set NATIVE_LIBRARY kalau wizard dipanggil dari "Klip Live" picker
  // — semua step persona/style/produk sama, cuma flag mode beda.
  mode?: 'TTS_GENERATIVE' | 'NATIVE_LIBRARY'
  onClose: () => void
  onCreated: () => void
}

interface OrchestratedPrompts {
  promptImage: string
  promptVideo: string
  suggestedName: string
  visualStyle: string
  suggestedGreeting: string
  productImageUrls: string[]
}

const OPTION_GROUPS: Array<{
  key: keyof Step1State
  label: string
  options: Array<{ value: string; label: string; desc?: string }>
}> = [
  {
    // Paling penting — paling atas. Anti-plastic guard built-in untuk
    // photoreal styles.
    key: 'artStyle',
    label: 'Art style',
    options: [
      {
        value: 'photoreal_natural',
        label: 'Photoreal natural',
        desc: 'anti-plastik, hairline + pori asli',
      },
      {
        value: 'photoreal_cinematic',
        label: 'Photoreal cinematic',
        desc: 'magazine look, depth of field',
      },
      { value: 'pixar_3d', label: '3D Pixar', desc: 'Disney/Pixar animasi' },
      {
        value: 'realistic_3d',
        label: '3D Realistic',
        desc: 'CGI Unreal Engine 5',
      },
      { value: 'anime_modern', label: 'Anime modern', desc: 'Korean webtoon' },
      {
        value: 'painterly',
        label: 'Painterly',
        desc: 'watercolor illustration',
      },
      { value: 'ghibli', label: 'Studio Ghibli', desc: 'watercolor anime' },
    ],
  },
  {
    key: 'gender',
    label: 'Gender',
    options: [
      { value: 'female', label: 'Perempuan' },
      { value: 'male', label: 'Laki-laki' },
    ],
  },
  {
    key: 'ageRange',
    label: 'Usia',
    options: [
      { value: 'young', label: 'Muda', desc: '22-26' },
      { value: 'adult', label: 'Dewasa', desc: '28-35' },
      { value: 'mature', label: 'Matang', desc: '38-45' },
    ],
  },
  {
    key: 'outfit',
    label: 'Pakaian',
    options: [
      { value: 'hijab_casual', label: 'Hijab casual' },
      { value: 'hijab_formal', label: 'Hijab formal' },
      { value: 'non_hijab_casual', label: 'Tanpa hijab casual' },
      { value: 'non_hijab_formal', label: 'Tanpa hijab formal' },
      { value: 'tshirt_jeans', label: 'T-shirt + jeans' },
    ],
  },
  {
    key: 'vibe',
    label: 'Vibe',
    options: [
      { value: 'friendly', label: 'Friendly', desc: 'hangat, ramah' },
      { value: 'professional', label: 'Profesional', desc: 'percaya diri' },
      { value: 'energetic', label: 'Energetic', desc: 'antusias' },
      { value: 'calm', label: 'Calm', desc: 'tenang, sabar' },
    ],
  },
  {
    key: 'background',
    label: 'Background',
    options: [
      { value: 'studio_white', label: 'Studio putih' },
      { value: 'studio_warm', label: 'Studio hangat' },
      { value: 'retail_shop', label: 'Toko ritel' },
      { value: 'home_cozy', label: 'Rumah cozy' },
      { value: 'outdoor_bright', label: 'Outdoor cerah' },
      { value: 'gradient_soft', label: 'Gradient soft' },
    ],
  },
  {
    key: 'motionIntensity',
    label: 'Gerakan (untuk video)',
    options: [
      { value: 'subtle', label: 'Halus', desc: 'gerakan kecil, sopan' },
      { value: 'moderate', label: 'Sedang', desc: 'gestures wajar' },
      { value: 'energetic', label: 'Hidup', desc: 'goyang sopan, presenter' },
    ],
  },
]

interface Step1State {
  artStyle: ArtStyle
  gender: Gender
  ageRange: AgeRange
  outfit: Outfit
  vibe: Vibe
  background: Background
  motionIntensity: MotionIntensity
  extraNote: string
  productIds: string[]
}

const DEFAULT_STATE: Step1State = {
  artStyle: 'photoreal_natural',
  gender: 'female',
  ageRange: 'young',
  outfit: 'hijab_casual',
  vibe: 'friendly',
  background: 'studio_warm',
  motionIntensity: 'subtle',
  extraNote: '',
  productIds: [],
}

export function OrchestratedHostWizard({
  mode = 'TTS_GENERATIVE',
  apiOrchestrate,
  apiCreate,
  apiUpload: _apiUpload,
  onClose,
  onCreated,
}: OrchestratedHostWizardProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [state, setState] = useState<Step1State>(DEFAULT_STATE)
  // Klip Live presets — visible cuma kalau mode=NATIVE_LIBRARY.
  const [klipLivePresets, setKlipLivePresets] =
    useState<KlipLivePresetSelection>({
      visualHookId: null,
      backgroundId: null,
    })
  const [products, setProducts] = useState<ProductOption[] | null>(null)
  const [prompts, setPrompts] = useState<OrchestratedPrompts | null>(null)
  const [orchestrating, setOrchestrating] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Lazy load products saat wizard mount.
  useEffect(() => {
    if (products !== null) return
    void fetch('/api/products')
      .then((r) => r.json())
      .then((j: { success: boolean; data?: { items?: ProductOption[] } }) => {
        if (j.success && j.data?.items) setProducts(j.data.items)
        else setProducts([])
      })
      .catch(() => setProducts([]))
  }, [products])

  function setOpt<K extends keyof Step1State>(k: K, v: Step1State[K]) {
    setState((s) => ({ ...s, [k]: v }))
  }

  function toggleProduct(id: string) {
    setState((s) => ({
      ...s,
      productIds: s.productIds.includes(id)
        ? s.productIds.filter((x) => x !== id)
        : [...s.productIds, id].slice(0, 8),
    }))
  }

  async function runOrchestrate() {
    setOrchestrating(true)
    try {
      const res = await fetch(apiOrchestrate, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          artStyle: state.artStyle,
          gender: state.gender,
          ageRange: state.ageRange,
          outfit: state.outfit,
          vibe: state.vibe,
          background: state.background,
          motionIntensity: state.motionIntensity,
          productIds:
            state.productIds.length > 0 ? state.productIds : undefined,
          extraNote: state.extraNote.trim() || undefined,
          // Sprint 5: Klip Live presets — orchestrator inject promptFragment dari DB
          visualHookPresetId:
            mode === 'NATIVE_LIBRARY'
              ? klipLivePresets.visualHookId
              : undefined,
          backgroundPresetId:
            mode === 'NATIVE_LIBRARY'
              ? klipLivePresets.backgroundId
              : undefined,
          // Sprint 5+: hostMode trigger ENERGETIC baseline motion untuk NATIVE_LIBRARY
          hostMode: mode,
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: OrchestratedPrompts
        error?: string
      }
      if (json.success && json.data) {
        setPrompts(json.data)
        setStep(2)
      } else {
        toast.error(json.error ?? 'Orchestrator gagal')
      }
    } finally {
      setOrchestrating(false)
    }
  }

  async function submitCreate() {
    if (!prompts) return
    setSubmitting(true)
    try {
      const res = await fetch(apiCreate, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: prompts.suggestedName,
          visualStyle: prompts.visualStyle,
          promptImage: prompts.promptImage,
          promptVideo: prompts.promptVideo,
          refImageUrls: prompts.productImageUrls,
          mode,
        }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (json.success) {
        toast.success('Host dibuat. Gambar di-generate Gemini (~5-15dtk)…')
        onCreated()
      } else {
        toast.error(json.error ?? 'Gagal bikin host')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <div className="border-b p-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="text-primary-500 size-5" /> Bikin Host AI
          </DialogTitle>
          <DialogDescription className="text-xs">
            {step === 1
              ? 'Step 1 — pilih karakter. Claude akan susun prompt optimal.'
              : 'Step 2 — review & approve prompt. Kalau pas, langsung generate.'}
          </DialogDescription>
        </div>

        <div className="max-h-[68vh] space-y-5 overflow-y-auto p-4">
          {step === 1 ? (
            <>
              {mode === 'NATIVE_LIBRARY' ? (
                <div className="border-primary-200 bg-primary-50/50 rounded-xl border-2 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <StatusBadge tone="brand" label="Klip Live" icon={Mic} />
                    <span className="text-muted-foreground text-xs">
                      Optimasi visual untuk lipsync clip library
                    </span>
                  </div>
                  <KlipLivePresetsPicker
                    selection={klipLivePresets}
                    onChange={setKlipLivePresets}
                  />
                </div>
              ) : null}
              {OPTION_GROUPS.map((grp) => (
                <div key={grp.key}>
                  <Label className="text-muted-foreground text-xs tracking-wide uppercase">
                    {grp.label}
                  </Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {grp.options.map((o) => {
                      const isActive = state[grp.key] === o.value
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() =>
                            setOpt(
                              grp.key as keyof Step1State,
                              o.value as never,
                            )
                          }
                          className={`rounded-full px-3 py-1.5 text-xs transition ${
                            isActive
                              ? 'bg-primary-500 text-white'
                              : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                          }`}
                        >
                          {o.label}
                          {o.desc ? (
                            <span className="ml-1 opacity-70">· {o.desc}</span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              <div>
                <Label className="text-muted-foreground text-xs tracking-wide uppercase">
                  Produk yang dipegang/ditampilkan (opsional, max 8)
                </Label>
                {products === null ? (
                  <div className="text-muted-foreground mt-1.5 flex items-center gap-2 text-xs">
                    <Loader2 className="size-4 animate-spin" /> Memuat produk…
                  </div>
                ) : products.length === 0 ? (
                  <p className="text-muted-foreground mt-1.5 text-xs">
                    Belum ada produk di /products. Skip — host akan tampil tanpa
                    produk.
                  </p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {products.map((p) => {
                      const checked = state.productIds.includes(p.id)
                      const img = p.imageUrl ?? p.images?.[0] ?? null
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => toggleProduct(p.id)}
                          className={`relative overflow-hidden rounded-md border-2 transition ${
                            checked
                              ? 'border-primary-500 ring-primary-200 ring-2'
                              : 'border-warm-200 hover:border-warm-400'
                          }`}
                        >
                          {img ? (
                            <img
                              src={img}
                              alt={p.name}
                              className="size-14 object-cover"
                            />
                          ) : (
                            <div className="bg-warm-100 size-14" />
                          )}
                          {checked ? (
                            <div className="bg-primary-500 absolute top-0.5 right-0.5 rounded-full p-0.5 text-white">
                              <CheckCircle2 className="size-3" />
                            </div>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div>
                <Label className="text-muted-foreground text-xs tracking-wide uppercase">
                  Catatan tambahan (opsional)
                </Label>
                <Input
                  value={state.extraNote}
                  onChange={(e) => setOpt('extraNote', e.target.value)}
                  placeholder="Mis: rambut diikat ponytail, etnis Sunda"
                  className="mt-1.5"
                  maxLength={300}
                />
              </div>
            </>
          ) : (
            <>
              {prompts ? (
                <>
                  <div>
                    <Label className="text-muted-foreground text-xs tracking-wide uppercase">
                      Nama host
                    </Label>
                    <Input
                      value={prompts.suggestedName}
                      onChange={(e) =>
                        setPrompts({
                          ...prompts,
                          suggestedName: e.target.value,
                        })
                      }
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs tracking-wide uppercase">
                      Visual style (tag admin)
                    </Label>
                    <Input
                      value={prompts.visualStyle}
                      onChange={(e) =>
                        setPrompts({ ...prompts, visualStyle: e.target.value })
                      }
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs tracking-wide uppercase">
                      Prompt gambar (untuk Gemini)
                    </Label>
                    <Textarea
                      value={prompts.promptImage}
                      onChange={(e) =>
                        setPrompts({ ...prompts, promptImage: e.target.value })
                      }
                      rows={6}
                      className="mt-1.5"
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Auto-include: centered medium shot, 9:16 vertical,
                      photorealistic, looping-friendly background.
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs tracking-wide uppercase">
                      Prompt motion (untuk Kling)
                    </Label>
                    <Textarea
                      value={prompts.promptVideo}
                      onChange={(e) =>
                        setPrompts({ ...prompts, promptVideo: e.target.value })
                      }
                      rows={4}
                      className="mt-1.5"
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Auto-include: kamera static, host return to starting pose,
                      seamless loop.
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs tracking-wide uppercase">
                      Greeting saran (untuk Live Room)
                    </Label>
                    <Input
                      value={prompts.suggestedGreeting}
                      onChange={(e) =>
                        setPrompts({
                          ...prompts,
                          suggestedGreeting: e.target.value,
                        })
                      }
                      className="mt-1.5"
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Copy ini ke field Greeting saat bikin Live Room nanti.
                    </p>
                  </div>
                  {prompts.productImageUrls.length > 0 ? (
                    <div>
                      <Label className="text-muted-foreground text-xs tracking-wide uppercase">
                        Referensi gambar produk (
                        {prompts.productImageUrls.length})
                      </Label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {prompts.productImageUrls.map((u) => (
                          <img
                            key={u}
                            src={u}
                            alt="ref"
                            className="size-12 rounded-md border object-cover"
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t p-3">
          <div>
            {step === 2 ? (
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1 size-4" /> Kembali edit opsi
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {step === 1 ? (
              <Button onClick={runOrchestrate} disabled={orchestrating}>
                {orchestrating ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" /> Claude lagi
                    mikir…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 size-4" /> Generate Prompt
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={runOrchestrate}
                  disabled={orchestrating}
                >
                  {orchestrating ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 size-4" />
                  )}
                  Regenerate
                </Button>
                <Button onClick={submitCreate} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" /> Generate
                      gambar…
                    </>
                  ) : (
                    <>
                      <ArrowRight className="mr-2 size-4" /> Bikin Host
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
