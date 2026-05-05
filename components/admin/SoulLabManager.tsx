'use client'

// Soul Testing Lab — admin UI untuk simulasi 2 AI (penjual vs pembeli).
//
// Tiga section utama yang muncul bertahap:
// - Setup: form 2 kolom (penjual/pembeli) + pengaturan ronde
// - Live: chat bubble realtime saat simulasi RUNNING (polling 1.5s)
// - Result: kartu evaluasi setelah COMPLETED
// Plus History table di bawah, dengan modal detail.
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Download,
  FlaskConical,
  Loader2,
  Pencil,
  Play,
  RefreshCw,
  Save,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { formatRupiah } from '@/lib/format'
import { cn } from '@/lib/utils'

// ─────────────────────────────────────────
// Types (mirror backend response)
// ─────────────────────────────────────────

interface PersonalityOption {
  id: string
  name: string
  description: string
  order: number
}
interface StyleOption {
  id: string
  name: string
  description: string
  order: number
}
interface ModelOption {
  id: string
  name: string
  provider: 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'
  modelId: string
  inputPricePer1M: number
  outputPricePer1M: number
}
interface ConversationTurn {
  role: 'SELLER' | 'BUYER'
  content: string
  timestamp: string
  tokens: { input: number; output: number }
}
interface EvaluationData {
  score: number
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  outcome: 'SOLD' | 'REJECTED' | 'INCONCLUSIVE'
  closingRound: number | null
  mainObjection: string | null
  summary: string
}
interface Simulation {
  id: string
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  currentRound: number
  totalRounds: number
  starterRole: 'SELLER' | 'BUYER'
  starterMessage: string
  // Schema baru — Personality + Style
  sellerPersonality: { id: string; name: string } | null
  sellerStyle: { id: string; name: string } | null
  buyerPersonality: { id: string; name: string } | null
  buyerStyle: { id: string; name: string } | null
  // Legacy fallback (row pra-migrasi)
  sellerSoul: { id: string; name: string } | null
  buyerSoul: { id: string; name: string } | null
  sellerModel: { id: string; name: string; provider: string }
  buyerModel: { id: string; name: string; provider: string }
  sellerContext: string
  buyerScenario: string
  conversation: ConversationTurn[]
  evaluationScore: number | null
  evaluationData: EvaluationData | null
  outcome: 'SOLD' | 'REJECTED' | 'INCONCLUSIVE' | null
  totalCostRp: number
  totalInputTokens: number
  totalOutputTokens: number
  errorMessage: string | null
  createdAt: string
  completedAt: string | null
  triggerUser: { id: string; name: string | null; email: string }
}

// Helper — label agen (Personality + Style baru, fallback Soul.name lama).
function agentLabel(s: {
  personality?: { name: string } | null
  style?: { name: string } | null
  soul?: { name: string } | null
}): string {
  if (s.personality && s.style) return `${s.personality.name} + ${s.style.name}`
  if (s.personality) return s.personality.name
  if (s.soul) return s.soul.name
  return '(unknown)'
}
interface PresetConfig {
  sellerPersonalityId: string
  sellerStyleId: string
  sellerModelId: string
  sellerContext: string
  buyerPersonalityId: string
  buyerStyleId: string
  buyerModelId: string
  buyerScenario: string
  totalRounds: number
  starterRole: 'SELLER' | 'BUYER'
  starterMessage: string
}
interface Preset {
  id: string
  name: string
  description: string | null
  config: PresetConfig
  createdAt: string
  creator: { name: string | null; email: string } | null
}

interface FormState {
  sellerPersonalityId: string
  sellerStyleId: string
  sellerModelId: string
  sellerContext: string
  buyerPersonalityId: string
  buyerStyleId: string
  buyerModelId: string
  buyerScenario: string
  totalRounds: number
  starterRole: 'SELLER' | 'BUYER'
  starterMessage: string
}

const DEFAULT_FORM: FormState = {
  sellerPersonalityId: '',
  sellerStyleId: '',
  sellerModelId: '',
  sellerContext: '',
  buyerPersonalityId: '',
  buyerStyleId: '',
  buyerModelId: '',
  buyerScenario: '',
  totalRounds: 10,
  starterRole: 'BUYER',
  starterMessage: 'halo kak, mau tanya',
}

// ─────────────────────────────────────────
// Main component
// ─────────────────────────────────────────

