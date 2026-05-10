'use client'

// Tab Generate Ide:
// 1. User pilih LP (dropdown) atau klik "Brief manual"
// 2. Klik "Generate 15 ide" → loading → 15 cards muncul
// 3. Free preview: 3 ide (yg isFreePreview=true) selalu visible.
//    12 sisanya akan blur kalau saldo nol. Saat ini sederhana: tampilkan
//    semua kalau API berhasil (deduct sudah jalan), atau redirect /pricing
//    kalau saldo nol.
// 4. Checkbox per ide → tombol "Bikin konten ini"
// 5. Pilih channel per ide → POST generate → redirect ke library
import {
  AlertCircle,
  Loader2,
  Megaphone,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  Wand2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface LandingPage {
  id: string
  title: string
  slug: string
  isPublished: boolean
}

interface Idea {
  id: string
  method: 'HOOK' | 'PAIN' | 'PERSONA' | 'TRENDS' | 'WINNER' | 'ADS_FRAMEWORK'
  hook: string
  angle: string
  channelFit: string[]
  format: string
  whyItWorks: string
  predictedVirality: number
  funnelStage: 'TOFU' | 'MOFU' | 'BOFU'
  estimatedTokens: number
  isFreePreview: boolean
}

interface Props {
  initialLpId?: string
  landingPages: LandingPage[]
  tokenBalance: number
  initialIdeas: Idea[]
  onPiecesCreated: () => void
}

const METHOD_LABEL: Record<string, { label: string; cls: string }> = {
  HOOK: { label: 'Hook Framework', cls: 'bg-primary-100 text-primary-700' },
  PAIN: { label: 'Pain Point', cls: 'bg-rose-100 text-rose-700' },
  PERSONA: { label: 'Persona POV', cls: 'bg-purple-100 text-purple-700' },
  TRENDS: { label: '🔥 Trending Search', cls: 'bg-amber-100 text-amber-700' },
  WINNER: { label: '🏆 Pola Viral', cls: 'bg-emerald-100 text-emerald-700' },
  ADS_FRAMEWORK: { label: '🎯 Iklan Berbayar', cls: 'bg-fuchsia-100 text-fuchsia-700' },
}

const FUNNEL_LABEL: Record<string, { label: string; cls: string }> = {
  TOFU: { label: 'Awareness', cls: 'bg-blue-100 text-blue-700' },
  MOFU: { label: 'Pertimbangan', cls: 'bg-amber-100 text-amber-700' },
  BOFU: { label: 'Beli', cls: 'bg-emerald-100 text-emerald-700' },
}

const CHANNEL_LABEL: Record<string, string> = {
  WA_STATUS: 'WA Status',
  IG_STORY: 'IG Story',
  IG_POST: 'IG Post',
  IG_CAROUSEL: 'IG Carousel',
  IG_REELS: 'IG Reels',
  TIKTOK: 'TikTok',
  META_ADS: 'Meta Ads',
  TIKTOK_ADS: 'TikTok Ads',
}

const ADS_CHANNELS = new Set(['META_ADS', 'TIKTOK_ADS'])

const ALL_CHANNELS = [
  'WA_STATUS',
  'IG_STORY',
  'IG_POST',
  'IG_CAROUSEL',
  'IG_REELS',
  'TIKTOK',
  'META_ADS',
  'TIKTOK_ADS',
] as const

const ALL_FUNNELS = ['TOFU', 'MOFU', 'BOFU'] as const

const FUNNEL_FRIENDLY_LABEL: Record<string, { label: string; desc: string }> = {
  TOFU: { label: 'Awareness', desc: 'Kenalin produk, tarik perhatian luas' },
  MOFU: { label: 'Pertimbangan', desc: 'Edukasi & yakinkan calon pembeli' },
  BOFU: { label: 'Beli', desc: 'Push offer, urgency, testimoni' },
}

const PREF_KEY_CHANNELS = 'hulao-content-target-channels'
const PREF_KEY_FUNNELS = 'hulao-content-target-funnels'

export function IdeaGeneratorTab({
  initialLpId,
  landingPages,
  tokenBalance,
  initialIdeas,
  onPiecesCreated,
}: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<'lp' | 'manual'>(
    initialLpId || landingPages.length > 0 ? 'lp' : 'manual',
  )
  const [lpId, setLpId] = useState<string>(initialLpId ?? landingPages[0]?.id ?? '')
  const [manualTitle, setManualTitle] = useState('')
  const [manualAudience, setManualAudience] = useState('')
  const [manualOffer, setManualOffer] = useState('')

  const [generating, setGenerating] = useState(false)
  const [includeTrends, setIncludeTrends] = useState(false)
  const [includeWinner, setIncludeWinner] = useState(false)
  const [includeAdsFramework, setIncludeAdsFramework] = useState(false)
  // Phase 6 — saat user select ide ADS, butuh format (IMAGE/VIDEO/CAROUSEL).
  // Map: ideaId → 'IMAGE' | 'VIDEO' | 'CAROUSEL'. Fallback inferred dari format ide.
  const [adsFormatChoice, setAdsFormatChoice] = useState<Map<string, string>>(new Map())
  // Filter target — default semua. Persist di localStorage supaya next time
  // auto-restore.
  const [targetChannels, setTargetChannels] = useState<string[]>(
    Array.from(ALL_CHANNELS),
  )
  const [targetFunnels, setTargetFunnels] = useState<string[]>(
    Array.from(ALL_FUNNELS),
  )

  // Load preference dari localStorage saat mount.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const ch = localStorage.getItem(PREF_KEY_CHANNELS)
      if (ch) {
        const parsed = JSON.parse(ch)
        if (Array.isArray(parsed) && parsed.length > 0) setTargetChannels(parsed)
      }
      const fn = localStorage.getItem(PREF_KEY_FUNNELS)
      if (fn) {
        const parsed = JSON.parse(fn)
        if (Array.isArray(parsed) && parsed.length > 0) setTargetFunnels(parsed)
      }
    } catch {
      // ignore
    }
  }, [])

  // Persist preference saat berubah.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(PREF_KEY_CHANNELS, JSON.stringify(targetChannels))
    } catch {
      /* ignore */
    }
  }, [targetChannels])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(PREF_KEY_FUNNELS, JSON.stringify(targetFunnels))
    } catch {
      /* ignore */
    }
  }, [targetFunnels])

  function toggleChannel(c: string) {
    setTargetChannels((arr) =>
      arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c],
    )
  }
  function toggleFunnel(f: string) {
    setTargetFunnels((arr) =>
      arr.includes(f) ? arr.filter((x) => x !== f) : [...arr, f],
    )
  }
  // Initial state dari server-fetched unpromoted ideas — preserve refresh.
  const [ideas, setIdeas] = useState<Idea[]>(initialIdeas)
  const [tokensCharged, setTokensCharged] = useState<number | null>(null)
  const [selected, setSelected] = useState<Map<string, string>>(new Map())
  // selected: ideaId → channel chosen

  const [briefBuilding, setBriefBuilding] = useState(false)

  // Saat user ganti LP di dropdown, navigate ulang supaya server fetch
  // ide untuk LP baru. Lebih simple daripada client-side fetch.
  function handleLpChange(newLpId: string) {
    setLpId(newLpId)
    if (newLpId !== initialLpId) {
      router.push(`/content?lpId=${newLpId}`)
    }
  }

  async function handleGenerate() {
    if (mode === 'lp' && !lpId) {
      toast.error('Pilih LP dulu')
      return
    }
    if (mode === 'manual' && !manualTitle.trim()) {
      toast.error('Isi judul produk dulu')
      return
    }
    if (targetChannels.length === 0) {
      toast.error('Pilih minimal 1 channel')
      return
    }
    if (targetFunnels.length === 0) {
      toast.error('Pilih minimal 1 tahap funnel')
      return
    }
    setGenerating(true)
    setIdeas([])
    setSelected(new Map())
    try {
      const baseBody = {
        includeTrends,
        includeWinner,
        includeAdsFramework,
        targetChannels,
        targetFunnels,
      }
      const res = await fetch('/api/content/ideas/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'lp'
            ? { ...baseBody, lpId }
            : {
                ...baseBody,
                manualTitle: manualTitle.trim(),
                manualAudience: manualAudience.trim() || undefined,
                manualOffer: manualOffer.trim() || undefined,
              },
        ),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        if (res.status === 402) {
          toast.error(json.error)
          return
        }
        toast.error(json.error || 'Gagal generate ide')
        return
      }
      setIdeas(json.data.ideas as Idea[])
      setTokensCharged(json.data.tokensCharged ?? null)
      toast.success(`${json.data.ideas.length} ide siap dipilih`)
    } catch (err) {
      console.error(err)
      toast.error('Gagal request ide. Coba lagi.')
    } finally {
      setGenerating(false)
    }
  }

  function toggleIdea(idea: Idea) {
    const next = new Map(selected)
    if (next.has(idea.id)) {
      next.delete(idea.id)
    } else {
      next.set(idea.id, idea.channelFit[0] ?? 'IG_POST')
    }
    setSelected(next)
  }

  function setIdeaChannel(ideaId: string, channel: string) {
    const next = new Map(selected)
    next.set(ideaId, channel)
    setSelected(next)
  }

  function inferAdsFormat(idea: Idea | undefined): 'IMAGE' | 'VIDEO' | 'CAROUSEL' {
    if (!idea) return 'IMAGE'
    if (idea.format === 'ADS_VIDEO') return 'VIDEO'
    if (idea.format === 'ADS_CAROUSEL') return 'CAROUSEL'
    return 'IMAGE'
  }

  async function handleGeneratePieces() {
    if (selected.size === 0) {
      toast.error('Pilih minimal 1 ide')
      return
    }
    setBriefBuilding(true)
    try {
      // 1. Create brief.
      const briefRes = await fetch('/api/content/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'lp'
            ? { lpId }
            : {
                manualTitle: manualTitle.trim(),
                manualAudience: manualAudience.trim() || undefined,
                manualOffer: manualOffer.trim() || undefined,
              },
        ),
      })
      const briefJson = await briefRes.json()
      if (!briefRes.ok || !briefJson.success) {
        toast.error(briefJson.error || 'Gagal create brief')
        return
      }
      const briefId = briefJson.data.brief.id

      // 2. Split ke organic vs ads.
      const organicItems: { ideaId: string; channel: string }[] = []
      const adsItems: { ideaId: string; platform: string; format: string }[] = []
      selected.forEach((channel, ideaId) => {
        if (ADS_CHANNELS.has(channel)) {
          const format =
            adsFormatChoice.get(ideaId) ??
            inferAdsFormat(ideas.find((it) => it.id === ideaId))
          adsItems.push({ ideaId, platform: channel, format })
        } else {
          organicItems.push({ ideaId, channel })
        }
      })

      const allResults: { status: string; title?: string }[] = []

      if (organicItems.length > 0) {
        const genRes = await fetch('/api/content/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ briefId, items: organicItems }),
        })
        const genJson = await genRes.json()
        if (!genRes.ok || !genJson.success) {
          toast.error(genJson.error || 'Gagal generate konten organik')
          return
        }
        allResults.push(...(genJson.data.results as { status: string; title?: string }[]))
      }

      if (adsItems.length > 0) {
        const adsRes = await fetch('/api/content/ads/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ briefId, items: adsItems }),
        })
        const adsJson = await adsRes.json()
        if (!adsRes.ok || !adsJson.success) {
          toast.error(adsJson.error || 'Gagal generate iklan')
          return
        }
        allResults.push(...(adsJson.data.results as { status: string; title?: string }[]))
      }

      const ok = allResults.filter((r) => r.status === 'OK').length
      const failed = allResults.length - ok
      if (ok > 0) {
        toast.success(
          `${ok} konten siap di Library${failed > 0 ? ` (${failed} gagal)` : ''}`,
        )
        onPiecesCreated()
      } else {
        toast.error('Semua konten gagal di-generate. Cek saldo token.')
      }
    } catch (err) {
      console.error(err)
      toast.error('Gagal proses. Coba lagi.')
    } finally {
      setBriefBuilding(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Brief input section */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-warm-900">
                Sumber ide
              </h2>
              <p className="text-xs text-warm-500">
                Hulao analisa LP atau brief kamu, lalu kasih 15 ide siap pakai.
              </p>
            </div>
            <span className="text-xs text-warm-500">
              Saldo: <strong>{tokenBalance.toLocaleString('id-ID')} token</strong>
            </span>
          </div>

          <div className="flex gap-1 rounded-md border border-warm-300 bg-warm-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode('lp')}
              className={`flex-1 rounded px-3 py-1.5 font-medium ${
                mode === 'lp'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-warm-600 hover:text-warm-900'
              }`}
              disabled={landingPages.length === 0}
            >
              Dari LP saya {landingPages.length > 0 && `(${landingPages.length})`}
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`flex-1 rounded px-3 py-1.5 font-medium ${
                mode === 'manual'
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-warm-600 hover:text-warm-900'
              }`}
            >
              Brief manual
            </button>
          </div>

          {mode === 'lp' && (
            <div className="space-y-1.5">
              <Label htmlFor="lp-select">Pilih LP</Label>
              {landingPages.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  Belum punya LP. Buat dulu di{' '}
                  <Link
                    href="/landing-pages"
                    className="font-semibold underline"
                  >
                    Landing Pages
                  </Link>{' '}
                  atau pakai brief manual.
                </div>
              ) : (
                <select
                  id="lp-select"
                  value={lpId}
                  onChange={(e) => handleLpChange(e.target.value)}
                  className="w-full rounded-md border border-warm-300 bg-white px-3 py-2 text-sm"
                >
                  {landingPages.map((lp) => (
                    <option key={lp.id} value={lp.id}>
                      {lp.title} {lp.isPublished ? '✓' : '(draft)'}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {mode === 'manual' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="manual-title">Judul produk *</Label>
                <Input
                  id="manual-title"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="Contoh: Kelas Online Closing WhatsApp"
                  maxLength={200}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-audience">
                  Target audience (opsional)
                </Label>
                <Input
                  id="manual-audience"
                  value={manualAudience}
                  onChange={(e) => setManualAudience(e.target.value)}
                  placeholder="Contoh: seller pemula yg jualan via WA"
                  maxLength={500}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manual-offer">
                  Penawaran/offer utama (opsional)
                </Label>
                <Input
                  id="manual-offer"
                  value={manualOffer}
                  onChange={(e) => setManualOffer(e.target.value)}
                  placeholder="Contoh: bonus template chat closing"
                  maxLength={500}
                />
              </div>
            </div>
          )}

          {/* Section: pilih channel target */}
          <div className="space-y-2 rounded-md border border-warm-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-warm-900">
                Mau bikin konten apa? ({targetChannels.length}/8)
              </Label>
              <div className="flex gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setTargetChannels(Array.from(ALL_CHANNELS))}
                  className="text-primary-600 hover:underline"
                >
                  Semua
                </button>
                <span className="text-warm-300">·</span>
                <button
                  type="button"
                  onClick={() => setTargetChannels([])}
                  className="text-warm-500 hover:underline"
                >
                  Kosongin
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {ALL_CHANNELS.map((c) => {
                const checked = targetChannels.includes(c)
                return (
                  <label
                    key={c}
                    className={`flex cursor-pointer items-center gap-2 rounded border px-2.5 py-1.5 text-xs transition-all ${
                      checked
                        ? 'border-primary-500 bg-primary-50 font-medium text-primary-900'
                        : 'border-warm-200 text-warm-600 hover:bg-warm-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleChannel(c)}
                      className="size-3.5 cursor-pointer accent-primary-500"
                    />
                    {CHANNEL_LABEL[c]}
                  </label>
                )
              })}
            </div>
          </div>

          {/* Section: pilih funnel target */}
          <div className="space-y-2 rounded-md border border-warm-200 bg-white p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-warm-900">
                Targetin tahap apa? ({targetFunnels.length}/3)
              </Label>
              <div className="flex gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setTargetFunnels(Array.from(ALL_FUNNELS))}
                  className="text-primary-600 hover:underline"
                >
                  Semua
                </button>
                <span className="text-warm-300">·</span>
                <button
                  type="button"
                  onClick={() => setTargetFunnels([])}
                  className="text-warm-500 hover:underline"
                >
                  Kosongin
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              {ALL_FUNNELS.map((f) => {
                const checked = targetFunnels.includes(f)
                const meta = FUNNEL_FRIENDLY_LABEL[f]!
                return (
                  <label
                    key={f}
                    className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 text-xs transition-all ${
                      checked
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-warm-200 hover:bg-warm-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFunnel(f)}
                      className="mt-0.5 size-3.5 cursor-pointer accent-primary-500"
                    />
                    <div className="flex-1">
                      <div className={`font-semibold ${checked ? 'text-primary-900' : 'text-warm-900'}`}>
                        {meta.label}
                      </div>
                      <div className="text-[11px] text-warm-500">{meta.desc}</div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-warm-200 bg-warm-50 p-3 text-xs hover:bg-warm-100">
            <input
              type="checkbox"
              checked={includeTrends}
              onChange={(e) => setIncludeTrends(e.target.checked)}
              className="mt-0.5 size-4 cursor-pointer accent-primary-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1 font-semibold text-warm-900">
                <TrendingUp className="size-3.5 text-amber-600" />
                Tambahkan ide trending search (+5 ide)
              </div>
              <p className="mt-0.5 text-[11px] text-warm-500">
                Hulao cek apa yg lagi dicari orang di Google Indonesia terkait
                produk kamu, lalu buat ide riding wave-nya.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-warm-200 bg-warm-50 p-3 text-xs hover:bg-warm-100">
            <input
              type="checkbox"
              checked={includeWinner}
              onChange={(e) => setIncludeWinner(e.target.checked)}
              className="mt-0.5 size-4 cursor-pointer accent-primary-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1 font-semibold text-warm-900">
                <Trophy className="size-3.5 text-emerald-600" />
                Belajar dari konten viral (+5 ide)
              </div>
              <p className="mt-0.5 text-[11px] text-warm-500">
                Hulao analisa konten kamu dgn reach tertinggi & buat ide baru
                yg tiru pola sukses-nya. Butuh konten POSTED dgn metric tercatat
                — input metric di tab Insights setelah post.
              </p>
            </div>
          </label>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-warm-200 bg-warm-50 p-3 text-xs hover:bg-warm-100">
            <input
              type="checkbox"
              checked={includeAdsFramework}
              onChange={(e) => setIncludeAdsFramework(e.target.checked)}
              className="mt-0.5 size-4 cursor-pointer accent-fuchsia-500"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1 font-semibold text-warm-900">
                <Megaphone className="size-3.5 text-fuchsia-600" />
                Tambahkan ide iklan berbayar (+5 ide)
              </div>
              <p className="mt-0.5 text-[11px] text-warm-500">
                5 framework direct response untuk Meta Ads & TikTok Ads
                (Hormozi/PAS/BAB/Social Proof/Scarcity). Output siap jadi ad
                creative full — 5 headline variant + 3 primary text + visual
                brief + storyboard video.
              </p>
            </div>
          </label>

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full bg-primary-500 text-white hover:bg-primary-600"
            size="lg"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Hulao lagi mikirin ide...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 size-4" />
                Generate {15 + (includeTrends ? 5 : 0) + (includeWinner ? 5 : 0) + (includeAdsFramework ? 5 : 0)} ide konten
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Ideas grid */}
      {ideas.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-warm-900">
              Pilih ide yg mau di-bikin ({selected.size}/{ideas.length})
            </h2>
            {tokensCharged !== null && (
              <span className="text-xs text-warm-500">
                Token kepake: {tokensCharged.toLocaleString('id-ID')}
              </span>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {ideas.map((idea) => {
              const isSelected = selected.has(idea.id)
              const channelChosen = selected.get(idea.id) ?? idea.channelFit[0]
              const method = METHOD_LABEL[idea.method]
              const funnel = FUNNEL_LABEL[idea.funnelStage]
              return (
                <Card
                  key={idea.id}
                  className={`cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary-500 ring-2 ring-primary-200'
                      : 'hover:border-warm-300'
                  }`}
                  onClick={() => toggleIdea(idea)}
                >
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap gap-1">
                        {method && (
                          <Badge className={`text-[10px] ${method.cls}`}>
                            {method.label}
                          </Badge>
                        )}
                        {funnel && (
                          <Badge className={`text-[10px] ${funnel.cls}`}>
                            {funnel.label}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star
                            key={i}
                            className={`size-3 ${
                              i < idea.predictedVirality
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-warm-300'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <p className="text-sm font-semibold leading-snug text-warm-900">
                      {idea.hook}
                    </p>
                    <p className="text-xs leading-relaxed text-warm-600">
                      {idea.angle}
                    </p>

                    <div className="border-t border-warm-100 pt-2 text-[11px] text-warm-500">
                      <strong>Kenapa works:</strong> {idea.whyItWorks}
                    </div>

                    {isSelected && (
                      <div
                        className="space-y-2 rounded-md border border-primary-200 bg-primary-50 p-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div>
                          <Label className="mb-1 block text-[11px] font-medium text-primary-900">
                            {channelChosen && ADS_CHANNELS.has(channelChosen)
                              ? 'Iklan di platform:'
                              : 'Posting di channel:'}
                          </Label>
                          <select
                            value={channelChosen}
                            onChange={(e) =>
                              setIdeaChannel(idea.id, e.target.value)
                            }
                            className="w-full rounded border border-primary-300 bg-white px-2 py-1 text-xs"
                          >
                            {idea.channelFit.map((c) => (
                              <option key={c} value={c}>
                                {CHANNEL_LABEL[c] ?? c}
                              </option>
                            ))}
                          </select>
                        </div>
                        {channelChosen && ADS_CHANNELS.has(channelChosen) && (
                          <div>
                            <Label className="mb-1 block text-[11px] font-medium text-fuchsia-900">
                              Format iklan:
                            </Label>
                            <select
                              value={
                                adsFormatChoice.get(idea.id) ?? inferAdsFormat(idea)
                              }
                              onChange={(e) => {
                                const next = new Map(adsFormatChoice)
                                next.set(idea.id, e.target.value)
                                setAdsFormatChoice(next)
                              }}
                              className="w-full rounded border border-fuchsia-300 bg-white px-2 py-1 text-xs"
                            >
                              <option value="IMAGE">Static Image</option>
                              <option value="VIDEO">Video Ad (storyboard)</option>
                              <option value="CAROUSEL">Carousel</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {selected.size > 0 && (
            <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-lg border border-primary-300 bg-primary-50 p-4 shadow-lg">
              <div className="text-sm">
                <strong>{selected.size} ide</strong> dipilih.{' '}
                <span className="text-warm-600">
                  Estimasi: ±
                  {Array.from(selected.keys())
                    .map(
                      (id) =>
                        ideas.find((it) => it.id === id)?.estimatedTokens ?? 800,
                    )
                    .reduce((a, b) => a + b, 0)
                    .toLocaleString('id-ID')}{' '}
                  token
                </span>
              </div>
              <Button
                onClick={handleGeneratePieces}
                disabled={briefBuilding}
                className="bg-primary-500 text-white hover:bg-primary-600"
              >
                {briefBuilding ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Bikin konten...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 size-4" />
                    Bikin {selected.size} konten
                  </>
                )}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {ideas.length === 0 && !generating && (
        <div className="rounded-xl border border-dashed border-warm-200 bg-warm-50 py-12 text-center">
          <Sparkles className="mx-auto mb-2 size-8 text-warm-300" />
          <p className="text-sm font-medium text-warm-700">
            Klik tombol di atas untuk dapat 15 ide konten dari Hulao
          </p>
          <p className="mt-1 text-xs text-warm-500">
            Hook framework + pain-point audience + persona POV — siap pilih
          </p>
        </div>
      )}

      {/* Saldo nol warning */}
      {tokenBalance < 100 && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertCircle className="size-4 shrink-0" />
          <div>
            Saldo token kamu rendah ({tokenBalance.toLocaleString('id-ID')}).{' '}
            <Link
              href="/pricing"
              className="font-semibold underline hover:text-amber-700"
            >
              Top up sekarang
            </Link>{' '}
            untuk lanjut generate ide & konten.
          </div>
        </div>
      )}
    </div>
  )
}
