'use client'

// BulkGenerateModal — wizard 3-step bulk generate klip dari AI:
//   Step 1: Input detail produk (manual atau pick dari Products) + pilih jumlah
//   Step 2: Claude suggest scripts → user review/edit/approve per item
//   Step 3: Confirm + fire bulk-generate, kembali ke library dengan polling

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Package,
  Rocket,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'

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

const CATEGORY_META: Record<string, { emoji: string; label: string; color: string }> = {
  GREETING: { emoji: '🔔', label: 'Sapaan', color: 'bg-sky-100 text-sky-700' },
  PRODUCT_DEMO: { emoji: '💊', label: 'Demo Produk', color: 'bg-purple-100 text-purple-700' },
  PRICE: { emoji: '💰', label: 'Harga', color: 'bg-emerald-100 text-emerald-700' },
  OBJECTION: { emoji: '🛡️', label: 'Objection', color: 'bg-amber-100 text-amber-700' },
  CLOSING: { emoji: '🛒', label: 'Closing', color: 'bg-red-100 text-red-700' },
  GENERAL: { emoji: '💬', label: 'Umum', color: 'bg-warm-100 text-warm-700' },
  IDLE: { emoji: '😊', label: 'Idle (diam)', color: 'bg-warm-100 text-warm-500' },
}