export function SoulLabManager() {
  const [personalities, setPersonalities] = useState<PersonalityOption[]>([])
  const [styles, setStyles] = useState<StyleOption[]>([])
  const [models, setModels] = useState<ModelOption[]>([])
  const [setupLoading, setSetupLoading] = useState(true)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [activeSimId, setActiveSimId] = useState<string | null>(null)
  const [activeSim, setActiveSim] = useState<Simulation | null>(null)
  const [estimateRp, setEstimateRp] = useState<number | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [presets, setPresets] = useState<Preset[]>([])
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [savePresetOpen, setSavePresetOpen] = useState(false)

  // Load setup data
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/admin/soul-lab/setup')
        const json = await res.json()
        if (cancelled) return
        if (json.success) {
          setPersonalities(json.data.personalities)
          setStyles(json.data.styles)
          setModels(json.data.models)
        } else {
          toast.error(json.error || 'Gagal load data')
        }
      } catch {
        if (!cancelled) toast.error('Network error saat load data')
      } finally {
        if (!cancelled) setSetupLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-estimate biaya saat model atau ronde berubah (debounced)
  useEffect(() => {
    if (!form.sellerModelId || !form.buyerModelId) {
      // Reset di microtask supaya tidak setState synchronous di effect body.
      void Promise.resolve().then(() => setEstimateRp(null))
      return
    }
    let cancelled = false
    const t = setTimeout(async () => {
      setEstimating(true)
      try {
        const res = await fetch('/api/admin/soul-lab/estimate-cost', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sellerModelId: form.sellerModelId,
            buyerModelId: form.buyerModelId,
            totalRounds: form.totalRounds,
          }),
        })
        const json = await res.json()
        if (!cancelled && json.success) setEstimateRp(json.data.estimateRp)
      } catch {
        /* abaikan */
      } finally {
        if (!cancelled) setEstimating(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [form.sellerModelId, form.buyerModelId, form.totalRounds])

  // Polling simulasi aktif tiap 1.5 detik
  useEffect(() => {
    if (!activeSimId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    async function tick() {
      try {
        const res = await fetch(`/api/admin/soul-lab/simulations/${activeSimId}`)
        const json = await res.json()
        if (cancelled) return
        if (json.success) {
          setActiveSim(json.data as Simulation)
          if (json.data.status === 'RUNNING') {
            timer = setTimeout(tick, 1500)
          }
        } else {
          toast.error(json.error || 'Gagal poll status')
        }
      } catch {
        if (!cancelled) timer = setTimeout(tick, 3000)
      }
    }
    void tick()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [activeSimId])

  // Self-test warning kalau Personality + Style penjual & pembeli sama persis.
  const sameAgents =
    !!form.sellerPersonalityId &&
    form.sellerPersonalityId === form.buyerPersonalityId &&
    form.sellerStyleId === form.buyerStyleId

  function setF<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  function validateForm(): string | null {
    if (!form.sellerPersonalityId) return 'Pilih Kepribadian penjual'
    if (!form.sellerStyleId) return 'Pilih Gaya Balas penjual'
    if (!form.buyerPersonalityId) return 'Pilih Kepribadian pembeli'
    if (!form.buyerStyleId) return 'Pilih Gaya Balas pembeli'
    if (!form.sellerModelId) return 'Pilih model penjual'
    if (!form.buyerModelId) return 'Pilih model pembeli'
    if (form.sellerContext.trim().length < 10) return 'Konteks bisnis minimal 10 karakter'
    if (form.buyerScenario.trim().length < 10) return 'Skenario pembeli minimal 10 karakter'
    if (form.starterMessage.trim().length < 2) return 'Pesan pembuka terlalu pendek'
    if (form.totalRounds < 2 || form.totalRounds > 30) return 'Ronde 2–30'
    return null
  }

  async function startSimulation() {
    const err = validateForm()
    if (err) {
      toast.error(err)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/admin/soul-lab/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error || 'Gagal mulai simulasi')
        return
      }
      setActiveSimId(json.data.id)
      setActiveSim(null)
      setConfirmOpen(false)
      toast.success('Simulasi dimulai')
    } catch {
      toast.error('Network error')
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelSimulation() {
    if (!activeSimId) return
    if (!confirm('Stop simulasi?')) return
    try {
      const res = await fetch(`/api/admin/soul-lab/simulations/${activeSimId}/cancel`, {
        method: 'POST',
      })
      const json = await res.json()
      if (json.success) toast.success('Simulasi di-cancel')
      else toast.error(json.error || 'Gagal cancel')
    } catch {
      toast.error('Network error')
    }
  }

  async function loadPresets() {
    try {
      const res = await fetch('/api/admin/soul-lab/presets')
      const json = await res.json()
      if (json.success) setPresets(json.data)
      else toast.error(json.error)
    } catch {
      toast.error('Network error')
    }
  }

  function applyPreset(p: Preset) {
    setForm(p.config)
    setPresetsOpen(false)
    toast.success(`Preset "${p.name}" dimuat`)
  }

  async function savePreset(name: string, description: string) {
    const err = validateForm()
    if (err) {
      toast.error(err)
      return false
    }
    try {
      const res = await fetch('/api/admin/soul-lab/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description: description || undefined, config: form }),
      })
      const json = await res.json()
      if (json.success) {
        toast.success('Preset disimpan')
        return true
      }
      toast.error(json.error || 'Gagal simpan preset')
      return false
    } catch {
      toast.error('Network error')
      return false
    }
  }

  function resetForNewSim() {
    setActiveSimId(null)
    setActiveSim(null)
  }

  if (setupLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-warm-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold tracking-tight text-warm-900">
            <FlaskConical className="size-6 text-primary-600" />
            Soul Testing Lab
          </h1>
          <p className="mt-1 text-sm text-warm-500">
            Simulasi 2 AI (penjual vs pembeli) untuk uji efektivitas Soul tanpa pakai WA
            real. Hasil dievaluasi otomatis oleh Claude Sonnet.
          </p>
        </div>
      </div>

      {/* Section A — Setup (sembunyi saat simulasi aktif untuk fokus) */}
      {!activeSimId && (
        <SetupSection
          form={form}
          setF={setF}
          personalities={personalities}
          styles={styles}
          models={models}
          sameAgents={sameAgents}
          estimateRp={estimateRp}
          estimating={estimating}
          onStart={() => setConfirmOpen(true)}
          onLoadPreset={() => {
            void loadPresets()
            setPresetsOpen(true)
          }}
          onSavePreset={() => setSavePresetOpen(true)}
        />
      )}

      {/* Section B — Live View */}
      {activeSim && activeSim.status === 'RUNNING' && (
        <LiveSection sim={activeSim} onCancel={cancelSimulation} />
      )}

      {/* Section C — Results */}
      {activeSim && activeSim.status !== 'RUNNING' && (
        <ResultSection sim={activeSim} onTestAgain={resetForNewSim} />
      )}

      {/* Section D — History */}
      <HistorySection refreshKey={activeSim?.status} />

      {/* Confirm dialog */}
      <ConfirmStartDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        estimateRp={estimateRp}
        sameAgents={sameAgents}
        submitting={submitting}
        onConfirm={startSimulation}
      />

      {/* Presets dialog */}
      <PresetsDialog
        open={presetsOpen}
        onOpenChange={setPresetsOpen}
        presets={presets}
        onApply={applyPreset}
        onDelete={async (id) => {
          if (!confirm('Hapus preset?')) return
          const res = await fetch(`/api/admin/soul-lab/presets/${id}`, { method: 'DELETE' })
          const json = await res.json()
          if (json.success) {
            toast.success('Preset dihapus')
            void loadPresets()
          } else toast.error(json.error)
        }}
      />

      {/* Save preset dialog */}
      <SavePresetDialog
        open={savePresetOpen}
        onOpenChange={setSavePresetOpen}
        onSave={async (name, desc) => {
          const ok = await savePreset(name, desc)
          if (ok) setSavePresetOpen(false)
        }}
      />
    </div>
  )
}

// ─────────────────────────────────────────
// Setup section
// ─────────────────────────────────────────

function SetupSection({
  form,
  setF,
  personalities,
  styles,
  models,
  sameAgents,
  estimateRp,
  estimating,
  onStart,
  onLoadPreset,
  onSavePreset,
}: {
  form: FormState
  setF: <K extends keyof FormState>(k: K, v: FormState[K]) => void
  personalities: PersonalityOption[]
  styles: StyleOption[]
  models: ModelOption[]
  sameAgents: boolean
  estimateRp: number | null
  estimating: boolean
  onStart: () => void
  onLoadPreset: () => void
  onSavePreset: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Setup Simulasi</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <AgentColumn
            label="AGEN PENJUAL"
            accent="primary"
            personalityId={form.sellerPersonalityId}
            styleId={form.sellerStyleId}
            modelId={form.sellerModelId}
            context={form.sellerContext}
            contextLabel="Konteks Bisnis"
            contextPlaceholder="Jualan apa? Harga? Promo? Misal: 'Skincare brand X, harga paket lengkap Rp 350K, promo diskon 20% kalau order hari ini'"
            personalities={personalities}
            styles={styles}
            models={models}
            onPersonalityChange={(v) => setF('sellerPersonalityId', v)}
            onStyleChange={(v) => setF('sellerStyleId', v)}
            onModelChange={(v) => setF('sellerModelId', v)}
            onContextChange={(v) => setF('sellerContext', v)}
          />
          <AgentColumn
            label="AGEN PEMBELI (TESTER)"
            accent="warm"
            personalityId={form.buyerPersonalityId}
            styleId={form.buyerStyleId}
            modelId={form.buyerModelId}
            context={form.buyerScenario}
            contextLabel="Skenario Pembeli"
            contextPlaceholder="Misal: 'Pembeli baru lihat iklan IG, ragu karena harga terasa mahal, pernah kena scam dari toko online lain'"
            personalities={personalities}
            styles={styles}
            models={models}
            onPersonalityChange={(v) => setF('buyerPersonalityId', v)}
            onStyleChange={(v) => setF('buyerStyleId', v)}
            onModelChange={(v) => setF('buyerModelId', v)}
            onContextChange={(v) => setF('buyerScenario', v)}
          />
        </div>

        {sameAgents && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              Kepribadian + Gaya Balas penjual dan pembeli sama persis. Self-test biasanya
              kurang akurat — dua agen akan saling mendukung. Lebih baik pilih Kepribadian
              tester yang berbeda untuk pembeli (mis. &quot;Tester - Pembeli Ragu&quot;).
            </div>
          </div>
        )}

        {/* Pengaturan */}
        <div className="grid gap-4 rounded-lg border border-warm-200 bg-warm-50/50 p-4 md:grid-cols-3">
          <div>
            <Label htmlFor="rounds">Jumlah ronde</Label>
            <Input
              id="rounds"
              type="number"
              min={2}
              max={30}
              value={form.totalRounds}
              onChange={(e) => setF('totalRounds', Math.max(2, Math.min(30, Number(e.target.value) || 2)))}
              className="mt-1"
            />
            <p className="mt-1 text-xs text-warm-500">2–30 ronde</p>
          </div>
          <div>
            <Label>Yang memulai</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={form.starterRole === 'SELLER' ? 'default' : 'outline'}
                onClick={() => setF('starterRole', 'SELLER')}
                className="flex-1"
              >
                Penjual
              </Button>
              <Button
                type="button"
                size="sm"
                variant={form.starterRole === 'BUYER' ? 'default' : 'outline'}
                onClick={() => setF('starterRole', 'BUYER')}
                className="flex-1"
              >
                Pembeli
              </Button>
            </div>
          </div>
          <div className="md:col-span-3">
            <Label htmlFor="starter">Pesan pembuka</Label>
            <Textarea
              id="starter"
              value={form.starterMessage}
              onChange={(e) => setF('starterMessage', e.target.value)}
              rows={2}
              placeholder="halo kak, mau tanya soal produknya"
              className="mt-1"
            />
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-warm-200 pt-4">
          <div className="text-sm text-warm-600">
            {estimating ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="size-3.5 animate-spin" /> Menghitung biaya…
              </span>
            ) : estimateRp !== null ? (
              <span>
                Estimasi biaya:{' '}
                <strong className="text-warm-900">{formatRupiah(estimateRp)}</strong>
              </span>
            ) : (
              <span className="text-warm-400">Pilih model dulu untuk lihat estimasi.</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onSavePreset} type="button">
              <Save className="mr-1 size-4" />
              Simpan Preset
            </Button>
            <Button variant="outline" size="sm" onClick={onLoadPreset} type="button">
              <Bookmark className="mr-1 size-4" />
              Load Preset
            </Button>
            <Button onClick={onStart} type="button">
              <Play className="mr-1 size-4" />
              Mulai Simulasi
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function AgentColumn({
  label,
  accent,
  personalityId,
  styleId,
  modelId,
  context,
  contextLabel,
  contextPlaceholder,
  personalities,
  styles,
  models,
  onPersonalityChange,
  onStyleChange,
  onModelChange,
  onContextChange,
}: {
  label: string
  accent: 'primary' | 'warm'
  personalityId: string
  styleId: string
  modelId: string
  context: string
  contextLabel: string
  contextPlaceholder: string
  personalities: PersonalityOption[]
  styles: StyleOption[]
  models: ModelOption[]
  onPersonalityChange: (v: string) => void
  onStyleChange: (v: string) => void
  onModelChange: (v: string) => void
  onContextChange: (v: string) => void
}) {
  // Tampilkan deskripsi singkat dari pilihan saat ini supaya admin tidak perlu
  // bolak-balik buka /admin/soul-settings.
  const selectedPersonality = personalities.find((p) => p.id === personalityId)
  const selectedStyle = styles.find((s) => s.id === styleId)
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        accent === 'primary'
          ? 'border-primary-200 bg-primary-50/30'
          : 'border-warm-200 bg-warm-50/30',
      )}
    >
      <h3
        className={cn(
          'mb-3 text-xs font-bold uppercase tracking-wider',
          accent === 'primary' ? 'text-primary-700' : 'text-warm-700',
        )}
      >
        {label}
      </h3>
      <div className="space-y-3">
        <div>
          <Label>Kepribadian</Label>
          <Select value={personalityId} onValueChange={onPersonalityChange}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Pilih Kepribadian…" />
            </SelectTrigger>
            <SelectContent>
              {personalities.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPersonality && (
            <p className="mt-1 text-[11px] text-warm-500">
              {selectedPersonality.description}
            </p>
          )}
        </div>
        <div>
          <Label>Gaya Balas</Label>
          <Select value={styleId} onValueChange={onStyleChange}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Pilih Gaya Balas…" />
            </SelectTrigger>
            <SelectContent>
              {styles.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedStyle && (
            <p className="mt-1 text-[11px] text-warm-500">{selectedStyle.description}</p>
          )}
        </div>
        <div>
          <Label>Model AI</Label>
          <Select value={modelId} onValueChange={onModelChange}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Pilih model…" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name} <span className="text-warm-400">· {m.provider}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{contextLabel}</Label>
          <Textarea
            value={context}
            onChange={(e) => onContextChange(e.target.value)}
            rows={5}
            placeholder={contextPlaceholder}
            className="mt-1"
          />
          <p className="mt-1 text-[11px] text-warm-400">
            {context.length} / 8000 karakter
          </p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// Live section — chat bubble realtime
// ─────────────────────────────────────────

function LiveSection({ sim, onCancel }: { sim: Simulation; onCancel: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [sim.conversation.length])

  // Tampilkan typing indicator kalau lawan giliran (next role yg belum balas)
  const lastTurn = sim.conversation[sim.conversation.length - 1]
  const nextRole: 'SELLER' | 'BUYER' = lastTurn
    ? lastTurn.role === 'SELLER'
      ? 'BUYER'
      : 'SELLER'
    : sim.starterRole === 'SELLER'
      ? 'BUYER'
      : 'SELLER'

  const sellerLabel = agentLabel({
    personality: sim.sellerPersonality,
    style: sim.sellerStyle,
    soul: sim.sellerSoul,
  })
  const buyerLabel = agentLabel({
    personality: sim.buyerPersonality,
    style: sim.buyerStyle,
    soul: sim.buyerSoul,
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">
            Ronde {sim.currentRound} / {sim.totalRounds}
          </CardTitle>
          <p className="text-xs text-warm-500">
            {sellerLabel} ({sim.sellerModel.name}) vs {buyerLabel} (
            {sim.buyerModel.name})
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-warm-700">
            {formatRupiah(Math.ceil(sim.totalCostRp))}
          </span>
          <Button variant="destructive" size="sm" onClick={onCancel}>
            <Square className="mr-1 size-3.5" />
            Stop
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={scrollRef}
          className="h-[460px] overflow-y-auto rounded-lg bg-[#e5ddd5] p-4"
        >
          {sim.conversation.map((turn, i) => (
            <ChatBubble key={i} turn={turn} />
          ))}
          <TypingIndicator role={nextRole} />
        </div>
      </CardContent>
    </Card>
  )
}

function ChatBubble({ turn }: { turn: ConversationTurn }) {
  const isSeller = turn.role === 'SELLER'
  const time = new Date(turn.timestamp).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <div
      className={cn(
        'mb-2 flex',
        isSeller ? 'justify-end' : 'justify-start',
      )}
    >
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm',
          isSeller
            ? 'rounded-tr-sm bg-primary-500 text-white'
            : 'rounded-tl-sm bg-white text-warm-900',
        )}
      >
        <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
          {isSeller ? 'Penjual' : 'Pembeli'}
        </div>
        <div className="whitespace-pre-wrap break-words">{turn.content}</div>
        <div
          className={cn(
            'mt-1 text-right text-[10px]',
            isSeller ? 'text-primary-100' : 'text-warm-400',
          )}
        >
          {time}
        </div>
      </div>
    </div>
  )
}

function TypingIndicator({ role }: { role: 'SELLER' | 'BUYER' }) {
  const isSeller = role === 'SELLER'
  return (
    <div className={cn('flex', isSeller ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'rounded-2xl px-3 py-2 shadow-sm',
          isSeller ? 'rounded-tr-sm bg-primary-500/70' : 'rounded-tl-sm bg-white/80',
        )}
      >
        <div className="flex gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-warm-400 [animation-delay:-0.3s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-warm-400 [animation-delay:-0.15s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-warm-400" />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// Results section
// ─────────────────────────────────────────

function ResultSection({
  sim,
  onTestAgain,
}: {
  sim: Simulation
  onTestAgain: () => void
}) {
  if (sim.status === 'FAILED') {
    return (
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-red-700">
            <XCircle className="size-5" /> Simulasi Gagal
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-warm-700">
            {sim.errorMessage || 'Error tidak diketahui'}
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={onTestAgain}>
              <RefreshCw className="mr-1 size-4" />
              Coba Setup Baru
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }
  if (sim.status === 'CANCELLED') {
    return (
      <Card className="border-warm-300">
        <CardHeader>
          <CardTitle className="text-base text-warm-700">Simulasi di-Cancel</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-warm-600">
            Berhenti di ronde {sim.currentRound}/{sim.totalRounds}. Total cost:{' '}
            {formatRupiah(Math.ceil(sim.totalCostRp))}.
          </p>
          <div className="mt-4">
            <Button variant="outline" size="sm" onClick={onTestAgain}>
              <RefreshCw className="mr-1 size-4" />
              Setup Baru
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  const evalData = sim.evaluationData
  const score = sim.evaluationScore ?? 0
  const outcomeStyle =
    sim.outcome === 'SOLD'
      ? 'bg-emerald-100 text-emerald-700'
      : sim.outcome === 'REJECTED'
        ? 'bg-red-100 text-red-700'
        : 'bg-warm-100 text-warm-700'

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="size-5 text-emerald-600" />
          Hasil Penilaian
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score bar */}
        <div>
          <div className="flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-bold text-warm-900">{score.toFixed(1)}</span>
              <span className="ml-1 text-sm text-warm-400">/ 10</span>
            </div>
            <div className={cn('rounded-full px-3 py-1 text-xs font-bold', outcomeStyle)}>
              {sim.outcome === 'SOLD'
                ? '✅ SOLD'
                : sim.outcome === 'REJECTED'
                  ? '❌ REJECTED'
                  : '⏳ INCONCLUSIVE'}
            </div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-warm-200">
            <div
              className={cn(
                'h-full transition-all',
                score >= 7
                  ? 'bg-emerald-500'
                  : score >= 4
                    ? 'bg-amber-500'
                    : 'bg-red-500',
              )}
              style={{ width: `${(score / 10) * 100}%` }}
            />
          </div>
        </div>

        {/* Meta */}
        <div className="grid gap-3 text-sm md:grid-cols-3">
          {evalData?.closingRound != null && (
            <div className="rounded border border-warm-200 bg-warm-50 p-2">
              <div className="text-[11px] uppercase tracking-wide text-warm-500">
                Closing
              </div>
              <div className="font-semibold">
                Ronde {evalData.closingRound}/{sim.totalRounds}
              </div>
            </div>
          )}
          {evalData?.mainObjection && (
            <div className="rounded border border-warm-200 bg-warm-50 p-2">
              <div className="text-[11px] uppercase tracking-wide text-warm-500">
                Keberatan utama
              </div>
              <div className="font-medium">{evalData.mainObjection}</div>
            </div>
          )}
          <div className="rounded border border-warm-200 bg-warm-50 p-2">
            <div className="text-[11px] uppercase tracking-wide text-warm-500">
              Total cost
            </div>
            <div className="font-semibold">{formatRupiah(Math.ceil(sim.totalCostRp))}</div>
          </div>
        </div>

        {evalData?.summary && (
          <blockquote className="border-l-4 border-primary-300 bg-primary-50/50 px-4 py-2 text-sm italic text-warm-700">
            {evalData.summary}
          </blockquote>
        )}

        {evalData && (
          <div className="grid gap-4 md:grid-cols-3">
            <EvalList
              icon="✅"
              title="Kekuatan"
              items={evalData.strengths}
              accent="emerald"
            />
            <EvalList
              icon="⚠️"
              title="Kelemahan"
              items={evalData.weaknesses}
              accent="amber"
            />
            <EvalList
              icon="💡"
              title="Saran"
              items={evalData.suggestions}
              accent="primary"
            />
          </div>
        )}

        {/* Conversation preview (collapsible) */}
        <details className="rounded-lg border border-warm-200">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium hover:bg-warm-50">
            Lihat percakapan ({sim.conversation.length} pesan)
          </summary>
          <div className="max-h-72 space-y-2 overflow-y-auto bg-[#e5ddd5] p-4">
            {sim.conversation.map((t, i) => (
              <ChatBubble key={i} turn={t} />
            ))}
          </div>
        </details>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 border-t border-warm-200 pt-4">
          <a
            href={`/api/admin/soul-lab/simulations/${sim.id}/export`}
            className="inline-flex items-center gap-1 rounded-md border border-warm-300 px-3 py-1.5 text-sm hover:bg-warm-50"
          >
            <Download className="size-4" /> Download .md
          </a>
          <Button variant="outline" size="sm" onClick={onTestAgain}>
            <RefreshCw className="mr-1 size-4" /> Test Lagi
          </Button>
          <a
            href="/admin/soul-settings"
            className="inline-flex items-center gap-1 rounded-md border border-warm-300 px-3 py-1.5 text-sm hover:bg-warm-50"
          >
            <Pencil className="size-4" /> Edit Soul Settings
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

function EvalList({
  icon,
  title,
  items,
  accent,
}: {
  icon: string
  title: string
  items: string[]
  accent: 'emerald' | 'amber' | 'primary'
}) {
  const accentClass =
    accent === 'emerald'
      ? 'border-emerald-200 bg-emerald-50/40'
      : accent === 'amber'
        ? 'border-amber-200 bg-amber-50/40'
        : 'border-primary-200 bg-primary-50/40'
  return (
    <div className={cn('rounded-lg border p-3', accentClass)}>
      <h4 className="mb-2 text-sm font-semibold">
        <span className="mr-1">{icon}</span>
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-xs text-warm-500">—</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {items.map((item, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-warm-400">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// History section
// ─────────────────────────────────────────

function HistorySection({ refreshKey }: { refreshKey?: string }) {
  const [items, setItems] = useState<Simulation[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [detailOpen, setDetailOpen] = useState<Simulation | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      const res = await fetch(`/api/admin/soul-lab/simulations?${params.toString()}`)
      const json = await res.json()
      if (json.success) setItems(json.data.items)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    // Microtask supaya setState pertama (di dalam load) tidak dianggap sync
    // di body effect — sesuai react-hooks/set-state-in-effect rule.
    void Promise.resolve().then(() => load())
  }, [load, refreshKey])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">History Simulasi</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua status</SelectItem>
              <SelectItem value="RUNNING">Running</SelectItem>
              <SelectItem value="COMPLETED">Completed</SelectItem>
              <SelectItem value="FAILED">Failed</SelectItem>
              <SelectItem value="CANCELLED">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-warm-500" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-warm-500">
            Belum ada simulasi.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tanggal</TableHead>
                <TableHead>Penjual</TableHead>
                <TableHead>Pembeli</TableHead>
                <TableHead className="text-center">Ronde</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => setDetailOpen(s)}
                >
                  <TableCell className="text-xs text-warm-500">
                    {new Date(s.createdAt).toLocaleString('id-ID', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </TableCell>
                  <TableCell className="text-sm">
                    {agentLabel({
                      personality: s.sellerPersonality,
                      style: s.sellerStyle,
                      soul: s.sellerSoul,
                    })}
                  </TableCell>
                  <TableCell className="text-sm">
                    {agentLabel({
                      personality: s.buyerPersonality,
                      style: s.buyerStyle,
                      soul: s.buyerSoul,
                    })}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {s.currentRound}/{s.totalRounds}
                  </TableCell>
                  <TableCell className="text-center text-sm font-semibold">
                    {s.evaluationScore != null ? s.evaluationScore.toFixed(1) : '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge sim={s} />
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {formatRupiah(Math.ceil(s.totalCostRp))}
                  </TableCell>
                  <TableCell className="text-right">
                    <a
                      href={`/api/admin/soul-lab/simulations/${s.id}/export`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      .md
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Detail modal */}
      <Dialog open={!!detailOpen} onOpenChange={(o) => !o && setDetailOpen(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detail Simulasi</DialogTitle>
          </DialogHeader>
          {detailOpen && <DetailView sim={detailOpen} />}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function StatusBadge({ sim }: { sim: Simulation }) {
  if (sim.status === 'RUNNING') {
    return (
      <Badge variant="secondary" className="bg-blue-100 text-blue-700">
        <Loader2 className="mr-1 size-3 animate-spin" />
        Running
      </Badge>
    )
  }
  if (sim.status === 'FAILED') {
    return <Badge variant="destructive">Failed</Badge>
  }
  if (sim.status === 'CANCELLED') {
    return <Badge variant="secondary">Cancelled</Badge>
  }
  if (sim.outcome === 'SOLD') {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">SOLD</Badge>
    )
  }
  if (sim.outcome === 'REJECTED') {
    return <Badge variant="destructive">REJECTED</Badge>
  }
  return <Badge variant="secondary">INCONCLUSIVE</Badge>
}

function DetailView({ sim }: { sim: Simulation }) {
  const sellerLabel = agentLabel({
    personality: sim.sellerPersonality,
    style: sim.sellerStyle,
    soul: sim.sellerSoul,
  })
  const buyerLabel = agentLabel({
    personality: sim.buyerPersonality,
    style: sim.buyerStyle,
    soul: sim.buyerSoul,
  })
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <span className="text-warm-500">Penjual:</span>{' '}
          <strong>{sellerLabel}</strong> ({sim.sellerModel.name})
        </div>
        <div>
          <span className="text-warm-500">Pembeli:</span>{' '}
          <strong>{buyerLabel}</strong> ({sim.buyerModel.name})
        </div>
      </div>
      {sim.evaluationData && (
        <div className="rounded-lg border border-warm-200 bg-warm-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-2xl font-bold">
              {sim.evaluationScore?.toFixed(1)}/10
            </span>
            <StatusBadge sim={sim} />
          </div>
          {sim.evaluationData.summary && (
            <p className="italic text-warm-700">{sim.evaluationData.summary}</p>
          )}
          <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
            {sim.evaluationData.strengths.length > 0 && (
              <div>
                <strong>Kekuatan:</strong>
                <ul className="ml-3 list-disc">
                  {sim.evaluationData.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {sim.evaluationData.weaknesses.length > 0 && (
              <div>
                <strong>Kelemahan:</strong>
                <ul className="ml-3 list-disc">
                  {sim.evaluationData.weaknesses.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {sim.evaluationData.suggestions.length > 0 && (
              <div>
                <strong>Saran:</strong>
                <ul className="ml-3 list-disc">
                  {sim.evaluationData.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg bg-[#e5ddd5] p-3">
        {sim.conversation.map((t, i) => (
          <ChatBubble key={i} turn={t} />
        ))}
      </div>
      <a
        href={`/api/admin/soul-lab/simulations/${sim.id}/export`}
        className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
      >
        <Download className="size-3" />
        Download .md
      </a>
    </div>
  )
}

// ─────────────────────────────────────────
// Dialogs
// ─────────────────────────────────────────

function ConfirmStartDialog({
  open,
  onOpenChange,
  estimateRp,
  sameAgents,
  submitting,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  estimateRp: number | null
  sameAgents: boolean
  submitting: boolean
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mulai Simulasi?</DialogTitle>
          <DialogDescription>
            {estimateRp !== null
              ? `Estimasi biaya: ${formatRupiah(estimateRp)}. Biaya aktual mungkin berbeda tergantung panjang balasan AI.`
              : 'Estimasi biaya belum tersedia.'}
          </DialogDescription>
        </DialogHeader>
        {sameAgents && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            ⚠️ Kepribadian + Gaya Balas penjual dan pembeli sama persis. Self-test biasanya
            kurang akurat.
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            {submitting && <Loader2 className="mr-1 size-4 animate-spin" />}
            Lanjut
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PresetsDialog({
  open,
  onOpenChange,
  presets,
  onApply,
  onDelete,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  presets: Preset[]
  onApply: (p: Preset) => void
  onDelete: (id: string) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Load Preset</DialogTitle>
          <DialogDescription>Pilih preset untuk auto-fill setup.</DialogDescription>
        </DialogHeader>
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {presets.length === 0 ? (
            <p className="py-8 text-center text-sm text-warm-500">Belum ada preset.</p>
          ) : (
            presets.map((p) => (
              <div
                key={p.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-warm-200 p-3 hover:bg-warm-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.name}</div>
                  {p.description && (
                    <div className="text-xs text-warm-500">{p.description}</div>
                  )}
                  <div className="mt-1 text-[11px] text-warm-400">
                    oleh {p.creator?.name || p.creator?.email || '?'} ·{' '}
                    {new Date(p.createdAt).toLocaleDateString('id-ID')}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => onApply(p)}>
                    Pakai
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(p.id)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SavePresetDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onSave: (name: string, description: string) => void
}) {
  // Pakai `key={open ? 'open' : 'closed'}` di body supaya state ter-reset saat
  // dialog dibuka — lebih bersih dari useEffect setState reset.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <SavePresetForm
          key={open ? 'open' : 'closed'}
          onCancel={() => onOpenChange(false)}
          onSave={onSave}
        />
      </DialogContent>
    </Dialog>
  )
}

function SavePresetForm({
  onCancel,
  onSave,
}: {
  onCancel: () => void
  onSave: (name: string, description: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  return (
    <>
      <DialogHeader>
        <DialogTitle>Simpan sebagai Preset</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label htmlFor="preset-name">Nama preset</Label>
          <Input
            id="preset-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Misal: Tester pembeli ragu vs sales closing"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="preset-desc">Deskripsi (opsional)</Label>
          <Textarea
            id="preset-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Batal
        </Button>
        <Button
          onClick={() => onSave(name.trim(), description.trim())}
          disabled={!name.trim()}
        >
          Simpan
        </Button>
      </DialogFooter>
    </>
  )
}

