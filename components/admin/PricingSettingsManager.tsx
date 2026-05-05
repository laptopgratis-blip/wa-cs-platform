'use client'

// /admin/pricing-settings — singleton form. 5 field: marginTarget,
// estimatedInputTokens, estimatedOutputTokens, usdRate, pricePerToken.
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Settings {
  marginTarget: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  usdRate: number
  pricePerToken: number
}

const DEFAULTS: Settings = {
  marginTarget: 50,
  estimatedInputTokens: 1600,
  estimatedOutputTokens: 300,
  usdRate: 16000,
  pricePerToken: 2,
}

export function PricingSettingsManager() {
  const [s, setS] = useState<Settings>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  const [isSaving, setSaving] = useState(false)

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/admin/pricing-settings')
      const json = (await res.json()) as { success: boolean; data?: Settings }
      if (json.success && json.data) setS(json.data)
      setLoaded(true)
    })()
  }, [])

  function field<K extends keyof Settings>(k: K, v: number) {
    setS((prev) => ({ ...prev, [k]: v }))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/pricing-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menyimpan')
        return
      }
      toast.success('Setting disimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
          Pricing Settings
        </h1>
        <p className="mt-1 text-sm text-warm-500">
          Setting global yang dipakai semua tools profit (auto-calc model,
          pricing calculator, dashboard profitability). Cache 60 detik.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Asumsi & target</CardTitle>
          <CardDescription>
            Nilai-nilai ini disimpan sebagai singleton dan dibaca server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ps-margin">Target margin minimum (%)</Label>
            <Input
              id="ps-margin"
              type="number"
              min={0}
              max={99}
              step="0.1"
              value={s.marginTarget}
              onChange={(e) => field('marginTarget', Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-usd">Kurs USD/IDR</Label>
            <Input
              id="ps-usd"
              type="number"
              min={0}
              value={s.usdRate}
              onChange={(e) => field('usdRate', Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-input">Estimasi token input / pesan</Label>
            <Input
              id="ps-input"
              type="number"
              min={0}
              value={s.estimatedInputTokens}
              onChange={(e) =>
                field('estimatedInputTokens', Math.floor(Number(e.target.value)))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-output">Estimasi token output / pesan</Label>
            <Input
              id="ps-output"
              type="number"
              min={0}
              value={s.estimatedOutputTokens}
              onChange={(e) =>
                field('estimatedOutputTokens', Math.floor(Number(e.target.value)))
              }
            />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="ps-price">Harga jual platform per token (Rp)</Label>
            <Input
              id="ps-price"
              type="number"
              min={0}
              step="0.01"
              value={s.pricePerToken}
              onChange={(e) => field('pricePerToken', Number(e.target.value))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={!loaded || isSaving}>
          {isSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
          Simpan
        </Button>
      </div>
    </div>
  )
}
