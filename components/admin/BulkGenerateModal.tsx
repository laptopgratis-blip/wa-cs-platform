'use client'

// BulkGenerateModal — wizard 3-step bulk generate klip dari AI:
//   Step 1: Input detail produk (manual atau pick dari Products) + pilih jumlah
//   Step 2: Claude suggest scripts → user review/edit/approve per item
//   Step 3: Confirm + fire bulk-generate, kembali ke library dengan polling

import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  Lightbulb,
  MessageCircle,
  Loader2,
  Package,
  Pencil,
  Pill,
  Rocket,
  ShieldCheck,
  ShoppingCart,
  Smile,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { TONES, type Tone } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ProductOption {
  id: string
  name: string
  description: string | null
  price: number
}

interface SuggestedScript {
  category: string
  script: string
  charCount: number
  approved: boolean
  trigger?: string
  kpi_goal?: string
}

const CATEGORY_META: Record<
  string,
  { icon: LucideIcon; label: string; color: string }
> = {
  GREETING: {
    icon: Bell,
    label: 'Sapaan',
    color: 'bg-primary-100 text-primary-700',
  },
  PRODUCT_DEMO: {
    icon: Pill,
    label: 'Demo Produk',
    color: 'bg-primary-100 text-primary-700',
  },
  PRICE: {
    icon: Tag,
    label: 'Harga',
    color: 'bg-primary-100 text-primary-700',
  },
  OBJECTION: {
    icon: ShieldCheck,
    label: 'Objection',
    color: 'bg-primary-100 text-primary-700',
  },
  CLOSING: {
    icon: ShoppingCart,
    label: 'Closing',
    color: 'bg-primary-100 text-primary-700',
  },
  GENERAL: {
    icon: MessageCircle,
    label: 'Umum',
    color: 'bg-warm-100 text-warm-700',
  },
  IDLE: {
    icon: Smile,
    label: 'Idle (diam)',
    color: 'bg-warm-100 text-warm-500',
  },
}

// Skala kualitas coverage. `smoothnessMarks` = berapa kali ikon centang diulang
// (0 = tingkat terendah, ditandai ikon peringatan) — pengganti "✓/✓✓/✓✓✓".
const COUNT_OPTIONS: Array<{
  value: 5 | 10 | 15 | 20
  label: string
  desc: string
  smoothness: string
  smoothnessTone: Tone
  smoothnessMarks: number
}> = [
  {
    value: 5,
    label: '5 klip',
    desc: 'Starter — coverage minimum',
    smoothness: 'Banyak fallback',
    smoothnessTone: 'warning',
    smoothnessMarks: 0,
  },
  {
    value: 10,
    label: '10 klip',
    desc: 'Balanced — siap live',
    smoothness: 'OK responsive',
    smoothnessTone: 'success',
    smoothnessMarks: 1,
  },
  {
    value: 15,
    label: '15 klip',
    desc: 'Rich library — natural',
    smoothness: 'Smooth',
    smoothnessTone: 'success',
    smoothnessMarks: 2,
  },
  {
    value: 20,
    label: '20 klip',
    desc: 'Premium coverage',
    smoothness: 'Very smooth',
    smoothnessTone: 'success',
    smoothnessMarks: 3,
  },
]