const COUNT_OPTIONS: Array<{
  value: 5 | 10 | 15 | 20
  label: string
  desc: string
  smoothness: string
}> = [
  { value: 5, label: '5 klip', desc: 'Starter — coverage minimum', smoothness: '⚠️ Banyak fallback' },
  { value: 10, label: '10 klip', desc: 'Balanced — siap live', smoothness: '✓ OK responsive' },
  { value: 15, label: '15 klip', desc: 'Rich library — natural', smoothness: '✓✓ Smooth' },
  { value: 20, label: '20 klip', desc: 'Premium coverage', smoothness: '✓✓✓ Very smooth' },
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
  const [selectedProductId, setSelectedProductId] = useState<string | 'manual'>('manual')
  const [productName, setProductName] = useState('')
  const [productDesc, setProductDesc] = useState('')
  const [price, setPrice] = useState<string>('')
  const [benefits, setBenefits] = useState<string[]>([''])
  const [targetCustomer, setTargetCustomer] = useState('')
  const [brandTone, setBrandTone] = useState('casual energetic Indonesian TikTok Live')
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
      const res = await fetch(`/api/host-templates/${hostId}/clips/bulk-suggest`, {
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
      })
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
    setScripts((s) => s.map((x, i) => (i === idx ? { ...x, approved: !x.approved } : x)))
  }
  function editScript(idx: number, newScript: string) {
    setScripts((s) =>
      s.map((x, i) =>
        i === idx ? { ...x, script: newScript, charCount: newScript.length } : x,
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
    const overBudget = approved.filter((s) => s.charCount > 129 && s.category !== 'IDLE')
    if (overBudget.length > 0) {
      toast.error(`${overBudget.length} script over budget (max 129 char untuk baseline 10dtk)`)
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/host-templates/${hostId}/clips/bulk-generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scripts: approved.map((s) => ({ category: s.category, script: s.script })),
          voiceId,
        }),
      })
      const j = (await res.json()) as {
        success: boolean
        data?: { queued: number }
        error?: string
      }
      if (j.success && j.data) {
        toast.success(`${j.data.queued} klip masuk antrian. Refresh halaman berkala — klip muncul satu per satu (~2-3 menit per klip).`)
        onStarted()
      } else {
        toast.error(j.error ?? 'Submit gagal')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex-1">
            <h2 className="text-lg font-semibold">🚀 Bulk Generate Klip Live</h2>
            <p className="text-xs text-muted-foreground">
              Claude bikin draft script otomatis. Kamu review/edit, klik generate — sistem auto bikin semua klip.
            </p>
            {/* Step indicator */}
            <div className="mt-3 flex items-center gap-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center gap-1">
                  <div
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                      step >= s ? 'bg-orange-500 text-white' : 'bg-warm-200 text-warm-500'
                    }`}
                  >
                    {step > s ? '✓' : s}
                  </div>
                  {s < 3 ? (
                    <div className={`h-0.5 w-10 ${step > s ? 'bg-orange-500' : 'bg-warm-200'}`} />
                  ) : null}
                </div>
              ))}
              <span className="ml-2 text-xs font-semibold text-warm-700">
                {step === 1 ? 'Detail Produk' : step === 2 ? 'Review Script' : 'Generate'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 hover:bg-warm-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* STEP 1: Product detail input */}
        {step === 1 ? (
          <div className="space-y-4">
            {/* Source picker */}
            {products && products.length > 0 ? (
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
                  Sumber produk
                </label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedProductId('manual')}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      selectedProductId === 'manual'
                        ? 'bg-orange-500 text-white'
                        : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                    }`}
                  >
                    ✏️ Input Manual
                  </button>
                  {products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePickProduct(p)}
                      className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        selectedProductId === p.id
                          ? 'bg-orange-500 text-white'
                          : 'bg-warm-100 text-warm-700 hover:bg-warm-200'
                      }`}
                    >
                      <Package className="h-3 w-3" />
                      {p.name.slice(0, 30)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Form fields */}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
                  Nama produk *
                </label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Cleanoz Pembersih Mesin"
                  className="mt-1 w-full rounded-md border border-warm-200 px-3 py-2 text-sm"
                  maxLength={200}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
                  Deskripsi singkat
                </label>
                <textarea
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                  rows={2}
                  placeholder="Pembersih mesin berbahan dasar minyak atsiri olahan, lunturkan kerak piston, irit BBM..."
                  className="mt-1 w-full rounded-md border border-warm-200 px-3 py-2 text-sm"
                  maxLength={1000}
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
                  Harga (Rp)
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="65000"
                  className="mt-1 w-full rounded-md border border-warm-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
                  Target customer
                </label>
                <input
                  type="text"
                  value={targetCustomer}
                  onChange={(e) => setTargetCustomer(e.target.value)}
                  placeholder="Pemilik motor, suka touring"
                  className="mt-1 w-full rounded-md border border-warm-200 px-3 py-2 text-sm"
                  maxLength={200}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
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
                        className="flex-1 rounded-md border border-warm-200 px-3 py-1.5 text-xs"
                        maxLength={200}
                      />
                      {benefits.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeBenefit(i)}
                          className="rounded-md border border-warm-200 px-2 text-warm-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {benefits.length < 5 ? (
                    <button
                      type="button"
                      onClick={addBenefit}
                      className="text-xs font-semibold text-orange-600 hover:underline"
                    >
                      + Tambah manfaat
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
                  Brand tone
                </label>
                <input
                  type="text"
                  value={brandTone}
                  onChange={(e) => setBrandTone(e.target.value)}
                  placeholder="casual energetic Indonesian TikTok Live"
                  className="mt-1 w-full rounded-md border border-warm-200 px-3 py-2 text-sm"
                  maxLength={200}
                />
              </div>
            </div>

            {/* Count picker */}
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-warm-600">
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
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-warm-200 bg-white hover:border-orange-300'
                    }`}
                  >
                    <div className="font-bold">{opt.label}</div>
                    <div className="text-[10px] text-warm-600">{opt.desc}</div>
                    <div className="mt-0.5 text-[9px] text-emerald-600">{opt.smoothness}</div>
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Voice: <strong>{voiceName}</strong> · Cost estimate ~Rp{' '}
                {Math.round(count * 2.5)}rb · Time ~{Math.round((count * 3) / 60) || 1}-{Math.round(count * 3 / 60) + 5} menit total
              </p>
            </div>

            <div className="flex justify-between gap-2 border-t border-warm-200 pt-3">
              <Button variant="outline" onClick={onClose}>
                Batal
              </Button>
              <Button onClick={() => void suggestNow()} disabled={suggesting || productName.trim().length < 2}>
                {suggesting ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Claude generate…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-3.5 w-3.5" />
                    Generate Saran ({count} script)
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null}

        {/* STEP 2: Review scripts */}
        {step === 2 ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-warm-50 p-2.5 text-[11px] text-warm-700">
              <strong>{scripts.filter((s) => s.approved).length}</strong> dari {scripts.length} klip dipilih · Uncheck untuk skip · Klik teks untuk edit · Hapus yang gak suka
            </div>

            <div className="space-y-2">
              {scripts.map((s, i) => {
                const meta = CATEGORY_META[s.category] ?? CATEGORY_META.GENERAL
                const overBudget = s.charCount > 129 && s.category !== 'IDLE'
                return (
                  <div
                    key={i}
                    className={`flex gap-2 rounded-lg border p-2.5 ${
                      s.approved ? 'border-warm-200 bg-white' : 'border-warm-200 bg-warm-50 opacity-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={s.approved}
                      onChange={() => toggleApproval(i)}
                      className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer accent-orange-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
                          {meta.emoji} {meta.label}
                        </span>
                        <span className={`text-[10px] ${overBudget ? 'font-bold text-red-600' : 'text-warm-500'}`}>
                          {s.charCount}/129 {overBudget ? '⚠️ over' : ''}
                        </span>
                        {/* Trigger + kpi_goal disembunyikan — info AI internal, gak action-able buat owner */}
                      </div>
                      {s.category === 'IDLE' ? (
                        <div className="mt-1 text-xs italic text-warm-500">
                          (Host diam senyum loop saat sepi — gak perlu script)
                        </div>
                      ) : (
                        <textarea
                          value={s.script}
                          onChange={(e) => editScript(i, e.target.value)}
                          rows={2}
                          className="mt-1 w-full resize-none rounded border border-warm-200 bg-white px-2 py-1 text-xs"
                          maxLength={200}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeScript(i)}
                      className="flex-shrink-0 self-start rounded p-1 text-warm-500 hover:bg-red-50 hover:text-red-600"
                      aria-label="Hapus"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>

            <div className="flex justify-between gap-2 border-t border-warm-200 pt-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={scripts.filter((s) => s.approved).length === 0}
              >
                Lanjut ({scripts.filter((s) => s.approved).length} klip)
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ) : null}

        {/* STEP 3: Confirm */}
        {step === 3 ? (
          <div className="space-y-3">
            <div className="rounded-xl border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-4">
              <div className="flex items-center gap-2 text-base font-semibold">
                <Rocket className="h-5 w-5 text-orange-500" />
                Siap fire bulk generate
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <div className="font-semibold">Total klip:</div>
                  <div className="text-warm-700">{scripts.filter((s) => s.approved).length} klip</div>
                </div>
                <div>
                  <div className="font-semibold">Voice:</div>
                  <div className="text-warm-700">{voiceName}</div>
                </div>
                <div>
                  <div className="font-semibold">Estimate waktu:</div>
                  <div className="text-warm-700">
                    ~{Math.round((scripts.filter((s) => s.approved).length * 2.5))} menit (sequential)
                  </div>
                </div>
                <div>
                  <div className="font-semibold">Estimate cost:</div>
                  <div className="text-warm-700">
                    ~Rp {scripts.filter((s) => s.approved).length * 2500}
                  </div>
                </div>
              </div>
              <div className="mt-3 text-[11px] text-warm-600">
                💡 Pipeline jalan di background. Klip akan muncul satu per satu di Library bawah. Refresh halaman berkala (atau auto-poll).
              </div>
            </div>

            <div className="flex justify-between gap-2 border-t border-warm-200 pt-3">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                Back
              </Button>
              <Button onClick={() => void submitGenerate()} disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Submitting…
                  </>
                ) : (
                  <>
                    <Rocket className="mr-2 h-3.5 w-3.5" />
                    🚀 Generate {scripts.filter((s) => s.approved).length} Klip
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
