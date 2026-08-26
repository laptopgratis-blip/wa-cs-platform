'use client'

// CsAiIntegrationsCard — section "Integrasi CS AI" di atas list pengetahuan.
// Dua toggle utama (Katalog Produk, Hitung Ongkir) + sub-toggle apply-rule.
// Designed user-friendly untuk awam:
//   - Bahasa Indonesia ramah
//   - Status prerequisite jelas (✅ siap / ⚠️ butuh setup)
//   - Link CTA langsung ke halaman setup yang relevan kalau belum siap
//   - Penjelasan singkat tiap toggle — apa yang berubah saat aktif
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Package,
  Sparkles,
  TriangleAlert,
  Truck,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/shared/StatusBadge'
import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface Prerequisites {
  hasActiveProducts: boolean
  activeProductCount: number
  hasShippingOrigin: boolean
  originCityName: string | null
  enabledCourierCount: number
  activeSubsidyZoneCount: number
}

interface IntegrationState {
  productCatalogEnabled: boolean
  shippingCalcEnabled: boolean
  applySubsidyRules: boolean
  applyFlashSaleDiscount: boolean
  prerequisites: Prerequisites
}

type ToggleField =
  | 'productCatalogEnabled'
  | 'shippingCalcEnabled'
  | 'applySubsidyRules'
  | 'applyFlashSaleDiscount'

