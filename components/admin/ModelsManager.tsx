'use client'

// CRUD AI Models — list + sheet form (create/edit) + toggle aktif + delete.
import type { AiProvider } from '@prisma/client'
import {
  BarChart3,
  Bot,
  Info,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { TableSkeleton } from '@/components/shared/skeletons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber, formatRupiah } from '@/lib/format'
import {
  calcApiCostRp,
  calcBreakdown,
  calcRecommendedTokens,
} from '@/lib/pricing-settings'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface AiModelRow {
  id: string
  name: string
  provider: AiProvider
  modelId: string
  costMode: 'AUTO' | 'MANUAL'
  costPerMessage: number
  inputPricePer1M: number
  outputPricePer1M: number
  description: string | null
  isActive: boolean
  _count: { waSessions: number }
}

interface PricingSettingsLite {
  marginTarget: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  usdRate: number
  pricePerToken: number
}

// Preset dari /api/admin/ai-pricing/presets — source of truth harga.
interface PresetRow {
  id: string
  provider: AiProvider
  modelId: string
  displayName: string
  inputPricePer1M: number
  outputPricePer1M: number
  lastUpdatedSource: string | null
  lastUpdatedAt: string
  daysSinceUpdate: number
}

const DEFAULT_PS: PricingSettingsLite = {
  marginTarget: 50,
  estimatedInputTokens: 1600,
  estimatedOutputTokens: 300,
  usdRate: 16000,
  pricePerToken: 2,
}

const PROVIDERS: AiProvider[] = ['ANTHROPIC', 'OPENAI', 'GOOGLE']

export function ModelsManager() {
  const [models, setModels] = useState<AiModelRow[]>([])
  const [isLoading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<AiModelRow | null>(null)

  // Form fields
  const [name, setName] = useState('')
  const [provider, setProvider] = useState<AiProvider>('ANTHROPIC')
  const [modelId, setModelId] = useState('')
  const [costMode, setCostMode] = useState<'AUTO' | 'MANUAL'>('AUTO')
  const [cost, setCost] = useState('1')
  const [inputPrice, setInputPrice] = useState('0')
  const [outputPrice, setOutputPrice] = useState('0')
  const [description, setDescription] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [isSaving, setSaving] = useState(false)
  const [isDeleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<AiModelRow | null>(null)
  const [isRecalculating, setRecalculating] = useState(false)
  const [confirmRugi, setConfirmRugi] = useState(false)
  const [rugiConfirmOpen, setRugiConfirmOpen] = useState(false)
  const [recalcConfirmOpen, setRecalcConfirmOpen] = useState(false)

  // Pricing settings — di-load sekali saat mount, dipakai untuk auto-calc
  // dan preview profitabilitas.
  const [ps, setPs] = useState<PricingSettingsLite>(DEFAULT_PS)
  // Preset dari AiModelPreset DB — source of truth dropdown ModelId.
  const [presets, setPresets] = useState<PresetRow[]>([])
  useEffect(() => {
    void (async () => {
      const [psRes, prRes] = await Promise.all([
        fetch('/api/admin/pricing-settings'),
        fetch('/api/admin/ai-pricing/presets'),
      ])
      const psJson = (await psRes.json()) as {
        success: boolean
        data?: PricingSettingsLite
      }
      if (psJson.success && psJson.data) setPs(psJson.data)
      const prJson = (await prRes.json()) as {
        success: boolean
        data?: PresetRow[]
      }
      if (prJson.success && prJson.data) setPresets(prJson.data)
    })()
  }, [])

  // Filter preset berdasarkan provider yang dipilih di form.
  const presetsForProvider = useMemo(
    () => presets.filter((p) => p.provider === provider),
    [presets, provider],
  )

  function findPresetByModelId(id: string): PresetRow | undefined {
    return presets.find((p) => p.modelId === id)
  }

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/models')
      const json = (await res.json()) as {
        success: boolean
        data?: AiModelRow[]
      }
      if (json.success && json.data) setModels(json.data)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  function openCreate() {
    setEditing(null)
    setName('')
    setProvider('ANTHROPIC')
    setModelId('')
    setCostMode('AUTO')
    setCost('1')
    setInputPrice('0')
    setOutputPrice('0')
    setDescription('')
    setIsActive(true)
    setOpen(true)
  }

  function openEdit(m: AiModelRow) {
    setEditing(m)
    setName(m.name)
    setProvider(m.provider)
    setModelId(m.modelId)
    setCostMode(m.costMode)
    setCost(String(m.costPerMessage))
    setInputPrice(String(m.inputPricePer1M))
    setOutputPrice(String(m.outputPricePer1M))
    setDescription(m.description ?? '')
    setIsActive(m.isActive)
    setOpen(true)
  }

  // Hitung preview profitabilitas real-time dari ps + harga model + cost.
  const preview = useMemo(() => {
    const inP = Number(inputPrice) || 0
    const outP = Number(outputPrice) || 0
    const apiCostRp = calcApiCostRp(
      ps.estimatedInputTokens,
      ps.estimatedOutputTokens,
      inP,
      outP,
      ps.usdRate,
    )
    const recommended = calcRecommendedTokens(
      apiCostRp,
      ps.pricePerToken,
      ps.marginTarget,
    )
    const effectiveCost =
      costMode === 'AUTO' ? recommended : Math.max(0, Number(cost) || 0)
    const breakdown = calcBreakdown(
      apiCostRp,
      effectiveCost,
      ps.pricePerToken,
      ps.marginTarget,
    )
    return { recommended, effectiveCost, ...breakdown }
  }, [inputPrice, outputPrice, costMode, cost, ps])

  // Saat user pilih preset model, auto-fill name (kalau masih default) +
  // harga dari list. Admin tetap bisa override ke nilai apapun.
  function selectPresetModel(id: string) {
    setModelId(id)
    const preset = findPresetByModelId(id)
    if (preset) {
      setInputPrice(String(preset.inputPricePer1M))
      setOutputPrice(String(preset.outputPricePer1M))
      // Auto-fill nama hanya kalau field nama masih kosong supaya tidak
      // overwrite nama custom yang sudah admin ketik.
      if (!name.trim()) setName(preset.displayName)
    }
  }

  function changeProvider(p: AiProvider) {
    setProvider(p)
    // Reset modelId karena daftar berubah; biarkan harga supaya tidak
    // hilang kalau admin sengaja set manual.
    setModelId('')
  }

  async function save(forceRugi = false) {
    // Kalau status RUGI dan admin belum konfirmasi → minta konfirmasi dulu.
    if (preview.status === 'RUGI' && !confirmRugi && !forceRugi) {
      setRugiConfirmOpen(true)
      return
    }
    setSaving(true)
    try {
      const finalCost = costMode === 'AUTO' ? preview.recommended : Number(cost)
      const body = {
        name: name.trim(),
        provider,
        modelId: modelId.trim(),
        costMode,
        costPerMessage: finalCost > 0 ? finalCost : 1,
        inputPricePer1M: Number(inputPrice) || 0,
        outputPricePer1M: Number(outputPrice) || 0,
        description: description.trim() === '' ? null : description.trim(),
        isActive,
      }
      const res = await fetch(
        editing ? `/api/admin/models/${editing.id}` : '/api/admin/models',
        {
          method: editing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menyimpan')
        return
      }
      toast.success(editing ? 'Model diperbarui' : 'Model dibuat')
      setOpen(false)
      void load()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(m: AiModelRow) {
    const res = await fetch(`/api/admin/models/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !m.isActive }),
    })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal toggle')
      return
    }
    void load()
  }

  async function recalculateAll() {
    setRecalcConfirmOpen(false)
    setRecalculating(true)
    try {
      const res = await fetch('/api/admin/models/recalculate-all', {
        method: 'POST',
      })
      const json = (await res.json()) as {
        success: boolean
        error?: string
        data?: { updated: number; skipped: number; total: number }
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal recalculate')
        return
      }
      toast.success(
        `${json.data.updated} model di-update, ${json.data.skipped} di-skip (manual / tidak berubah)`,
      )
      void load()
    } finally {
      setRecalculating(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/models/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menghapus')
        return
      }
      toast.success('Model dihapus')
      setDeleteTarget(null)
      void load()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Models"
        description="Atur model AI yang tersedia untuk user dan biaya token per pesan."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setRecalcConfirmOpen(true)}
              disabled={isRecalculating}
            >
              {isRecalculating ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Re-calculate Token Otomatis
            </Button>
            <Button onClick={openCreate}>
              <Plus className="mr-2 size-4" /> Tambah Model
            </Button>
          </>
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model ID</TableHead>
              <TableHead
                className="text-right"
                title="Legacy: dipakai sebagai pre-flight floor saja. CS Reply charge real dihitung server proporsional dari (input+output tokens) × margin AiFeatureConfig['CS_REPLY']."
              >
                Cost/pesan (legacy)
              </TableHead>
              <TableHead className="text-right">Dipakai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableSkeleton rows={5} cols={7} />
            ) : models.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyState
                    title="Belum ada model"
                    description="Tambahkan model AI supaya user bisa pilih di pengaturan WA."
                  />
                </TableCell>
              </TableRow>
            ) : (
              models.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {m.provider}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {m.modelId}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatNumber(m.costPerMessage)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right">
                    {m._count.waSessions}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={m.isActive}
                      onCheckedChange={() => toggleActive(m)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit model"
                      onClick={() => openEdit(m)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Hapus model"
                      onClick={() => setDeleteTarget(m)}
                      disabled={isDeleting}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full px-6 sm:max-w-md">
          <SheetHeader className="px-0">
            <SheetTitle>{editing ? 'Edit Model' : 'Tambah Model'}</SheetTitle>
            <SheetDescription>
              Konfigurasi model AI yang bisa user pilih untuk WA session.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 py-3">
            <div className="space-y-1.5">
              <Label htmlFor="m-name">Nama</Label>
              <Input
                id="m-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Misal: Claude Haiku (Cepat)"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Provider</Label>
              <Select
                value={provider}
                onValueChange={(v) => changeProvider(v as AiProvider)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Model ID</Label>
              <TooltipProvider>
                <Select value={modelId} onValueChange={selectPresetModel}>
                  <SelectTrigger className="font-mono text-xs">
                    <SelectValue placeholder="Pilih model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {presetsForProvider.length === 0 ? (
                      <div className="text-muted-foreground px-2 py-1.5 text-xs">
                        Belum ada preset. Tambah di /admin/ai-pricing.
                      </div>
                    ) : (
                      presetsForProvider.map((m) => (
                        <Tooltip key={m.id}>
                          <TooltipTrigger asChild>
                            <SelectItem value={m.modelId}>
                              <span className="font-mono text-xs">
                                {m.modelId}
                              </span>
                              <span className="text-muted-foreground ml-2">
                                — {m.displayName}
                              </span>
                            </SelectItem>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            <div>
                              ${m.inputPricePer1M.toFixed(2)} input / $
                              {m.outputPricePer1M.toFixed(2)} output / 1M tok
                            </div>
                            <div className="text-xs opacity-75">
                              Update {m.daysSinceUpdate}h lalu
                              {m.lastUpdatedSource &&
                                ` (${m.lastUpdatedSource})`}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </TooltipProvider>
              <p className="text-muted-foreground text-xs">
                Pilih dari preset atau ketik manual:
              </p>
              <Input
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="atau ketik model id custom"
                className="font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-input-price">Input $/1M tok</Label>
                <Input
                  id="m-input-price"
                  type="number"
                  step="0.001"
                  min={0}
                  value={inputPrice}
                  onChange={(e) => setInputPrice(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-output-price">Output $/1M tok</Label>
                <Input
                  id="m-output-price"
                  type="number"
                  step="0.001"
                  min={0}
                  value={outputPrice}
                  onChange={(e) => setOutputPrice(e.target.value)}
                />
              </div>
            </div>
            {(() => {
              const matched = findPresetByModelId(modelId)
              if (!matched) return null
              return (
                <p className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Info className="size-3 shrink-0" aria-hidden />
                  Harga diambil dari preset · Last update{' '}
                  {matched.daysSinceUpdate} hari lalu
                  {matched.lastUpdatedSource &&
                    ` (${matched.lastUpdatedSource})`}
                  . Field tetap bisa di-override.
                </p>
              )
            })()}
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Mode Penghitungan</Label>
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className={cn(
                      costMode === 'AUTO'
                        ? 'text-warm-900 font-semibold'
                        : 'text-muted-foreground',
                    )}
                  >
                    Auto
                  </span>
                  <Switch
                    checked={costMode === 'MANUAL'}
                    onCheckedChange={(checked) =>
                      setCostMode(checked ? 'MANUAL' : 'AUTO')
                    }
                  />
                  <span
                    className={cn(
                      costMode === 'MANUAL'
                        ? 'text-warm-900 font-semibold'
                        : 'text-muted-foreground',
                    )}
                  >
                    Manual
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="m-cost" className="text-xs">
                    Token per pesan (dipotong dari user)
                  </Label>
                  {costMode === 'AUTO' && (
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Bot className="size-3" aria-hidden />
                      Auto-set untuk margin {ps.marginTarget}%
                    </Badge>
                  )}
                </div>
                <Input
                  id="m-cost"
                  type="number"
                  min={1}
                  value={costMode === 'AUTO' ? preview.recommended : cost}
                  readOnly={costMode === 'AUTO'}
                  onChange={(e) => setCost(e.target.value)}
                  className={cn(
                    costMode === 'AUTO' &&
                      'bg-warm-50 text-warm-700 cursor-not-allowed',
                  )}
                />
              </div>

              {/* Preview profitabilitas */}
              <div className="bg-warm-50 rounded-md p-3 text-xs">
                <p className="text-warm-700 mb-1 flex items-center gap-1 font-semibold">
                  <BarChart3 className="size-3.5" aria-hidden />
                  Estimasi per Pesan
                </p>
                <div className="space-y-0.5 font-mono">
                  <div className="flex justify-between">
                    <span>Biaya API:</span>
                    <span>{formatRupiah(preview.apiCostRp)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Token dipotong:</span>
                    <span>{formatNumber(preview.effectiveCost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pendapatan:</span>
                    <span>{formatRupiah(preview.revenueRp)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Profit:</span>
                    <span
                      className={cn(
                        preview.profitRp < 0 && cn('font-semibold', TONES.danger.text),
                      )}
                    >
                      {formatRupiah(preview.profitRp)}
                    </span>
                  </div>
                  <div className="border-warm-200 flex justify-between border-t pt-1">
                    <span>Margin:</span>
                    <span
                      className={cn(
                        'font-semibold',
                        preview.status === 'AMAN' && TONES.success.text,
                        preview.status === 'TIPIS' && TONES.warning.text,
                        preview.status === 'RUGI' && TONES.danger.text,
                      )}
                    >
                      {Number.isFinite(preview.marginPct)
                        ? `${preview.marginPct.toFixed(1)}%`
                        : '—'}{' '}
                      {preview.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-desc">Deskripsi</Label>
              <Textarea
                id="m-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <Label>Aktif</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              onClick={() => void save()}
              disabled={isSaving}
              className={cn(
                preview.status === 'RUGI' &&
                  'bg-destructive hover:bg-destructive/90 text-white',
              )}
            >
              {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Simpan
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        title="Hapus model ini?"
        description={
          <>
            Hapus model <strong>{deleteTarget?.name}</strong>? Tindakan ini
            tidak bisa dibatalkan.
          </>
        }
        isLoading={isDeleting}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={rugiConfirmOpen}
        onOpenChange={setRugiConfirmOpen}
        title="Model ini akan RUGI — tetap simpan?"
        description={`Margin sekarang ${preview.marginPct.toFixed(1)}%. Biaya API lebih besar dari token yang dipotong dari user.`}
        confirmLabel="Ya, Tetap Simpan"
        onConfirm={() => {
          setConfirmRugi(true)
          setRugiConfirmOpen(false)
          void save(true)
        }}
      />

      <ConfirmDialog
        open={recalcConfirmOpen}
        onOpenChange={setRecalcConfirmOpen}
        title="Hitung ulang cost semua model?"
        description="costPerMessage semua model mode Auto dihitung ulang berdasarkan setting margin saat ini."
        confirmLabel="Ya, Recalculate"
        variant="default"
        onConfirm={recalculateAll}
      />
    </div>
  )
}
