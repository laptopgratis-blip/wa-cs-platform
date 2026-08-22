'use client'

// AI Features Manager — admin CRUD AiFeatureConfig.
// Per-feature pricing yg admin-tunable (Content Studio, future LP Lab migration).
// Edit input/output rate, platform margin, floor/cap tokens, active toggle.
//
// Auto-sync: harga input/output otomatis ikut AiModelPreset (sumber kebenaran
// harga API provider) saat preset di-update. Tombol "🔄 Sync dari preset" di
// header untuk force-sync manual semua row sekaligus. Drift indicator
// per-row kalau price config beda dari preset.
import {
  AlertTriangle,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { CardGridSkeleton } from '@/components/shared/skeletons'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface FeatureConfig {
  id: string
  featureKey: string
  displayName: string
  modelName: string
  inputPricePer1M: number
  outputPricePer1M: number
  platformMargin: number
  floorTokens: number
  capTokens: number
  isActive: boolean
  description: string | null
  updatedAt: string
}

interface DriftEntry {
  modelName: string
  configInput: number
  configOutput: number
  presetInput: number | null
  presetOutput: number | null
  driftInput: boolean
  driftOutput: boolean
  presetMissing: boolean
}

export function AiFeaturesManager() {
  const [features, setFeatures] = useState<FeatureConfig[]>([])
  const [drift, setDrift] = useState<Record<string, DriftEntry>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Map<string, Partial<FeatureConfig>>>(
    new Map(),
  )
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)
  const [syncingAll, setSyncingAll] = useState(false)
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [featRes, driftRes] = await Promise.all([
        fetch('/api/admin/ai-features'),
        fetch('/api/admin/ai-features/sync-from-presets'),
      ])
      const featJson = await featRes.json()
      const driftJson = await driftRes.json()
      if (featJson.success) setFeatures(featJson.data.features)
      if (driftJson.success) setDrift(driftJson.data.drift)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function syncAllFromPresets() {
    setSyncConfirmOpen(false)
    setSyncingAll(true)
    try {
      const res = await fetch('/api/admin/ai-features/sync-from-presets', {
        method: 'POST',
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal sync')
        return
      }
      const { synced, unchanged, missing } = json.data as {
        synced: number
        unchanged: number
        missing: string[]
      }
      const parts = [
        synced > 0 && `${synced} feature di-update`,
        unchanged > 0 && `${unchanged} sudah sinkron`,
        missing.length > 0 && `${missing.length} model tidak ada di preset`,
      ].filter(Boolean)
      toast.success(parts.length > 0 ? parts.join(', ') : 'Tidak ada perubahan')
      if (missing.length > 0) {
        console.warn('[AiFeatures sync] preset missing untuk:', missing)
      }
      await refresh()
    } finally {
      setSyncingAll(false)
    }
  }

  function patchEdit(id: string, key: keyof FeatureConfig, value: unknown) {
    const next = new Map(editing)
    next.set(id, { ...(next.get(id) ?? {}), [key]: value })
    setEditing(next)
  }

  async function saveOne(id: string) {
    const changes = editing.get(id)
    if (!changes) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ai-features', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...changes }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal save')
        return
      }
      toast.success('Tersimpan')
      const next = new Map(editing)
      next.delete(id)
      setEditing(next)
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(f: FeatureConfig) {
    const res = await fetch('/api/admin/ai-features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: f.id, isActive: !f.isActive }),
    })
    const json = await res.json()
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal toggle')
      return
    }
    toast.success(f.isActive ? 'Di-disable' : 'Di-enable')
    await refresh()
  }

  // Total drift count untuk badge di header.
  const driftCount = Object.values(drift).filter(
    (d) => d.driftInput || d.driftOutput,
  ).length
  const missingCount = Object.values(drift).filter(
    (d) => d.presetMissing,
  ).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Feature Pricing"
        description="Atur pricing per AI feature (Content Studio, future LP Lab). Update margin/rate/cap di sini = effect max 60 detik (cache TTL)."
        actions={
          <div className="flex flex-col items-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSyncConfirmOpen(true)}
              disabled={syncingAll || loading}
            >
              {syncingAll ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Sync dari preset
            </Button>
            {driftCount > 0 && (
              <StatusBadge
                tone="warning"
                icon={AlertTriangle}
                label={`${driftCount} feature beda harga dari preset`}
              />
            )}
            {missingCount > 0 && (
              <StatusBadge
                tone="danger"
                icon={AlertTriangle}
                label={`${missingCount} model tidak ada di preset`}
              />
            )}
          </div>
        }
      />

      <div
        className={cn(
          'rounded-md border p-3 text-xs',
          TONES.warning.bg,
          TONES.warning.border,
          TONES.warning.text,
        )}
      >
        <strong>Cara hitung token charge per call (skema fair-pricing):</strong>
        <br />
        <code>
          (inputTokens × inputPricePer1M + outputTokens × outputPricePer1M) / 1M
          × usdRate × platformMargin / pricePerToken → ceil
        </code>
        <br />
        Default <strong>margin 2.0</strong> = user dipotong 2× cost provider.
        Floor min = floorTokens (default 10) — anti-mikro charge. Tidak ada cap
        atas: charge proporsional ke pemakaian (user yg generate output besar
        akan kena potong lebih banyak — fair).
        <br />
        <strong>Sync dari preset:</strong> harga input/output otomatis
        ter-update saat admin save di /admin/ai-pricing. Klik tombol di atas
        untuk force-sync semua sekaligus.
      </div>

      {loading && <CardGridSkeleton count={3} />}

      {!loading && features.length === 0 && !creating && (
        <Card>
          <CardContent>
            <EmptyState
              title="Belum ada feature config"
              description="Migration belum jalan? Atau tambah manual di sini."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus className="mr-1 size-4" /> Tambah feature
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      {creating && (
        <CreateFeatureForm
          onCancel={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false)
            await refresh()
          }}
        />
      )}

      {!loading &&
        features.map((f) => {
          const draft = editing.get(f.id)
          const dirty = draft && Object.keys(draft).length > 0
          const d = drift[f.id]
          const hasDrift = d && (d.driftInput || d.driftOutput)
          const presetMissing = d?.presetMissing ?? false
          return (
            <Card key={f.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-warm-900 text-lg font-semibold">
                        {f.displayName}
                      </h3>
                      <StatusBadge
                        tone={f.isActive ? 'success' : 'neutral'}
                        label={f.isActive ? 'Active' : 'Disabled'}
                      />
                      {hasDrift && (
                        <span
                          title={`Preset: $${d.presetInput?.toFixed(2)} / $${d.presetOutput?.toFixed(2)} per 1M`}
                        >
                          <StatusBadge
                            tone="warning"
                            icon={AlertTriangle}
                            label="Drift dari preset"
                          />
                        </span>
                      )}
                      {presetMissing && (
                        <StatusBadge
                          tone="danger"
                          label="Model tidak ada di preset"
                        />
                      )}
                    </div>
                    <p className="text-warm-500 text-xs">
                      featureKey: <code>{f.featureKey}</code>
                    </p>
                    {hasDrift && (
                      <p className={cn('mt-1 text-xs', TONES.warning.text)}>
                        Preset harga:{' '}
                        <strong>${d.presetInput?.toFixed(2)}</strong> input /{' '}
                        <strong>${d.presetOutput?.toFixed(2)}</strong> output.
                        Klik &ldquo;Sync dari preset&rdquo; di header untuk
                        pakai harga preset.
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleActive(f)}
                    >
                      {f.isActive ? 'Disable' : 'Enable'}
                    </Button>
                    {dirty && (
                      <Button
                        size="sm"
                        onClick={() => saveOne(f.id)}
                        disabled={saving}
                      >
                        <Save className="mr-1 size-3.5" />
                        {saving ? 'Saving...' : 'Save'}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FieldText
                    label="Model name"
                    value={(draft?.modelName as string) ?? f.modelName}
                    onChange={(v) => patchEdit(f.id, 'modelName', v)}
                  />
                  <FieldText
                    label="Display name"
                    value={(draft?.displayName as string) ?? f.displayName}
                    onChange={(v) => patchEdit(f.id, 'displayName', v)}
                  />
                  <FieldNumber
                    label="Input price (USD per 1M token)"
                    value={
                      (draft?.inputPricePer1M as number) ?? f.inputPricePer1M
                    }
                    step={0.01}
                    onChange={(v) => patchEdit(f.id, 'inputPricePer1M', v)}
                  />
                  <FieldNumber
                    label="Output price (USD per 1M token)"
                    value={
                      (draft?.outputPricePer1M as number) ?? f.outputPricePer1M
                    }
                    step={0.01}
                    onChange={(v) => patchEdit(f.id, 'outputPricePer1M', v)}
                  />
                  <FieldNumber
                    label="Platform margin multiplier (2.0 = 2× cost provider)"
                    value={
                      (draft?.platformMargin as number) ?? f.platformMargin
                    }
                    step={0.05}
                    onChange={(v) => patchEdit(f.id, 'platformMargin', v)}
                  />
                  <FieldNumber
                    label="Floor min token charge (default 10)"
                    value={(draft?.floorTokens as number) ?? f.floorTokens}
                    step={1}
                    onChange={(v) =>
                      patchEdit(f.id, 'floorTokens', Math.floor(v))
                    }
                  />
                </div>

                <div className="border-warm-100 text-warm-400 border-t pt-2 text-xs">
                  Updated: {new Date(f.updatedAt).toLocaleString('id-ID')}
                </div>
              </CardContent>
            </Card>
          )
        })}

      {!creating && features.length > 0 && (
        <Button variant="outline" onClick={() => setCreating(true)}>
          <Plus className="mr-1 size-4" /> Tambah feature baru
        </Button>
      )}

      <ConfirmDialog
        open={syncConfirmOpen}
        onOpenChange={setSyncConfirmOpen}
        title="Sync semua feature config dari preset?"
        description="Harga input/output yang drift di-update dari AiModelPreset (database harga). Margin/floor/cap tidak ikut di-update."
        confirmLabel="Ya, Sync"
        variant="default"
        onConfirm={syncAllFromPresets}
      />
    </div>
  )
}

function FieldText({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function FieldNumber({
  label,
  value,
  step,
  onChange,
}: {
  label: string
  value: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        value={value}
        step={step}
        onChange={(e) => {
          const n = parseFloat(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </div>
  )
}

function CreateFeatureForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: () => void
}) {
  const [data, setData] = useState({
    featureKey: '',
    displayName: '',
    modelName: 'claude-haiku-4-5',
    inputPricePer1M: 1.0,
    outputPricePer1M: 5.0,
    platformMargin: 2.0,
    floorTokens: 10,
    capTokens: 0,
  })
  const [saving, setSaving] = useState(false)

  async function submit() {
    if (!data.featureKey || !data.displayName) {
      toast.error('Isi featureKey + displayName')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/ai-features', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal create')
        return
      }
      toast.success('Feature dibuat')
      onCreated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h3 className="font-display text-base font-bold">
          Tambah Feature Baru
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <FieldText
            label="Feature key (UPPER_SNAKE)"
            value={data.featureKey}
            onChange={(v) => setData((d) => ({ ...d, featureKey: v }))}
          />
          <FieldText
            label="Display name"
            value={data.displayName}
            onChange={(v) => setData((d) => ({ ...d, displayName: v }))}
          />
          <FieldText
            label="Model name"
            value={data.modelName}
            onChange={(v) => setData((d) => ({ ...d, modelName: v }))}
          />
          <div />
          <FieldNumber
            label="Input USD per 1M"
            value={data.inputPricePer1M}
            step={0.01}
            onChange={(v) => setData((d) => ({ ...d, inputPricePer1M: v }))}
          />
          <FieldNumber
            label="Output USD per 1M"
            value={data.outputPricePer1M}
            step={0.01}
            onChange={(v) => setData((d) => ({ ...d, outputPricePer1M: v }))}
          />
          <FieldNumber
            label="Platform margin (default 2.0)"
            value={data.platformMargin}
            step={0.05}
            onChange={(v) => setData((d) => ({ ...d, platformMargin: v }))}
          />
          <FieldNumber
            label="Floor tokens (default 10)"
            value={data.floorTokens}
            step={1}
            onChange={(v) =>
              setData((d) => ({ ...d, floorTokens: Math.floor(v) }))
            }
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving...' : 'Buat'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