export function BulkGenerateModal({
  hostId,
  voiceId,
  voiceName,
  onClose,
  onStarted,
}: {
  hostId: string
  voiceId: string
  voiceName: string
  onClose: () => void
  onStarted: () => void
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1: product input
  const [products, setProducts] = useState<ProductOption[] | null>(null)
  const [selectedProductId, setSelectedProductId] = useState<string | 'manual'>(
    'manual',
  )
  const [productName, setProductName] = useState('')
  const [productDesc, setProductDesc] = useState('')
  const [price, setPrice] = useState<string>('')
  const [benefits, setBenefits] = useState<string[]>([''])
  const [targetCustomer, setTargetCustomer] = useState('')
  const [brandTone, setBrandTone] = useState(
    'casual energetic Indonesian TikTok Live',
  )
  const [count, setCount] = useState<5 | 10 | 15 | 20>(10)

  // Step 2: suggested scripts
  const [suggesting, setSuggesting] = useState(false)
  const [scripts, setScripts] = useState<SuggestedScript[]>([])

  // Step 3: submit
  const [submitting, setSubmitting] = useState(false)

  // Load products on mount
  useEffect(() => {
    void fetch('/api/products')
      .then((r) => r.json())
      .then((j: { success: boolean; data?: { items?: ProductOption[] } }) => {
        if (j.success && j.data?.items) setProducts(j.data.items)
        else setProducts([])
      })
      .catch(() => setProducts([]))
  }, [])

  const handlePickProduct = useCallback((p: ProductOption) => {
    setSelectedProductId(p.id)
    setProductName(p.name)
    setProductDesc(p.description ?? '')
    setPrice(String(p.price))
    setBenefits([''])
  }, [])

  function setBenefitAt(idx: number, val: string) {
    setBenefits((b) => b.map((x, i) => (i === idx ? val : x)))
  }
  function addBenefit() {
    if (benefits.length < 5) setBenefits((b) => [...b, ''])
  }
  function removeBenefit(idx: number) {
    setBenefits((b) => b.filter((_, i) => i !== idx))
  }

  async function suggestNow() {
    if (productName.trim().length < 2) {
      toast.error('Nama produk minimal 2 char')
      return
    }
    setSuggesting(true)
    try {
      const cleanBenefits = benefits.map((b) => b.trim()).filter(Boolean)
      const res = await fetch(
        `/api/host-templates/${hostId}/clips/bulk-suggest`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            productName: productName.trim(),
            productDescription: productDesc.trim() || undefined,
            price: price.trim() ? Number(price) : undefined,
            benefits: cleanBenefits.length > 0 ? cleanBenefits : undefined,
            targetCustomer: targetCustomer.trim() || undefined,
            brandTone: brandTone.trim() || undefined,
            count,
          }),
        },
      )
      const j = (await res.json()) as {
        success: boolean
        data?: { scripts: SuggestedScript[] }
        error?: string
      }
      if (!j.success || !j.data) {
        toast.error(j.error ?? 'Suggest gagal')
        return
      }
      // All approved by default — user uncheck yang gak suka
      setScripts(j.data.scripts.map((s) => ({ ...s, approved: true })))
      setStep(2)
    } finally {
      setSuggesting(false)
    }
  }

  function toggleApproval(idx: number) {
    setScripts((s) =>
      s.map((x, i) => (i === idx ? { ...x, approved: !x.approved } : x)),
    )
  }
  function editScript(idx: number, newScript: string) {
    setScripts((s) =>
      s.map((x, i) =>
        i === idx
          ? { ...x, script: newScript, charCount: newScript.length }
          : x,
      ),
    )
  }
  function removeScript(idx: number) {
    setScripts((s) => s.filter((_, i) => i !== idx))
  }

  async function submitGenerate() {
    const approved = scripts.filter((s) => s.approved)
    if (approved.length === 0) {
      toast.error('Pilih minimal 1 script')
      return
    }
    // Validate budget per script
    const overBudget = approved.filter(
      (s) => s.charCount > 129 && s.category !== 'IDLE',
    )
    if (overBudget.length > 0) {
      toast.error(
        `${overBudget.length} script over budget (max 129 char untuk baseline 10dtk)`,
      )
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(
        `/api/host-templates/${hostId}/clips/bulk-generate`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            scripts: approved.map((s) => ({
              category: s.category,
              script: s.script,
            })),
            voiceId,
          }),
        },
      )
      const j = (await res.json()) as {
        success: boolean
        data?: { queued: number }
        error?: string
      }
      if (j.success && j.data) {
        toast.success(
          `${j.data.queued} klip masuk antrian. Refresh halaman berkala — klip muncul satu per satu (~2-3 menit per klip).`,
        )
        onStarted()
      } else {
        toast.error(j.error ?? 'Submit gagal')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
        {/* Header */}
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Rocket className="text-primary-500 size-5" aria-hidden />
            Bulk Generate Klip Live
          </DialogTitle>
          <DialogDescription className="text-xs">
            Claude bikin draft script otomatis. Kamu review/edit, klik generate
            — sistem auto bikin semua klip.
          </DialogDescription>
          {/* Step indicator */}
          <div className="mt-1 flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-1">
                <div
                  className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                    step >= s
                      ? 'bg-primary-500 text-warm-900'
                      : 'bg-warm-200 text-warm-500'
                  }`}
                >
                  {step > s ? <Check className="size-3.5" aria-hidden /> : s}
                </div>
                {s < 3 ? (
                  <div
                    className={`h-0.5 w-10 ${step > s ? 'bg-primary-500' : 'bg-warm-200'}`}
                  />
                ) : null}
              </div>
            ))}
            <span className="text-warm-700 ml-2 text-xs font-semibold">
              {step === 1
                ? 'Detail Produk'
                : step === 2
                  ? 'Review Script'
                  : 'Generate'}
            </span>
          </div>
        </DialogHeader>

        {/* STEP 1: Product detail input */}
        {step === 1 ? (
          <div className="space-y-4">
            {/* Source picker */}
            {products && products.length > 0 ? (
              <div>
                <label className="text-warm-600 text-xs font-semibold tracking-wide uppercase">
                  Sumber produk
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedProductId('manual')}
                    className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      selectedProductId === 'manual'
                        ? 'bg-primary-500 text-warm-900'
                        : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                    }`}
                  >
                    <Pencil className="size-3" aria-hidden />
                    Input Manual
                  </button>
                  {products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePickProduct(p)}
                      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        selectedProductId === p.id
                          ? 'bg-primary-500 text-warm-900'
                          : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                      }`}
                    >
                      <Package className="size-3" />
                      {p.name.slice(0, 30)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Form fields */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-warm-600 text-xs font-semibold tracking-wide uppercase">
                  Nama produk *
                </label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Cleanoz Pembersih Mesin"
                  className="border-warm-200 mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  maxLength={200}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-warm-600 text-xs font-semibold tracking-wide uppercase">
                  Deskripsi singkat
                </label>
                <textarea
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  rows={2}
                  placeholder="Pembersih mesin berbahan dasar minyak atsiri olahan, lunturkan kerak piston, irit BBM..."
                  className="border-warm-200 mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  maxLength={1000}
                />
              </div>
              <div>
                <label className="text-warm-600 text-xs font-semibold tracking-wide uppercase">
                  Harga (Rp)
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="65000"
                  className="border-warm-200 mt-1 w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-warm-600 text-xs font-semibold tracking-wide uppercase">
                  Target customer
                </label>
                <input
                  type="text"
                  value={targetCustomer}
                  onChange={(e) => setTargetCustomer(e.target.value)}
                  placeholder="Pemilik motor, suka touring"
                  className="border-warm-200 mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  maxLength={200}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-warm-600 text-xs font-semibold tracking-wide uppercase">
                  Manfaat utama (max 5)
                </label>
                <div className="mt-1 space-y-1">
                  {benefits.map((b, i) => (
                    <div key={i} className="flex gap-1">
                      <input
                        type="text"
                        value={b}
                        onChange={(e) => setBenefitAt(i, e.target.value)}
                        placeholder={`Manfaat ${i + 1} (mis: hemat BBM 25%)`}
                        className="border-warm-200 flex-1 rounded-md border px-3 py-1.5 text-xs"
                        maxLength={200}
                      />
                      {benefits.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeBenefit(i)}
                          className="border-warm-200 text-warm-600 hover:bg-destructive/10 rounded-md border px-2"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {benefits.length < 5 ? (
                    <button
                      type="button"
                      onClick={addBenefit}
                      className="text-primary-600 text-xs font-semibold hover:underline"
                    >
                      + Tambah manfaat
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="text-warm-600 text-xs font-semibold tracking-wide uppercase">
                  Brand tone
                </label>
                <input
                  type="text"
                  value={brandTone}
                  onChange={(e) => setBrandTone(e.target.value)}
                  placeholder="casual energetic Indonesian TikTok Live"
                  className="border-warm-200 mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  maxLength={200}
                />
              </div>
            </div>

            {/* Count picker */}
            <div>
              <label className="text-warm-600 text-xs font-semibold tracking-wide uppercase">
                Jumlah klip
              </label>
              <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {COUNT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setCount(opt.value)}
                    className={`rounded-lg border-2 p-2.5 text-left transition ${
                      count === opt.value
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-warm-200 hover:border-primary-300 bg-card'
                    }`}
                  >
                    <div className="font-semibold">{opt.label}</div>
                    <div className="text-warm-600 text-xs">{opt.desc}</div>
                    <div
                      className={cn(
                        'mt-0.5 flex items-center gap-1 text-xs',
                        TONES[opt.smoothnessTone].text,
                      )}
                    >
                      {opt.smoothnessMarks > 0 ? (
                        <span className="inline-flex shrink-0" aria-hidden>
                          {Array.from({ length: opt.smoothnessMarks }).map(
                            (_, i) => (
                              <Check
                                key={i}
                                className="-ml-1.5 size-3 first:ml-0"
                              />
                            ),
                          )}
                        </span>
                      ) : (
                        <AlertTriangle
                          className="size-3 shrink-0"
                          aria-hidden
                        />
                      )}
                      <span>{opt.smoothness}</span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-muted-foreground mt-1.5 text-xs">
                Voice: <strong>{voiceName}</strong> · Cost estimate ~Rp{' '}
                {Math.round(count * 2.5)}rb · Time ~
                {Math.round((count * 3) / 60) || 1}-
                {Math.round((count * 3) / 60) + 5} menit total
              </p>
            </div>

            <div className="border-warm-200 flex justify-between gap-2 border-t pt-3">
              <Button variant="outline" onClick={onClose}>
                Batal
              </Button>
              <Button
                onClick={() => void suggestNow()}
                disabled={suggesting || productName.trim().length < 2}
              >
                {suggesting ? (
                  <>
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                    Claude generate…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 size-3.5" />
                    Generate Saran ({count} script)
                    <ArrowRight className="ml-1.5 size-3.5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null}

        {/* STEP 2: Review scripts */}
        {step === 2 ? (
          <div className="space-y-3">
            <div className="bg-warm-50 text-warm-700 rounded-lg p-2.5 text-xs">
              <strong>{scripts.filter((s) => s.approved).length}</strong> dari{' '}
              {scripts.length} klip dipilih · Uncheck untuk skip · Klik teks
              untuk edit · Hapus yang gak suka
            </div>

            <div className="space-y-2">
              {scripts.map((s, i) => {
                const meta = CATEGORY_META[s.category] ?? CATEGORY_META.GENERAL
                const overBudget = s.charCount > 129 && s.category !== 'IDLE'
                return (
                  <div
                    key={i}
                    className={`flex gap-2 rounded-lg border p-2.5 ${
                      s.approved
                        ? 'border-warm-200 bg-card'
                        : 'border-warm-200 bg-warm-50 opacity-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={s.approved}
                      onChange={() => toggleApproval(i)}
                      className="accent-primary-500 mt-1 size-4 flex-shrink-0 cursor-pointer"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.color}`}
                        >
                          <meta.icon className="size-3" aria-hidden />
                          {meta.label}
                        </span>
                        <span
                          className={cn(
                            'text-xs',
                            overBudget
                              ? cn('font-semibold', TONES.danger.text)
                              : 'text-warm-500',
                          )}
                        >
                          {s.charCount}/129 {overBudget ? 'over' : ''}
                        </span>
                        {/* Trigger + kpi_goal disembunyikan — info AI internal, gak action-able buat owner */}
                      </div>
                      {s.category === 'IDLE' ? (
                        <div className="text-warm-500 mt-1 text-xs italic">
                          (Host diam senyum loop saat sepi — gak perlu script)
                        </div>
                      ) : (
                        <textarea
                          value={s.script}
                          onChange={(e) => editScript(i, e.target.value)}
                          rows={2}
                          className="border-warm-200 mt-1 w-full resize-none rounded border bg-white px-2 py-1 text-xs"
                          maxLength={200}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeScript(i)}
                      className="text-warm-500 hover:bg-destructive/10 hover:text-destructive flex-shrink-0 self-start rounded p-1"
                      aria-label="Hapus"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="border-warm-200 flex justify-between gap-2 border-t pt-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1.5 size-3.5" />
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={scripts.filter((s) => s.approved).length === 0}
              >
                Lanjut ({scripts.filter((s) => s.approved).length} klip)
                <ArrowRight className="ml-1.5 size-3.5" />
              </Button>
            </div>
          </div>
        ) : null}

        {/* STEP 3: Confirm */}
        {step === 3 ? (
          <div className="space-y-3">
            <div className="border-primary-200 from-primary-50 to-primary-100 rounded-xl border-2 bg-linear-to-br p-4">
              <div className="flex items-center gap-2 text-base font-semibold">
                <Rocket className="text-primary-500 size-5" />
                Siap fire bulk generate
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <div className="font-semibold">Total klip:</div>
                  <div className="text-warm-700">
                    {scripts.filter((s) => s.approved).length} klip
                  </div>
                </div>
                <div>
                  <div className="font-semibold">Voice:</div>
                  <div className="text-warm-700">{voiceName}</div>
                </div>
                <div>
                  <div className="font-semibold">Estimate waktu:</div>
                  <div className="text-warm-700">
                    ~
                    {Math.round(scripts.filter((s) => s.approved).length * 2.5)}{' '}
                    menit (sequential)
                  </div>
                </div>
                <div>
                  <div className="font-semibold">Estimate cost:</div>
                  <div className="text-warm-700">
                    ~Rp {scripts.filter((s) => s.approved).length * 2500}
                  </div>
                </div>
              </div>
              <div className="text-warm-600 mt-3 flex items-start gap-1.5 text-xs">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>
                  Pipeline jalan di background. Klip akan muncul satu per satu
                  di Library bawah. Refresh halaman berkala (atau auto-poll).
                </span>
              </div>
            </div>

            <div className="border-warm-200 flex justify-between gap-2 border-t pt-3">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-1.5 size-3.5" />
                Back
              </Button>
              <Button
                onClick={() => void submitGenerate()}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Rocket className="mr-2 size-3.5" />
                    Generate {scripts.filter((s) => s.approved).length} Klip
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