export function CsAiIntegrationsCard() {
  const [state, setState] = useState<IntegrationState | null>(null)
  const [loading, setLoading] = useState(true)
  const [savingField, setSavingField] = useState<ToggleField | null>(null)

  useEffect(() => {
    let aborted = false
    async function load() {
      try {
        const res = await fetch('/api/cs-ai/integrations', {
          cache: 'no-store',
        })
        const json = (await res.json()) as {
          success: boolean
          data?: IntegrationState
        }
        if (aborted) return
        if (json.success && json.data) setState(json.data)
      } catch (err) {
        console.warn('[CsAiIntegrationsCard load]', err)
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    void load()
    return () => {
      aborted = true
    }
  }, [])

  async function update(field: ToggleField, value: boolean) {
    if (!state) return
    setSavingField(field)
    // Optimistic — rollback kalau gagal.
    const prev = state[field]
    setState({ ...state, [field]: value })
    try {
      const res = await fetch('/api/cs-ai/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const json = (await res.json()) as {
        success: boolean
        error?: string
      }
      if (!res.ok || !json.success) {
        setState({ ...state, [field]: prev })
        toast.error(json.error ?? 'Gagal menyimpan')
        return
      }
      toast.success(
        value
          ? 'Integrasi diaktifkan — CS AI sudah pakai info ini'
          : 'Integrasi dinonaktifkan',
      )
    } catch (err) {
      console.error('[update integration]', err)
      setState({ ...state, [field]: prev })
      toast.error('Gagal hubungi server')
    } finally {
      setSavingField(null)
    }
  }

  if (loading || !state) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="text-warm-400 size-5 animate-spin" />
        </CardContent>
      </Card>
    )
  }

  const { prerequisites: pr } = state
  const shippingDisabled = !pr.hasShippingOrigin

  return (
    <Card className="border-primary-200 from-primary-50/40 via-card to-card overflow-hidden border-2 bg-linear-to-br">
      <CardContent className="p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="bg-primary-500 text-warm-900 flex size-10 shrink-0 items-center justify-center rounded-lg">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-warm-900 text-base font-semibold">
              Integrasi CS AI
            </h2>
            <p className="text-warm-600 mt-0.5 text-xs">
              Sekali klik aktifkan — CS AI bisa jawab pertanyaan produk & hitung
              ongkir otomatis lengkap dengan promo yang berlaku.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* TOGGLE 1: KATALOG PRODUK */}
          <IntegrationToggle
            icon={Package}
            iconClass="bg-primary-100 text-primary-600"
            title="Akses Katalog Produk"
            description="CS AI tahu nama, harga, stok, dan varian produkmu — bisa jawab pertanyaan customer tanpa nanya admin."
            enabled={state.productCatalogEnabled}
            saving={savingField === 'productCatalogEnabled'}
            disabled={false}
            onToggle={(v) => void update('productCatalogEnabled', v)}
            badge={
              pr.hasActiveProducts ? (
                <StatusBadge
                  tone="success"
                  icon={CheckCircle2}
                  label={`${pr.activeProductCount} produk aktif`}
                />
              ) : (
                <StatusBadge
                  tone="warning"
                  icon={TriangleAlert}
                  label="Belum ada produk aktif"
                />
              )
            }
            ctaWhenEmpty={
              !pr.hasActiveProducts ? (
                <Link
                  href="/products"
                  className="text-primary-600 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                >
                  Tambah produk dulu
                  <ExternalLink className="size-3" />
                </Link>
              ) : null
            }
            footer={
              state.productCatalogEnabled && pr.hasActiveProducts ? (
                <div className="space-y-1.5 text-xs">
                  <RuleToggle
                    label="Apply diskon Flash Sale otomatis"
                    checked={state.applyFlashSaleDiscount}
                    saving={savingField === 'applyFlashSaleDiscount'}
                    onToggle={(v) => void update('applyFlashSaleDiscount', v)}
                  />
                </div>
              ) : null
            }
          />

          {/* TOGGLE 2: HITUNG ONGKIR */}
          <IntegrationToggle
            icon={Truck}
            iconClass="bg-primary-100 text-primary-600"
            title="Hitung Ongkir Otomatis"
            description="Customer sebut kota tujuan, CS AI langsung kasih harga ongkir lewat Raja Ongkir + apply promo gratis-ongkir / subsidi yang kamu setup."
            enabled={state.shippingCalcEnabled}
            saving={savingField === 'shippingCalcEnabled'}
            disabled={shippingDisabled}
            onToggle={(v) => void update('shippingCalcEnabled', v)}
            badge={
              pr.hasShippingOrigin ? (
                <StatusBadge
                  tone="success"
                  icon={CheckCircle2}
                  label={`Origin: ${pr.originCityName}`}
                />
              ) : (
                <StatusBadge
                  tone="warning"
                  icon={TriangleAlert}
                  label="Belum setup kota asal"
                />
              )
            }
            ctaWhenEmpty={
              !pr.hasShippingOrigin ? (
                <Link
                  href="/bank-accounts"
                  className="text-primary-600 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                >
                  Setup kota asal pengiriman
                  <ExternalLink className="size-3" />
                </Link>
              ) : null
            }
            footer={
              state.shippingCalcEnabled && pr.hasShippingOrigin ? (
                <div className="space-y-1.5 text-xs">
                  <RuleToggle
                    label={`Apply rule promo ongkir${pr.activeSubsidyZoneCount > 0 ? ` (${pr.activeSubsidyZoneCount} aktif)` : ''}`}
                    checked={state.applySubsidyRules}
                    saving={savingField === 'applySubsidyRules'}
                    onToggle={(v) => void update('applySubsidyRules', v)}
                  />
                  {pr.activeSubsidyZoneCount === 0 && (
                    <p className="text-warm-500">
                      Belum ada zona subsidi.{' '}
                      <Link
                        href="/shipping-zones"
                        className="text-primary-600 font-semibold hover:underline"
                      >
                        Setup di sini →
                      </Link>
                    </p>
                  )}
                </div>
              ) : null
            }
          />
        </div>

        {(state.productCatalogEnabled || state.shippingCalcEnabled) && (
          <div
            className={cn(
              'mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs',
              TONES.success.bg,
              TONES.success.text,
            )}
          >
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            <p>
              Integrasi aktif — CS AI akan otomatis pakai info ini di setiap
              balasan WhatsApp. Coba kirim pesan tes ke nomor WA bisnismu.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Sub-komponen ───────────────────────────────────────────────────────

function IntegrationToggle({
  icon: Icon,
  iconClass,
  title,
  description,
  enabled,
  saving,
  disabled,
  onToggle,
  badge,
  ctaWhenEmpty,
  footer,
}: {
  icon: React.ComponentType<{ className?: string }>
  iconClass: string
  title: string
  description: string
  enabled: boolean
  saving: boolean
  disabled: boolean
  onToggle: (v: boolean) => void
  badge: React.ReactNode
  ctaWhenEmpty: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'bg-card flex flex-col gap-3 rounded-xl border p-4 transition',
        enabled
          ? 'border-primary-300 ring-primary-200 ring-1'
          : 'border-warm-200',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            iconClass,
          )}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-warm-900 text-sm leading-tight font-semibold">
              {title}
            </h3>
            <Switch
              checked={enabled}
              disabled={saving || disabled}
              onCheckedChange={onToggle}
              aria-label={`Toggle ${title}`}
            />
          </div>
          <p className="text-warm-600 mt-1 text-xs leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {badge}
        {ctaWhenEmpty}
      </div>

      {footer && (
        <div className="border-warm-200 border-t border-dashed pt-2.5">
          {footer}
        </div>
      )}
    </div>
  )
}

function RuleToggle({
  label,
  checked,
  saving,
  onToggle,
}: {
  label: string
  checked: boolean
  saving: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <label className="text-warm-700 flex cursor-pointer items-center justify-between gap-2">
      <span>{label}</span>
      <Switch
        checked={checked}
        disabled={saving}
        onCheckedChange={onToggle}
        className="scale-75"
      />
    </label>
  )
}
