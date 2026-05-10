'use client'

// AI Features Manager — admin CRUD AiFeatureConfig.
// Per-feature pricing yg admin-tunable (Content Studio, future LP Lab migration).
// Edit input/output rate, platform margin, floor/cap tokens, active toggle.
import { Loader2, Plus, Save, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
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

export function AiFeaturesManager() {
  const [features, setFeatures] = useState<FeatureConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Map<string, Partial<FeatureConfig>>>(
    new Map(),
  )
  const [saving, setSaving] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    refresh()
  }, [])

  async function refresh() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/ai-features')
      const json = await res.json()
      if (json.success) setFeatures(json.data.features)
    } finally {
      setLoading(false)
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

  return (
    <div className="space-y-6">
      <header>
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
          return (
            <Card key={f.id}>
              <CardContent className="space-y-4 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
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
                    </div>
                    <p className="text-xs text-warm-500">
                      featureKey: <code>{f.featureKey}</code>
                    </p>
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
