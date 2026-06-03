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

import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { KlipLivePresetsPicker, type KlipLivePresetSelection } from './KlipLivePresetsPicker'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Gender = 'female' | 'male'
type AgeRange = 'young' | 'adult' | 'mature'
type Outfit = 'hijab_casual' | 'hijab_formal' | 'non_hijab_casual' | 'non_hijab_formal' | 'tshirt_jeans'
type Vibe = 'friendly' | 'professional' | 'energetic' | 'calm'
type Background = 'studio_white' | 'studio_warm' | 'retail_shop' | 'home_cozy' | 'outdoor_bright' | 'gradient_soft'
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
      { value: 'painterly', label: 'Painterly', desc: 'watercolor illustration' },
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
  const [klipLivePresets, setKlipLivePresets] = useState<KlipLivePresetSelection>({
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
      .then(
        (j: { success: boolean; data?: { items?: ProductOption[] } }) => {
          if (j.success && j.data?.items) setProducts(j.data.items)
          else setProducts([])
        },
      )
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
          productIds: state.productIds.length > 0 ? state.productIds : undefined,
          extraNote: state.extraNote.trim() || undefined,
          // Sprint 5: Klip Live presets — orchestrator inject promptFragment dari DB
          visualHookPresetId: mode === 'NATIVE_LIBRARY' ? klipLivePresets.visualHookId : undefined,
          backgroundPresetId: mode === 'NATIVE_LIBRARY' ? klipLivePresets.backgroundId : undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <Card className="max-h-[92vh] w-full max-w-3xl overflow-hidden">
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-500" /> Bikin Host AI
            </h2>
            <p className="text-xs text-muted-foreground">
              {step === 1
                ? 'Step 1 — pilih karakter. Claude akan susun prompt optimal.'
                : 'Step 2 — review & approve prompt. Kalau pas, langsung generate.'}
            </p>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <CardContent className="max-h-[68vh] space-y-5 overflow-y-auto p-4">
          {step === 1 ? (
            <>
              {mode === 'NATIVE_LIBRARY' ? (
                <div className="rounded-xl border-2 border-orange-200 bg-gradient-to-br from-orange-50/50 to-amber-50/50 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-gradient-to-r from-red-500 to-orange-500 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                      🎙️ Klip Live
                    </span>
                    <span className="text-xs text-muted-foreground">Optimasi visual untuk lipsync clip library</span>
                  </div>
                  <KlipLivePresetsPicker
                    selection={klipLivePresets}
                    onChange={setKlipLivePresets}
                  />
                </div>
              ) : null}
              {OPTION_GROUPS.map((grp) => (
                <div key={grp.key}>
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
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
                            setOpt(grp.key as keyof Step1State, o.value as never)
                          }
                          className={`rounded-full px-3 py-1.5 text-xs transition ${
                            isActive
                              ? 'bg-orange-500 text-white'
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
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Produk yang dipegang/ditampilkan (opsional, max 8)
                </Label>
                {products === null ? (
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading produk…
                  </div>
                ) : products.length === 0 ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Belum ada produk di /products. Skip — host akan tampil tanpa produk.
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
                              ? 'border-orange-500 ring-2 ring-orange-200'
                              : 'border-warm-200 hover:border-warm-400'
                          }`}
                        >
                          {img ? (
                            <img
                              src={img}
                              alt={p.name}
                              className="h-14 w-14 object-cover"
                            />
                          ) : (
                            <div className="h-14 w-14 bg-warm-100" />
                          )}
                          {checked ? (
                            <div className="absolute top-0.5 right-0.5 rounded-full bg-orange-500 p-0.5 text-white">
                              <CheckCircle2 className="h-3 w-3" />
                            </div>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
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
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Nama host
                    </Label>
                    <Input
                      value={prompts.suggestedName}
                      onChange={(e) =>
                        setPrompts({ ...prompts, suggestedName: e.target.value })
                      }
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
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
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Prompt gambar (untuk Gemini)
                    </Label>
                    <textarea
                      value={prompts.promptImage}
                      onChange={(e) =>
                        setPrompts({ ...prompts, promptImage: e.target.value })
                      }
                      rows={6}
                      className="mt-1.5 w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Auto-include: centered medium shot, 9:16 vertical, photorealistic, looping-friendly background.
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Prompt motion (untuk Kling)
                    </Label>
                    <textarea
                      value={prompts.promptVideo}
                      onChange={(e) =>
                        setPrompts({ ...prompts, promptVideo: e.target.value })
                      }
                      rows={4}
                      className="mt-1.5 w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Auto-include: kamera static, host return to starting pose, seamless loop.
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Greeting saran (untuk Live Room)
                    </Label>
                    <Input
                      value={prompts.suggestedGreeting}
                      onChange={(e) =>
                        setPrompts({ ...prompts, suggestedGreeting: e.target.value })
                      }
                      className="mt-1.5"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Copy ini ke field Greeting saat bikin Live Room nanti.
                    </p>
                  </div>
                  {prompts.productImageUrls.length > 0 ? (
                    <div>
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Referensi gambar produk ({prompts.productImageUrls.length})
                      </Label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {prompts.productImageUrls.map((u) => (
                          <img
                            key={u}
                            src={u}
                            alt="ref"
                            className="h-12 w-12 rounded-md border object-cover"
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </CardContent>

        <div className="flex items-center justify-between gap-2 border-t p-3">
          <div>
            {step === 2 ? (
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Kembali edit opsi
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {step === 1 ? (
              <Button onClick={runOrchestrate} disabled={orchestrating}>
                {orchestrating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Claude lagi mikir…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" /> Generate Prompt
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
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Regenerate
                </Button>
                <Button onClick={submitCreate} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generate gambar…
                    </>
                  ) : (
                    <>
                      <ArrowRight className="mr-2 h-4 w-4" /> Bikin Host
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  )
}
