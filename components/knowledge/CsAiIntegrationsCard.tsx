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
  Truck,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
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
      <Card className="rounded-xl border-warm-200 shadow-sm">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="size-5 animate-spin text-warm-400" />
        </CardContent>
      </Card>
    )
  }

  const { prerequisites: pr } = state
  const shippingDisabled = !pr.hasShippingOrigin

  return (
    <Card className="overflow-hidden rounded-xl border-2 border-primary-200 bg-gradient-to-br from-primary-50/40 via-card to-card shadow-sm">
      <CardContent className="p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white shadow-orange">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h2 className="font-display text-base font-extrabold text-warm-900 dark:text-warm-50">
              Integrasi CS AI
            </h2>
            <p className="mt-0.5 text-xs text-warm-600 dark:text-warm-400">
              Sekali klik aktifkan — CS AI bisa jawab pertanyaan produk &
              hitung ongkir otomatis lengkap dengan promo yang berlaku.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* TOGGLE 1: KATALOG PRODUK */}
          <IntegrationToggle
            icon={Package}
            iconClass="bg-blue-100 text-blue-600"
            title="Akses Katalog Produk"
            description="CS AI tahu nama, harga, stok, dan varian produkmu — bisa jawab pertanyaan customer tanpa nanya admin."
            enabled={state.productCatalogEnabled}
            saving={savingField === 'productCatalogEnabled'}
            disabled={false}
            onToggle={(v) => void update('productCatalogEnabled', v)}
            badge={
              pr.hasActiveProducts ? (
                <Badge tone="emerald">
                  ✅ {pr.activeProductCount} produk aktif
                </Badge>
              ) : (
                <Badge tone="amber">⚠️ Belum ada produk aktif</Badge>
              )
            }
            ctaWhenEmpty={
              !pr.hasActiveProducts ? (
                <Link
                  href="/products"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline"
                >
                  Tambah produk dulu
                  <ExternalLink className="size-3" />
                </Link>
              ) : null
            }
            footer={
              state.productCatalogEnabled && pr.hasActiveProducts ? (
                <div className="space-y-1.5 text-[11px]">
                  <RuleToggle
                    label="Apply diskon Flash Sale otomatis"
                    checked={state.applyFlashSaleDiscount}
                    saving={savingField === 'applyFlashSaleDiscount'}
                    onToggle={(v) =>
                      void update('applyFlashSaleDiscount', v)
                    }
                  />
                </div>
              ) : null
            }
          />

          {/* TOGGLE 2: HITUNG ONGKIR */}
          <IntegrationToggle
            icon={Truck}
            iconClass="bg-orange-100 text-orange-600"
            title="Hitung Ongkir Otomatis"
            description="Customer sebut kota tujuan, CS AI langsung kasih harga ongkir lewat Raja Ongkir + apply promo gratis-ongkir / subsidi yang kamu setup."
            enabled={state.shippingCalcEnabled}
            saving={savingField === 'shippingCalcEnabled'}
            disabled={shippingDisabled}
            onToggle={(v) => void update('shippingCalcEnabled', v)}
            badge={
              pr.hasShippingOrigin ? (
                <Badge tone="emerald">
                  ✅ Origin: {pr.originCityName}
                </Badge>
              ) : (
                <Badge tone="amber">⚠️ Belum setup kota asal</Badge>
              )
            }
            ctaWhenEmpty={
              !pr.hasShippingOrigin ? (
                <Link
                  href="/bank-accounts"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline"
                >
                  Setup kota asal pengiriman
                  <ExternalLink className="size-3" />
                </Link>
              ) : null
            }
            footer={
              state.shippingCalcEnabled && pr.hasShippingOrigin ? (
                <div className="space-y-1.5 text-[11px]">
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
                        className="font-semibold text-primary-600 hover:underline"
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
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
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
        'flex flex-col gap-3 rounded-xl border bg-card p-4 transition',
        enabled ? 'border-primary-300 ring-1 ring-primary-200' : 'border-warm-200',
        disabled && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', iconClass)}>
          <Icon className="size-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold leading-tight text-warm-900 dark:text-warm-50">
              {title}
            </h3>
            <Switch
              checked={enabled}
              disabled={saving || disabled}
              onCheckedChange={onToggle}
              aria-label={`Toggle ${title}`}
            />
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-warm-600 dark:text-warm-400">
            {description}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {badge}
        {ctaWhenEmpty}
      </div>

      {footer && (
        <div className="border-t border-dashed border-warm-200 pt-2.5">
          {footer}
        </div>
      )}
    </div>
  )
}

function Badge({
  tone,
  children,
}: {
  tone: 'emerald' | 'amber'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
        tone === 'emerald'
          ? 'bg-emerald-100 text-emerald-800'
          : 'bg-amber-100 text-amber-800',
      )}
    >
      {children}
    </span>
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
    <label className="flex cursor-pointer items-center justify-between gap-2 text-warm-700 dark:text-warm-300">
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
