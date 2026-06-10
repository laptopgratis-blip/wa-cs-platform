'use client'

import { AlertTriangle, Loader2, Package, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { ProductPickerManager } from './ProductPickerManager'

interface HostOption {
  id: string
  name: string
  visualStyle: string | null
  videoLoopUrl: string | null
  sourceImageUrl: string | null
  isPublic: boolean
  isOwn: boolean
}

interface ProductOption {
  id: string
  name: string
  price: number
  imageUrl: string | null
}

interface RoomData {
  id: string
  slug: string
  name: string
  description: string | null
  hostTemplateId: string
  productIds: string[]
  featuredProductId: string | null
  systemPrompt: string
  greeting: string | null
  ttsVoice: string
  ttsInstructions: string | null
  ttsSpeed: number
  ttsPitchOffset: number
  ttsExpressiveness: number
  ttsPauseMs: number
  chatModel: string
  chatTemperature: number
  isActive: boolean
  botEnabled: boolean
  botIntervalMinSec: number
  botIntervalMaxSec: number
  botPrompts: string[]
  orderFormSlug: string | null
  productFormMap: Record<string, string> | null
}

interface OrderFormOption {
  slug: string
  name: string
  // Subset Product.id yang dimuat form. Kosong = form universal (semua produk).
  productIds: string[]
}

// Form memuat produk kalau universal (productIds kosong) atau eksplisit.
function formContainsProduct(form: OrderFormOption, productId: string): boolean {
  return form.productIds.length === 0 || form.productIds.includes(productId)
}

// OpenAI gpt-4o-mini-tts voices — sorted female first + label gender hint.
// Pakai 'nova' / 'shimmer' / 'coral' / 'sage' untuk live shopping woman host.
const TTS_VOICES: Array<{ value: string; label: string; tag: string }> = [
  { value: 'nova', label: 'Nova', tag: '👩 friendly female (Hulao default)' },
  { value: 'shimmer', label: 'Shimmer', tag: '👩 soft female' },
  { value: 'coral', label: 'Coral', tag: '👩 warm female' },
  { value: 'sage', label: 'Sage', tag: '👩 calm female' },
  { value: 'alloy', label: 'Alloy', tag: '⚪ neutral' },
  { value: 'echo', label: 'Echo', tag: '👨 male' },
  { value: 'fable', label: 'Fable', tag: '👨 male storyteller' },
  { value: 'onyx', label: 'Onyx', tag: '👨 deep male' },
  { value: 'ash', label: 'Ash', tag: '👨 male' },
  { value: 'ballad', label: 'Ballad', tag: '👨 expressive male' },
  { value: 'verse', label: 'Verse', tag: '🎭 versatile' },
]

const CHAT_MODELS: Array<{
  value: string
  label: string
  provider: string
  tag: string
}> = [
  {
    value: 'gpt-4o-mini',
    label: 'GPT-4o mini',
    provider: 'OpenAI',
    tag: 'PALING MURAH — $0.15/$0.60 per 1M token. Cocok volume tinggi, kualitas decent untuk Q&A produk sederhana.',
  },
  {
    value: 'gpt-5-mini',
    label: 'GPT-5 mini',
    provider: 'OpenAI',
    tag: 'MURAH + UPGRADE — $0.25/$2 per 1M. Lebih pintar dari 4o-mini, masih ekonomis.',
  },
  {
    value: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    tag: 'BALANCED — $1/$5 per 1M. Cepat, sopan, bahasa Indonesia natural (default Hulao).',
  },
  {
    value: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    tag: 'PREMIUM — $3/$15 per 1M. Paling pintar untuk jawaban kompleks/edukasi customer.',
  },
  {
    value: 'gpt-5',
    label: 'GPT-5',
    provider: 'OpenAI',
    tag: 'PREMIUM — $3/$15 per 1M. Alternatif Sonnet, kuat reasoning + nuance.',
  },
]

function defaultSystemPrompt(hostName: string): string {
  return `Kamu adalah ${hostName}, host live shopping yang ramah dan to-the-point. Bahasa Indonesia santai. Selalu pancing customer ke order — kalau ada yang nanya soal produk, jelaskan benefit lalu dorong ke order via WA.`
}

export function LiveRoomForm({
  mode,
  roomId,
}: {
  mode: 'create' | 'edit'
  roomId?: string
}) {
  const router = useRouter()
  const [hosts, setHosts] = useState<HostOption[] | null>(null)
  const [products, setProducts] = useState<ProductOption[] | null>(null)
  const [saving, setSaving] = useState(false)

  const [slug, setSlug] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [hostTemplateId, setHostTemplateId] = useState('')
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [featuredProductId, setFeaturedProductId] = useState<string | null>(null)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [greeting, setGreeting] = useState('')
  const [ttsVoice, setTtsVoice] = useState('alloy')
  const [isActive, setIsActive] = useState(true)
  const [botEnabled, setBotEnabled] = useState(false)
  const [botIntervalMinSec, setBotIntervalMinSec] = useState(25)
  const [botIntervalMaxSec, setBotIntervalMaxSec] = useState(45)
  const [botPromptsText, setBotPromptsText] = useState('')
  const [orderFormSlug, setOrderFormSlug] = useState<string>('')
  // Override form per-produk: { [productId]: formSlug }. Produk yang tidak ada
  // di map ikut form default (orderFormSlug).
  const [productFormMap, setProductFormMap] = useState<Record<string, string>>({})
  const [orderForms, setOrderForms] = useState<OrderFormOption[] | null>(null)
  const [ttsInstructions, setTtsInstructions] = useState('')
  const [ttsSpeed, setTtsSpeed] = useState(1.0)
  const [ttsPitchOffset, setTtsPitchOffset] = useState(0.0)
  const [ttsExpressiveness, setTtsExpressiveness] = useState(0.5)
  const [ttsPauseMs, setTtsPauseMs] = useState(150)
  const [chatModel, setChatModel] = useState<string>('claude-haiku-4-5')
  const [chatTemperature, setChatTemperature] = useState(0.7)

  const loadOptions = useCallback(async () => {
    const [hostsRes, productsRes, formsRes] = await Promise.all([
      fetch('/api/host-templates'),
      fetch('/api/products'),
      fetch('/api/order-forms'),
    ])
    const hostsJson = (await hostsRes.json()) as { success: boolean; data?: HostOption[] }
    const productsJson = (await productsRes.json()) as {
      success: boolean
      data?: { items?: ProductOption[] }
    }
    const formsJson = (await formsRes.json()) as {
      success: boolean
      data?: {
        items?: Array<{
          slug: string
          name: string
          isActive: boolean
          productIds?: string[]
        }>
      }
    }
    if (hostsJson.success && hostsJson.data) setHosts(hostsJson.data)
    if (productsJson.success && productsJson.data?.items) {
      setProducts(productsJson.data.items)
    } else {
      setProducts([])
    }
    const forms = formsJson.success && formsJson.data?.items
      ? formsJson.data.items
          .filter((f) => f.isActive)
          .map((f) => ({
            slug: f.slug,
            name: f.name,
            productIds: f.productIds ?? [],
          }))
      : []
    setOrderForms(forms)
  }, [])

  const loadRoom = useCallback(async (id: string) => {
    const res = await fetch(`/api/live-rooms/${id}`)
    const json = (await res.json()) as { success: boolean; data?: RoomData; error?: string }
    if (!json.success || !json.data) {
      toast.error(json.error ?? 'Gagal load room')
      return
    }
    const r = json.data
    setSlug(r.slug)
    setName(r.name)
    setDescription(r.description ?? '')
    setHostTemplateId(r.hostTemplateId)
    setSelectedProducts(r.productIds)
    setFeaturedProductId(r.featuredProductId ?? null)
    setSystemPrompt(r.systemPrompt)
    setGreeting(r.greeting ?? '')
    setTtsVoice(r.ttsVoice)
    setIsActive(r.isActive)
    setBotEnabled(r.botEnabled)
    setBotIntervalMinSec(r.botIntervalMinSec)
    setBotIntervalMaxSec(r.botIntervalMaxSec)
    setBotPromptsText((r.botPrompts ?? []).join('\n'))
    setOrderFormSlug(r.orderFormSlug ?? '')
    setProductFormMap(r.productFormMap ?? {})
    setTtsInstructions(r.ttsInstructions ?? '')
    setTtsSpeed(r.ttsSpeed ?? 1.0)
    setTtsPitchOffset(r.ttsPitchOffset ?? 0.0)
    setTtsExpressiveness(r.ttsExpressiveness ?? 0.5)
    setTtsPauseMs(r.ttsPauseMs ?? 150)
    setChatModel(r.chatModel ?? 'claude-haiku-4-5')
    setChatTemperature(r.chatTemperature ?? 0.7)
  }, [])

  useEffect(() => {
    void loadOptions()
    if (mode === 'edit' && roomId) void loadRoom(roomId)
  }, [mode, roomId, loadOptions, loadRoom])


  function pickHost(id: string) {
    setHostTemplateId(id)
    // Auto-fill system prompt placeholder kalau masih kosong.
    if (!systemPrompt.trim()) {
      const host = hosts?.find((h) => h.id === id)
      if (host) setSystemPrompt(defaultSystemPrompt(host.name))
    }
  }

  async function handleSubmit() {
    if (mode === 'create') {
      if (!slug.match(/^[a-z0-9](?:[a-z0-9-]{1,60}[a-z0-9])?$/)) {
        return toast.error('Slug: huruf kecil, angka, dan strip. 2-62 karakter.')
      }
    }
    if (name.trim().length < 2) return toast.error('Nama minimal 2 karakter')
    if (!hostTemplateId) return toast.error('Pilih host dulu')
    if (systemPrompt.trim().length < 20) return toast.error('Persona host minimal 20 karakter')

    setSaving(true)
    try {
      // Parse bot prompts: split per baris, trim, filter empty + dedupe.
      const promptsArr = Array.from(
        new Set(
          botPromptsText
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s.length >= 3),
        ),
      ).slice(0, 40)
      // Pastikan min <= max
      const minSec = Math.min(botIntervalMinSec, botIntervalMaxSec)
      const maxSec = Math.max(botIntervalMinSec, botIntervalMaxSec)
      const payload = {
        ...(mode === 'create' ? { slug } : {}),
        name: name.trim(),
        description: description.trim() || undefined,
        hostTemplateId,
        productIds: selectedProducts,
        featuredProductId:
          featuredProductId && selectedProducts.includes(featuredProductId)
            ? featuredProductId
            : null,
        systemPrompt: systemPrompt.trim(),
        greeting: greeting.trim() || undefined,
        ttsVoice,
        isActive,
        botEnabled,
        botIntervalMinSec: minSec,
        botIntervalMaxSec: maxSec,
        botPrompts: promptsArr,
        orderFormSlug: orderFormSlug || null,
        // Kirim hanya entri produk yang masih terpilih + form-nya masih ada —
        // entri basi (produk dilepas / form dihapus) di-drop di sini.
        productFormMap: (() => {
          const cleaned: Record<string, string> = {}
          for (const pid of selectedProducts) {
            const slug = productFormMap[pid]
            if (slug && orderForms?.some((f) => f.slug === slug)) {
              cleaned[pid] = slug
            }
          }
          return Object.keys(cleaned).length > 0 ? cleaned : null
        })(),
        ttsInstructions: ttsInstructions.trim() || null,
        ttsSpeed,
        ttsPitchOffset,
        ttsExpressiveness,
        ttsPauseMs,
        chatModel,
        chatTemperature,
      }
      const url = mode === 'create' ? '/api/live-rooms' : `/api/live-rooms/${roomId}`
      const method = mode === 'create' ? 'POST' : 'PUT'
      const res = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json()) as { success: boolean; data?: { slug: string }; error?: string }
      if (json.success) {
        toast.success(mode === 'create' ? 'Room dibuat' : 'Room diupdate')
        router.push('/live-rooms')
      } else {
        toast.error(json.error ?? 'Gagal simpan')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">
        {mode === 'create' ? 'Bikin Live Room' : 'Edit Live Room'}
      </h1>

      <Card>
        <CardContent className="space-y-4 p-4">
          {mode === 'create' ? (
            <div>
              <Label>Slug URL</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="cleanoz-flash"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                URL publik: <span className="font-mono">/live/{slug || '...'}</span>
              </p>
            </div>
          ) : null}

          <div>
            <Label>Nama room</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Mis: Cleanoz Flash Sale 12.12"
            />
          </div>

          <div>
            <Label>Greeting saat customer buka</Label>
            <Input
              value={greeting}
              onChange={(e) => setGreeting(e.target.value)}
              placeholder="Halo! Selamat datang di live shopping Cleanoz."
            />
          </div>

          {mode === 'edit' ? (
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4"
                />
                Room aktif (customer bisa akses)
              </label>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <Label>Pilih Host</Label>
          {hosts === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading host…
            </div>
          ) : hosts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada host yang siap. Admin bikin dulu di /admin/host-templates,
              atau Anda generate sendiri (akan ada di Phase 2).
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {hosts.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => pickHost(h.id)}
                  className={`overflow-hidden rounded-lg border-2 text-left transition ${
                    hostTemplateId === h.id
                      ? 'border-orange-500 ring-2 ring-orange-200'
                      : 'border-warm-200 hover:border-warm-400'
                  }`}
                >
                  <div className="aspect-[9/16] bg-warm-100">
                    {h.videoLoopUrl ? (
                      <video
                        src={h.videoLoopUrl}
                        className="h-full w-full object-cover"
                        autoPlay
                        loop
                        muted
                        playsInline
                      />
                    ) : null}
                  </div>
                  <div className="p-2">
                    <div className="truncate text-xs font-medium">{h.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {h.isOwn ? 'milik Anda' : 'library admin'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <ProductPickerManager
            products={products}
            selected={selectedProducts}
            featuredId={featuredProductId}
            onChangeSelected={setSelectedProducts}
            onChangeFeatured={setFeaturedProductId}
          />
          <p className="text-xs text-muted-foreground">
            ⭐ Produk unggulan tampil sebagai kartu sorotan di room. Urutan
            menentukan tampilan di rail produk &amp; katalog.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <Label>Persona host (system prompt AI)</Label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={5}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Kamu adalah Siska, host yang ramah dan to-the-point…"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Karakter, gaya bahasa, dan target host. Jangan sebut produk di sini
              (sistem auto-inject list produk + harga).
            </p>
          </div>

          <div>
            <Label>Suara TTS</Label>
            <select
              value={ttsVoice}
              onChange={(e) => setTtsVoice(e.target.value)}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              {TTS_VOICES.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label} — {v.tag}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Pakai <strong>Nova</strong> / <strong>Shimmer</strong> /{' '}
              <strong>Coral</strong> / <strong>Sage</strong> kalau host
              perempuan. Coba beberapa untuk dengar yang paling cocok.
            </p>
          </div>

          <div className="space-y-4 rounded-md border bg-warm-50/40 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-warm-700">
              Kontrol Suara (slider)
            </div>

            {/* SPEED */}
            <div>
              <Label className="flex items-center justify-between text-sm">
                <span>Kecepatan bicara</span>
                <span className="font-mono text-xs text-orange-600">
                  {ttsSpeed.toFixed(2)}×
                </span>
              </Label>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={ttsSpeed}
                onChange={(e) => setTtsSpeed(Number(e.target.value))}
                className="mt-1.5 w-full accent-orange-500"
              />
              <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
                <span>0.5× pelan</span>
                <span>1.0× normal</span>
                <span>2.0× cepat</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Tempo bicara host. 1.0 = pace normal Indonesian woman. Naikkan
                kalau live energi tinggi, turunkan untuk produk premium yang
                butuh tone tenang.
              </p>
            </div>

            {/* PITCH */}
            <div>
              <Label className="flex items-center justify-between text-sm">
                <span>Tone (tinggi rendah suara)</span>
                <span className="font-mono text-xs text-orange-600">
                  {ttsPitchOffset > 0 ? '+' : ''}
                  {ttsPitchOffset.toFixed(2)}
                </span>
              </Label>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={ttsPitchOffset}
                onChange={(e) => setTtsPitchOffset(Number(e.target.value))}
                className="mt-1.5 w-full accent-orange-500"
              />
              <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
                <span>−1 rendah</span>
                <span>0 default</span>
                <span>+1 tinggi</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Suara lebih bass (−) atau melengking (+). OpenAI gak punya
                param pitch eksplisit — slider ini di-translate ke instruksi
                natural language ("speak lower/higher pitch").
              </p>
            </div>

            {/* EXPRESSIVENESS */}
            <div>
              <Label className="flex items-center justify-between text-sm">
                <span>Dinamis (naik-turun &amp; ekspresif)</span>
                <span className="font-mono text-xs text-orange-600">
                  {Math.round(ttsExpressiveness * 100)}%
                </span>
              </Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={ttsExpressiveness}
                onChange={(e) => setTtsExpressiveness(Number(e.target.value))}
                className="mt-1.5 w-full accent-orange-500"
              />
              <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
                <span>0% flat</span>
                <span>50% natural</span>
                <span>100% lively</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Variasi intonasi: flat (monoton, terdengar robot) → natural
                (conversational) → lively (banyak emphasis, smile-in-voice).
                Untuk live shopping 60-80% biasanya bagus.
              </p>
            </div>

            {/* PAUSE */}
            <div>
              <Label className="flex items-center justify-between text-sm">
                <span>Jeda antar kalimat</span>
                <span className="font-mono text-xs text-orange-600">
                  {ttsPauseMs} ms
                </span>
              </Label>
              <input
                type="range"
                min={0}
                max={1000}
                step={25}
                value={ttsPauseMs}
                onChange={(e) => setTtsPauseMs(Number(e.target.value))}
                className="mt-1.5 w-full accent-orange-500"
              />
              <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
                <span>0 nyambung</span>
                <span>300 normal</span>
                <span>1000 lega</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Jeda kosong (ms) antara kalimat audio yang main bergantian.
                0 = lanjut tanpa jeda (cepat). 300-500 = natural seperti
                breathing. 1000 = lega untuk bahasan serius.
              </p>
            </div>
          </div>

          <div>
            <Label>Custom instructions (advanced, opsional)</Label>
            <textarea
              value={ttsInstructions}
              onChange={(e) => setTtsInstructions(e.target.value)}
              rows={3}
              maxLength={2000}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Speak with light Surabayan accent, very enthusiastic on product benefits, smile-in-voice always."
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Override 3 slider di atas. Kalau diisi, slider tone &amp; dinamis
              di-bypass — yang kepakai cuma text ini (+ speed slider tetap dipakai
              karena native parameter). Tulis dalam English (model lebih
              responsive). Kosongkan = compose otomatis dari slider.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <Label className="text-base">Model AI &amp; Kreativitas</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Pilih model Claude yang membalas customer. Sesuaikan dengan
              budget &amp; kompleksitas pertanyaan.
            </p>
          </div>

          <div>
            <Label>Model AI</Label>
            <div className="mt-1.5 space-y-2">
              {CHAT_MODELS.map((m) => (
                <label
                  key={m.value}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm transition ${
                    chatModel === m.value
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-warm-200 hover:bg-warm-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="chatModel"
                    value={m.value}
                    checked={chatModel === m.value}
                    onChange={() => setChatModel(m.value)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.label}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          m.provider === 'OpenAI'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {m.provider}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{m.tag}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="flex items-center justify-between">
              <span>Temperature</span>
              <span className="font-mono text-xs text-orange-600">
                {chatTemperature.toFixed(2)}
              </span>
            </Label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={chatTemperature}
              onChange={(e) => setChatTemperature(Number(e.target.value))}
              className="mt-2 w-full accent-orange-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>0.0 — konsisten</span>
              <span>0.5 — seimbang</span>
              <span>1.0 — kreatif</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              <strong>Temperature</strong> ngatur seberapa "berani" AI dalam
              jawab.{' '}
              <span className="text-orange-700">
                <strong>0.0-0.3</strong> — jawaban sama persis tiap kali untuk
                pertanyaan sama (cocok jualan produk dengan jawaban baku).
              </span>{' '}
              <span className="text-amber-700">
                <strong>0.4-0.7</strong> — natural conversational (rekomendasi
                live shopping).
              </span>{' '}
              <span className="text-rose-700">
                <strong>0.8-1.0</strong> — jawaban variatif/kreatif, kadang
                surprising, tapi bisa miss-context.
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <Label className="text-base">
              Form Checkout (klik produk → order langsung)
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Saat customer klik kartu produk di live, form order terbuka
              langsung dengan produk itu ter-preselect. Atur satu form default
              untuk semua produk, lalu (opsional) form khusus per produk.
            </p>
          </div>

          {orderForms === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading form…
            </div>
          ) : orderForms.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada order form. Bikin dulu di{' '}
              <a className="text-orange-600 underline" href="/order-forms">
                /order-forms
              </a>
              .
            </p>
          ) : (
            <>
              {/* ── FORM DEFAULT ─────────────────────────────────────── */}
              <div>
                <Label htmlFor="live-default-form" className="text-sm">
                  Form default
                </Label>
                <select
                  id="live-default-form"
                  value={orderFormSlug}
                  onChange={(e) => setOrderFormSlug(e.target.value)}
                  className="mt-1 h-11 w-full rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="">
                    — Tidak ada (klik produk hanya isi chat) —
                  </option>
                  {orderForms.map((f) => (
                    <option key={f.slug} value={f.slug}>
                      {f.name}
                      {f.productIds.length === 0 ? ' · semua produk' : ''}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Dipakai semua produk yang tidak diberi form khusus di bawah.
                </p>
                {(() => {
                  // Produk room yang TIDAK termuat di form default & belum
                  // di-override → customer bakal lihat form tanpa produknya.
                  const defaultForm = orderForms.find(
                    (f) => f.slug === orderFormSlug,
                  )
                  if (!defaultForm) return null
                  const gap = selectedProducts.filter(
                    (pid) =>
                      !formContainsProduct(defaultForm, pid) &&
                      !productFormMap[pid],
                  )
                  if (gap.length === 0) return null
                  const names = gap
                    .map((pid) => products?.find((p) => p.id === pid)?.name)
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(', ')
                  return (
                    <div className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        <strong>{gap.length} produk</strong> room tidak termuat
                        di form default ({names}
                        {gap.length > 3 ? ', …' : ''}). Customer yang klik
                        produk itu akan lihat form tanpa produknya. Beri form
                        khusus di bawah, atau tambahkan produknya ke form.
                      </span>
                    </div>
                  )
                })()}
              </div>

              {/* ── FORM PER PRODUK ──────────────────────────────────── */}
              {selectedProducts.length === 0 ? (
                <p className="rounded-md border border-dashed border-warm-200 px-3 py-2.5 text-xs text-muted-foreground">
                  Pilih produk room dulu (bagian Produk di atas) untuk bisa
                  mengatur form per produk.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-warm-200">
                  <div className="flex items-center justify-between gap-2 border-b border-warm-200 bg-warm-50/60 px-3 py-2.5">
                    <div>
                      <div className="text-sm font-medium">Form per produk</div>
                      <div className="text-xs text-muted-foreground">
                        Opsional — pakai form berbeda untuk produk tertentu.
                      </div>
                    </div>
                    {(() => {
                      const n = selectedProducts.filter(
                        (pid) => productFormMap[pid],
                      ).length
                      return n > 0 ? (
                        <span className="shrink-0 rounded-full bg-orange-100 px-2.5 py-1 text-[11px] font-medium text-orange-700">
                          {n} form khusus
                        </span>
                      ) : null
                    })()}
                  </div>
                  <div className="divide-y divide-warm-100">
                    {selectedProducts.map((pid) => {
                      const product = products?.find((p) => p.id === pid)
                      const chosen = productFormMap[pid] ?? ''
                      const chosenForm = orderForms.find(
                        (f) => f.slug === chosen,
                      )
                      const defaultFormName = orderForms.find(
                        (f) => f.slug === orderFormSlug,
                      )?.name
                      const mismatch =
                        !!chosenForm && !formContainsProduct(chosenForm, pid)
                      return (
                        <div key={pid} className="px-3 py-2.5">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                            <div className="flex min-w-0 flex-1 items-center gap-2.5">
                              {product?.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={product.imageUrl}
                                  alt=""
                                  className="h-10 w-10 shrink-0 rounded-md border border-warm-200 object-cover"
                                />
                              ) : (
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-warm-200 bg-warm-50 text-warm-400">
                                  <Package className="h-4 w-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium">
                                  {product?.name ?? 'Produk'}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                  {chosen
                                    ? `Form khusus: ${chosenForm?.name ?? chosen}`
                                    : defaultFormName
                                      ? `Ikuti default — ${defaultFormName}`
                                      : 'Belum ada form (klik produk isi chat)'}
                                </div>
                              </div>
                            </div>
                            <select
                              aria-label={`Form order untuk ${product?.name ?? 'produk'}`}
                              value={chosen}
                              onChange={(e) =>
                                setProductFormMap((prev) => {
                                  const next = { ...prev }
                                  if (e.target.value) next[pid] = e.target.value
                                  else delete next[pid]
                                  return next
                                })
                              }
                              className={`h-11 w-full rounded-md border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 sm:w-64 ${
                                mismatch ? 'border-amber-400' : ''
                              }`}
                            >
                              <option value="">Ikuti default</option>
                              {orderForms.map((f) => (
                                <option key={f.slug} value={f.slug}>
                                  {f.name}
                                  {!formContainsProduct(f, pid)
                                    ? ' (tidak memuat produk ini)'
                                    : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                          {mismatch && chosenForm ? (
                            <div className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
                              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                              <span>
                                Form <strong>{chosenForm.name}</strong> tidak
                                memuat produk ini — pilihan ini akan{' '}
                                <strong>diabaikan saat disimpan</strong>.
                                Tambahkan produk ke form itu di{' '}
                                <a href="/order-forms" className="underline">
                                  /order-forms
                                </a>
                                , atau pilih form lain.
                              </span>
                            </div>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <Label className="text-base">Bot Penonton (Auto-Engage)</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Bot bertanya ke host random tiap interval supaya live terasa
                ramai. Customer real selalu prioritas — bot pause 60dtk setelah
                pesan asli. Tiap bot question potong token sama seperti chat
                real.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={botEnabled}
                onChange={(e) => setBotEnabled(e.target.checked)}
                className="h-4 w-4"
              />
              Aktifkan
            </label>
          </div>

          {botEnabled ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Interval min (detik)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={600}
                    value={botIntervalMinSec}
                    onChange={(e) => setBotIntervalMinSec(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Interval max (detik)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={600}
                    value={botIntervalMaxSec}
                    onChange={(e) => setBotIntervalMaxSec(Number(e.target.value))}
                    className="mt-1"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs">
                    Daftar pertanyaan bot (satu baris satu pertanyaan, max 40)
                  </Label>
                  <button
                    type="button"
                    onClick={() =>
                      setBotPromptsText(
                        [
                          'Halo kak, baru pertama nonton nih',
                          'Bisa dijelasin produknya?',
                          'Stok masih ada?',
                          'Harganya berapa kak?',
                          'Bisa COD nggak ya?',
                          'Saya dari Jakarta, ongkir berapa?',
                          'Ada diskon untuk pembelian banyak?',
                          'Garansi nya gimana?',
                          'Bayar pakai transfer ok ya?',
                          'Boleh tanya tutorial pakainya?',
                          'Kualitasnya bagus nggak sis?',
                          'Saya newbie, recommend buat saya?',
                          'Aman dipakai sehari-hari?',
                          'Order minimal berapa?',
                          'Pengiriman berapa hari?',
                          'Sis lucu deh hehe',
                          'Saya baru tau brand ini',
                          'Ada testimoni dari pembeli sebelumnya?',
                          'Daerah Surabaya bisa kirim?',
                          'Kira-kira balik modal berapa hari?',
                        ].join('\n'),
                      )
                    }
                    className="rounded-md border border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700 hover:bg-orange-100"
                  >
                    + Isi contoh
                  </button>
                </div>
                <textarea
                  value={botPromptsText}
                  onChange={(e) => setBotPromptsText(e.target.value)}
                  rows={8}
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder={
                    'Halo sis! Cleanoz beneran ampuh ya?\nBisa COD nggak kak?\nStok masih banyak?'
                  }
                />
                {botPromptsText.split('\n').filter((s) => s.trim().length >= 3).length === 0 ? (
                  <div className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                    ⚠️ <span>
                      Bot AKTIF tapi belum ada pertanyaan — bot gak akan
                      jalan. Klik <strong>+ Isi contoh</strong> di atas atau
                      tulis manual (min 3 huruf per baris).
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {botPromptsText.split('\n').filter((s) => s.trim().length >= 3).length}{' '}
                    pertanyaan aktif. Bot pick random tiap interval.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pb-6">
        <Button variant="ghost" onClick={() => router.back()} disabled={saving}>
          Batal
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Simpan…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" /> {mode === 'create' ? 'Bikin Room' : 'Simpan Perubahan'}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
