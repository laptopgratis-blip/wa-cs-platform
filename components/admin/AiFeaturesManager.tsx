'use client'

// AI Features Manager — admin CRUD AiFeatureConfig.
// Per-feature pricing yg admin-tunable (Content Studio, future LP Lab migration).
// Edit input/output rate, platform margin, floor/cap tokens, active toggle.
//
// Auto-sync: harga input/output otomatis ikut AiModelPreset (sumber kebenaran
// harga API provider) saat preset di-update. Tombol "🔄 Sync dari preset" di
// header untuk force-sync manual semua row sekaligus. Drift indicator
// per-row kalau price config beda dari preset.
import { AlertTriangle, Loader2, Plus, RefreshCw, Save, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
    if (
      !confirm(
        'Sync semua feature config dari AiModelPreset (database harga)? Harga input/output yg drift akan di-update. Margin/floor/cap tidak ikut di-update.',
      )
    )
      return
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
  const missingCount = Object.values(drift).filter((d) => d.presetMissing).length

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="size-5 text-primary-500" />
            <h1 className="font-display text-2xl font-extrabold text-warm-900">
              AI Feature Pricing
            </h1>
          </div>
          <p className="text-sm text-warm-500">
            Atur pricing per AI feature (Content Studio, future LP Lab). Update
            margin/rate/cap di sini = effect max 60 detik (cache TTL).
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={syncAllFromPresets}
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
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
              <AlertTriangle className="size-3" />
              {driftCount} feature beda harga dari preset
            </span>
          )}
          {missingCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800">
              <AlertTriangle className="size-3" />
              {missingCount} model tidak ada di preset
            </span>
          )}
        </div>
      </header>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Cara hitung token charge per call:</strong>
        <br />
        <code>
          (inputTokens × inputPricePer1M + outputTokens × outputPricePer1M) /
          1M × usdRate × platformMargin / pricePerToken → ceil
        </code>
        <br />
        Floor min = floorTokens, cap max = capTokens. Lihat /admin/profitability
        untuk monitor margin real per feature.
        <br />
        <strong>Sync dari preset:</strong> harga input/output otomatis
        ter-update saat admin save di /admin/ai-pricing. Klik tombol di atas
        untuk force-sync semua sekaligus.
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-warm-500">
          <Loader2 className="size-4 animate-spin" /> Memuat...
        </div>
      )}

      {!loading && features.length === 0 && !creating && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-warm-500">
            Belum ada feature config. Migration belum jalan? Atau klik tambah.
            <div className="mt-3">
              <Button onClick={() => setCreating(true)}>
                <Plus className="mr-1 size-4" /> Tambah feature
              </Button>
            </div>
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
                      <h3 className="font-display text-base font-bold text-warm-900">
                        {f.displayName}
                      </h3>
                      <Badge
                        className={
                          f.isActive
                            ? 'bg-emerald-100 text-[10px] text-emerald-700'
                            : 'bg-warm-100 text-[10px] text-warm-700'
                        }
                      >
                        {f.isActive ? 'Active' : 'Disabled'}
                      </Badge>
                      {hasDrift && (
                        <Badge
                          className="bg-amber-100 text-[10px] text-amber-800"
                          title={`Preset: $${d.presetInput?.toFixed(2)} / $${d.presetOutput?.toFixed(2)} per 1M`}
                        >
                          <AlertTriangle className="mr-1 size-3" />
                          Drift dari preset
                        </Badge>
                      )}
                      {presetMissing && (
                        <Badge className="bg-rose-100 text-[10px] text-rose-800">
                          Model tidak ada di preset
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-warm-500">
                      featureKey: <code>{f.featureKey}</code>
                    </p>
                    {hasDrift && (
                      <p className="mt-1 text-[11px] text-amber-700">
                        Preset harga: <strong>${d.presetInput?.toFixed(2)}</strong>{' '}
                        input / <strong>${d.presetOutput?.toFixed(2)}</strong>{' '}
                        output. Klik &ldquo;Sync dari preset&rdquo; di header
                        untuk pakai harga preset.
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
                    label="Platform margin multiplier (1.3 = +30%)"
                    value={
                      (draft?.platformMargin as number) ?? f.platformMargin
                    }
                    step={0.05}
                    onChange={(v) => patchEdit(f.id, 'platformMargin', v)}
                  />
                  <div />
                  <FieldNumber
                    label="Floor min token charge"
                    value={(draft?.floorTokens as number) ?? f.floorTokens}
                    step={10}
                    onChange={(v) => patchEdit(f.id, 'floorTokens', Math.floor(v))}
                  />
                  <FieldNumber
                    label="Cap max token charge"
                    value={(draft?.capTokens as number) ?? f.capTokens}
                    step={1000}
                    onChange={(v) => patchEdit(f.id, 'capTokens', Math.floor(v))}
                  />
                </div>

                <div className="border-t border-warm-100 pt-2 text-[11px] text-warm-400">
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
    platformMargin: 1.3,
    floorTokens: 100,
    capTokens: 50_000,
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
        <h3 className="font-display text-base font-bold">Tambah Feature Baru</h3>
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
            label="Platform margin"
            value={data.platformMargin}
            step={0.05}
            onChange={(v) => setData((d) => ({ ...d, platformMargin: v }))}
          />
          <div />
          <FieldNumber
            label="Floor tokens"
            value={data.floorTokens}
            step={10}
            onChange={(v) =>
              setData((d) => ({ ...d, floorTokens: Math.floor(v) }))
            }
          />
          <FieldNumber
            label="Cap tokens"
            value={data.capTokens}
            step={1000}
            onChange={(v) =>
              setData((d) => ({ ...d, capTokens: Math.floor(v) }))
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
