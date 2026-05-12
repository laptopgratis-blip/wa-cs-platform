'use client'

// LpGratisWizard — wizard 4-step buat LP gratis tanpa upgrade plan.
// Flow:
//   1. Siapkan: instruksi siapkan foto produk + testimoni (no action).
//   2. Upload: drag-drop ke /api/lp/images. Auto-create draft LP saat upload
//      pertama supaya gambar attached ke lpId.
//   3. Prompt AI: textarea readonly dengan prompt template (sudah include
//      URL gambar dari step 2). Tombol Copy + link ke ChatGPT/Claude.ai.
//   4. Paste HTML: textarea, simpan ke draft LP via PATCH /api/lp/:id, lalu
//      redirect ke /landing-pages/:lpId/edit.
//
// Tujuan UX: hindari user kebingungan dengan banyak halaman/tab — semua
// dilakukan dalam satu wizard linear di /onboarding/lp-gratis.

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Grid3x3,
  ImagePlus,
  ListOrdered,
  Loader2,
  MessageSquareQuote,
  Pencil,
  Plus,
  Rocket,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

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
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// ─── Types ──────────────────────────────────────────────────────────────

interface LpImageRow {
  id: string
  filename: string
  originalName: string
  url: string
  size: number
  mimeType: string
  lpId: string | null
  createdAt: string
}

// Extended (local-only) — caption diisi user di mode advanced Step 2,
// nggak dipersist ke server karena cuma dipakai buat ngebantu prompt AI
// di step 3. Urutan dipertahankan oleh posisi di array.
type LpImage = LpImageRow & { caption?: string }

const TOTAL_STEPS = 4
const STEP_LABELS = [
  'Siapkan foto',
  'Upload foto',
  'Prompt AI',
  'Paste HTML',
]

// Generate slug unik berbentuk `lp-<timestamp36>-<random>` — match regex
// `^[a-z0-9]+(?:-[a-z0-9]+)*$` di lib/validations/lp.ts.
function generateSlug(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `lp-${ts}-${rand}`
}

interface PromptPayload {
  images: LpImage[]
  productName: string
  price: string
  description: string
  targetCustomer: string
  tone: string
  brandColor: string
  waNumber: string
}

// Bangun prompt template dari isian form. Field opsional yang kosong di-skip
// supaya prompt tidak penuh placeholder bracket. Kalau image punya caption
// (dari mode advanced Step 2), sertakan supaya AI tahu peran tiap gambar
// (mis. "hero", "testimoni Budi", "foto detail jahitan").
function buildPromptTemplate(p: PromptPayload): string {
  const imageLines =
    p.images.length > 0
      ? p.images
          .map((img, i) => {
            const caption = img.caption?.trim()
            return caption
              ? `Gambar ${i + 1}: ${img.url} — Keterangan: ${caption}`
              : `Gambar ${i + 1}: ${img.url}`
          })
          .join('\n')
      : '(Belum ada gambar yang di-upload)'

  // Susun bagian "DETAIL BISNIS" — selalu sertakan field utama, sertakan
  // field opsional hanya kalau diisi.
  const lines: string[] = [
    `NAMA PRODUK / BISNIS: ${p.productName.trim()}`,
    `DESKRIPSI: ${p.description.trim()}`,
    `HARGA: ${p.price.trim()}`,
    `TONE: ${p.tone}`,
    `NOMOR WHATSAPP UNTUK CTA: ${p.waNumber.trim()}`,
  ]
  if (p.targetCustomer.trim()) {
    lines.splice(2, 0, `TARGET CUSTOMER: ${p.targetCustomer.trim()}`)
  }
  if (p.brandColor.trim()) {
    lines.push(`WARNA BRAND UTAMA: ${p.brandColor.trim()}`)
  }

  return `Saya butuh kamu bikin landing page (HTML lengkap) untuk produk saya. Berikut detail bisnis & gambar:

${lines.join('\n')}

GAMBAR TERSEDIA (PAKAI YANG INI, JANGAN BIKIN URL BARU):
${imageLines}

LAYOUT — WAJIB DIIKUTI (PALING PENTING):
- LANDING PAGE 1 KOLOM VERTIKAL (single-column / one-column layout) dari atas ke bawah, baik di mobile MAUPUN desktop.
- Semua section full-width vertikal, satu di atas yang lain. TIDAK ADA grid 2-3 kolom, TIDAK ADA flex side-by-side untuk konten.
- Container utama pakai max-width 640px (atau 720px max) dengan margin auto supaya nyaman dibaca di desktop. Sisi kiri-kanan jadi padding/whitespace.
- Features/Benefits → list vertikal (satu item per baris, ikon kiri + teks kanan, atau ikon di atas teks). BUKAN grid 3 kolom.
- Testimoni → satu testimoni per baris, ditumpuk vertikal. BUKAN carousel atau grid.
- Foto produk → satu gambar per baris (full-width container), BUKAN gallery grid.
- FAQ → accordion vertikal atau list pertanyaan-jawaban berurutan ke bawah.

REQUIREMENT TEKNIS HTML:
- Buat 1 file HTML lengkap dengan inline CSS (tidak ada file CSS terpisah, no <link rel="stylesheet">).
- Mobile-first; di desktop tetap 1 kolom dengan max-width terbatas (lihat LAYOUT di atas).
- Pakai gambar di atas pada section yang relevan (hero / foto produk / testimoni). Setiap <img> width 100%, height auto, object-fit: cover.
- Hero section dengan headline kuat + CTA besar "Pesan Sekarang via WhatsApp" (full-width tombol).
- Section urut dari atas ke bawah: Hero → Features/Benefits → Foto Produk → Testimoni → FAQ → CTA penutup → Footer.
- Tombol CTA semua mengarah ke https://wa.me/${p.waNumber.trim()} dengan pesan template "Halo, saya tertarik dengan ${p.productName.trim()}"
- Font: Google Fonts (Inter / Plus Jakarta Sans).
- Style modern, bersih, bukan template lama 2010.

OUTPUT:
Berikan HANYA kode HTML lengkap dalam 1 file (mulai dari <!DOCTYPE html> sampai </html>) — tanpa penjelasan, tanpa markdown code fence. Saya akan langsung copy paste. Patuhi aturan LAYOUT 1 kolom secara KETAT.`
}

// ─── Component ──────────────────────────────────────────────────────────

interface LpGratisWizardProps {
  /**
   * Callback opsional saat user selesai paste HTML (step 4). Kalau di-set,
   * wizard tidak `router.push` ke /landing-pages/:id/edit — caller yang
   * handle (mis. embedded di onboarding: callback publish LP + advance step).
   */
  onCompleted?: (lpId: string) => void
}

export function LpGratisWizard({ onCompleted }: LpGratisWizardProps = {}) {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [lpId, setLpId] = useState<string | null>(null)
  const [creatingDraft, setCreatingDraft] = useState(false)
  const [images, setImages] = useState<LpImage[]>([])
  const [htmlContent, setHtmlContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Lazy-create draft LP. Dipanggil pertama kali saat user mau upload (step 2)
  // atau saat sudah masuk step 4 (kalau user skip upload). Idempotent —
  // panggil >1x cuma return lpId yang udah ada.
  const ensureDraft = useCallback(async (): Promise<string | null> => {
    if (lpId) return lpId
    setCreatingDraft(true)
    try {
      const res = await fetch('/api/lp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Landing Page Saya',
          slug: generateSlug(),
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { id: string }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Tidak bisa buat draft LP')
        return null
      }
      setLpId(json.data.id)
      return json.data.id
    } catch (err) {
      console.error('[LpGratis ensureDraft]', err)
      toast.error('Tidak bisa hubungi server')
      return null
    } finally {
      setCreatingDraft(false)
    }
  }, [lpId])

  function goNext() {
    if (step < TOTAL_STEPS) setStep((step + 1) as 1 | 2 | 3 | 4)
  }
  function goPrev() {
    if (step > 1) setStep((step - 1) as 1 | 2 | 3 | 4)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-orange-500 text-white shadow-orange">
          <Rocket className="size-7" />
        </div>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 md:text-3xl">
          Bikin Landing Page Gratis
        </h1>
        <p className="mt-1 text-sm text-warm-600">
          Ikutin 4 langkah ini — selesai dalam 5-10 menit. Tidak perlu upgrade
          plan.
        </p>
      </div>

      {/* Progress pills */}
      <div className="mb-6 flex items-center justify-between gap-1">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1
          const done = n < step
          const current = n === step
          return (
            <div
              key={label}
              className="flex flex-1 flex-col items-center gap-1.5"
            >
              <div className="relative flex w-full items-center">
                {i > 0 && (
                  <div
                    className={cn(
                      'absolute right-1/2 -ml-px h-0.5 w-full -translate-x-1/2',
                      n <= step ? 'bg-primary-500' : 'bg-warm-200',
                    )}
                  />
                )}
                <span
                  className={cn(
                    'relative z-10 mx-auto flex size-8 items-center justify-center rounded-full text-xs font-bold ring-4 ring-warm-50 transition',
                    done
                      ? 'bg-emerald-500 text-white'
                      : current
                        ? 'bg-primary-500 text-white shadow-md'
                        : 'bg-warm-200 text-warm-500',
                  )}
                >
                  {done ? <Check className="size-4" /> : n}
                </span>
              </div>
              <span
                className={cn(
                  'text-center text-[10px] font-medium leading-tight',
                  current
                    ? 'text-primary-700'
                    : done
                      ? 'text-emerald-700'
                      : 'text-warm-500',
                )}
              >
                {label}
              </span>
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div className="rounded-2xl border-2 border-primary-200 bg-card p-5 shadow-sm md:p-6">
        {step === 1 && <Step1Prepare />}
        {step === 2 && (
          <Step2Upload
            lpId={lpId}
            ensureDraft={ensureDraft}
            creatingDraft={creatingDraft}
            images={images}
            onImagesChange={setImages}
          />
        )}
        {step === 3 && <Step3Prompt images={images} />}
        {step === 4 && (
          <Step4Paste
            htmlContent={htmlContent}
            onChange={setHtmlContent}
            ensureDraft={ensureDraft}
            lpId={lpId}
            submitting={submitting}
            onSubmit={async () => {
              setSubmitting(true)
              try {
                const id = await ensureDraft()
                if (!id) {
                  setSubmitting(false)
                  return
                }
                const res = await fetch(`/api/lp/${id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ htmlContent: htmlContent.trim() }),
                })
                const json = (await res.json()) as {
                  success: boolean
                  error?: string
                }
                if (!res.ok || !json.success) {
                  toast.error(json.error || 'Gagal simpan HTML')
                  setSubmitting(false)
                  return
                }
                if (onCompleted) {
                  onCompleted(id)
                  return
                }
                toast.success('LP tersimpan, buka editor…')
                router.push(`/landing-pages/${id}/edit`)
              } catch (err) {
                console.error('[LpGratis submit]', err)
                toast.error('Tidak bisa hubungi server')
                setSubmitting(false)
              }
            }}
          />
        )}
      </div>

      {/* Footer nav */}
      <div className="mt-5 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={goPrev}
          disabled={step === 1 || submitting}
        >
          <ArrowLeft className="mr-1.5 size-4" /> Sebelumnya
        </Button>
        {step < 4 ? (
          <Button
            onClick={goNext}
            disabled={(step === 2 && images.length === 0) || creatingDraft}
            className="bg-primary-500 hover:bg-primary-600"
          >
            {step === 2 && images.length === 0 ? (
              'Upload minimal 1 gambar dulu'
            ) : (
              <>
                Lanjut <ArrowRight className="ml-1.5 size-4" />
              </>
            )}
          </Button>
        ) : (
          <Button asChild variant="ghost">
            <Link href="/dashboard">Batal</Link>
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Step 1: Siapkan ────────────────────────────────────────────────────

function Step1Prepare() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-extrabold text-warm-900">
          Step 1 — Siapkan foto-foto kamu dulu
        </h2>
        <p className="mt-1 text-sm text-warm-600">
          Buka folder foto di HP atau laptop. Pisahkan 2 jenis foto ini:
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-2">
            <Camera className="size-5 text-blue-600" />
            <h3 className="font-display text-sm font-bold text-blue-900">
              Foto Produk
            </h3>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-blue-800">
            <li>• 2-4 foto produk dari sudut berbeda</li>
            <li>• Foto produk dipakai (kalau ada)</li>
            <li>• Foto detail / kemasan</li>
          </ul>
        </div>
        <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <MessageSquareQuote className="size-5 text-emerald-600" />
            <h3 className="font-display text-sm font-bold text-emerald-900">
              Testimoni Pelanggan
            </h3>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-emerald-800">
            <li>• Screenshot chat WA pelanggan puas</li>
            <li>• Foto pelanggan pakai produk (izin dulu)</li>
            <li>• Review dari sosmed/marketplace</li>
          </ul>
        </div>
      </div>

      <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
        <p className="font-semibold">💡 Tips supaya hasil maksimal:</p>
        <ul className="mt-1 space-y-0.5 pl-4">
          <li>
            Format: <strong>JPG, PNG, atau WebP</strong> — max 4 MB per foto
          </li>
          <li>
            Resolusi minimal <strong>1000px</strong> di sisi terpanjang
          </li>
          <li>Pencahayaan terang, latar bersih (kalau bisa polos)</li>
          <li>
            Untuk testimoni: edit dulu yang sensitif (nomor HP, nama lengkap
            pelanggan kalau perlu)
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-warm-200 bg-warm-50 p-3 text-xs text-warm-700">
        Setelah foto siap di laptop/HP, klik <strong>Lanjut</strong> di bawah
        untuk upload.
      </div>
    </div>
  )
}

// ─── Step 2: Upload ─────────────────────────────────────────────────────

function Step2Upload({
  lpId,
  ensureDraft,
  creatingDraft,
  images,
  onImagesChange,
}: {
  lpId: string | null
  ensureDraft: () => Promise<string | null>
  creatingDraft: boolean
  images: LpImage[]
  onImagesChange: (next: LpImage[]) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [advancedMode, setAdvancedMode] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initial fetch — kalau lpId sudah ada (mis. user back-navigate), reload
  // images yang sudah attached.
  useEffect(() => {
    if (!lpId) return
    let aborted = false
    async function load() {
      try {
        const res = await fetch('/api/lp/images', { cache: 'no-store' })
        const json = (await res.json()) as {
          success: boolean
          data?: LpImageRow[]
        }
        if (aborted) return
        if (json.success && json.data) {
          onImagesChange(json.data.filter((img) => img.lpId === lpId))
        }
      } catch (err) {
        console.warn('[LpGratis Step2 load]', err)
      }
    }
    void load()
    return () => {
      aborted = true
    }
  }, [lpId, onImagesChange])

  async function handleFiles(files: FileList) {
    if (files.length === 0) return
    const id = await ensureDraft()
    if (!id) return

    setUploading(true)
    const newOnes: LpImage[] = []
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('lpId', id)
        const res = await fetch('/api/lp/images', {
          method: 'POST',
          body: fd,
        })
        const json = (await res.json()) as {
          success: boolean
          data?: LpImageRow
          error?: string
        }
        if (!res.ok || !json.success || !json.data) {
          toast.error(json.error || `Gagal upload ${file.name}`)
          continue
        }
        newOnes.push(json.data)
      }
      if (newOnes.length > 0) {
        onImagesChange([...images, ...newOnes])
        toast.success(`${newOnes.length} foto terupload`)
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(imgId: string) {
    if (!confirm('Hapus foto ini?')) return
    setDeletingId(imgId)
    try {
      const res = await fetch(`/api/lp/images?id=${imgId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        toast.error('Gagal hapus')
        return
      }
      onImagesChange(images.filter((img) => img.id !== imgId))
    } finally {
      setDeletingId(null)
    }
  }

  function handleCaptionChange(imgId: string, caption: string) {
    onImagesChange(
      images.map((img) =>
        img.id === imgId ? { ...img, caption } : img,
      ),
    )
  }

  function handleMove(fromIdx: number, direction: -1 | 1) {
    const toIdx = fromIdx + direction
    if (toIdx < 0 || toIdx >= images.length) return
    const next = [...images]
    ;[next[fromIdx], next[toIdx]] = [next[toIdx], next[fromIdx]]
    onImagesChange(next)
  }

  return (
    <div className="space-y-4">
      {/* Header + tombol toggle advanced mode */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-extrabold text-warm-900">
            Step 2 — Upload foto-foto kamu
          </h2>
          <p className="mt-1 text-sm text-warm-600">
            {advancedMode ? (
              <>
                Mode lanjutan: atur urutan & isi keterangan tiap foto. AI akan
                pakai info ini supaya hasil landing page lebih akurat.
              </>
            ) : (
              <>
                Klik area di bawah atau drag-drop file. Bisa upload banyak
                sekaligus.
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdvancedMode((v) => !v)}
          aria-label={
            advancedMode
              ? 'Kembali ke tampilan sederhana'
              : 'Mode lanjutan: atur urutan & keterangan'
          }
          title={
            advancedMode
              ? 'Kembali ke tampilan sederhana'
              : 'Mode lanjutan: atur urutan & keterangan'
          }
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg border transition',
            advancedMode
              ? 'border-primary-500 bg-primary-50 text-primary-700 hover:bg-primary-100'
              : 'border-warm-300 bg-card text-warm-600 hover:border-primary-400 hover:text-primary-600',
          )}
        >
          {advancedMode ? (
            <Grid3x3 className="size-4" />
          ) : (
            <ListOrdered className="size-4" />
          )}
        </button>
      </div>

      {/* Mode sederhana: dropzone besar + grid thumbnail */}
      {!advancedMode && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || creatingDraft}
            className={cn(
              'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-warm-50 px-6 py-10 transition',
              uploading
                ? 'cursor-wait border-primary-300'
                : 'border-warm-300 hover:border-primary-400 hover:bg-primary-50',
            )}
          >
            {uploading ? (
              <>
                <Loader2 className="size-8 animate-spin text-primary-500" />
                <span className="text-sm font-medium text-warm-700">
                  Mengupload…
                </span>
              </>
            ) : creatingDraft ? (
              <>
                <Loader2 className="size-8 animate-spin text-primary-500" />
                <span className="text-sm font-medium text-warm-700">
                  Menyiapkan…
                </span>
              </>
            ) : (
              <>
                <ImagePlus className="size-8 text-primary-500" />
                <span className="text-sm font-semibold text-warm-900">
                  Klik untuk pilih foto
                </span>
                <span className="text-[11px] text-warm-500">
                  JPG / PNG / WebP, max 4 MB per foto
                </span>
              </>
            )}
          </button>

          {images.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-warm-700">
                {images.length} foto sudah terupload:
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-warm-200 bg-warm-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt={img.originalName}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleDelete(img.id)}
                      disabled={deletingId === img.id}
                      className="absolute right-1 top-1 hidden size-6 items-center justify-center rounded-full bg-rose-500 text-white shadow-md hover:bg-rose-600 group-hover:flex"
                      aria-label="Hapus foto"
                    >
                      {deletingId === img.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </button>
                    {img.caption?.trim() && (
                      <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                        {img.caption}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-warm-500">
                💡 Mau atur urutan / kasih keterangan tiap foto? Klik tombol{' '}
                <ListOrdered className="inline size-3 align-text-bottom" /> di
                kanan atas.
              </p>
            </div>
          )}
        </>
      )}

      {/* Mode lanjutan: list vertikal + caption + reorder */}
      {advancedMode && (
        <div className="space-y-3">
          {images.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || creatingDraft}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-warm-300 bg-warm-50 px-6 py-10 transition hover:border-primary-400 hover:bg-primary-50"
            >
              {uploading || creatingDraft ? (
                <>
                  <Loader2 className="size-8 animate-spin text-primary-500" />
                  <span className="text-sm font-medium text-warm-700">
                    {uploading ? 'Mengupload…' : 'Menyiapkan…'}
                  </span>
                </>
              ) : (
                <>
                  <ImagePlus className="size-8 text-primary-500" />
                  <span className="text-sm font-semibold text-warm-900">
                    Klik untuk upload foto pertama
                  </span>
                </>
              )}
            </button>
          ) : (
            <>
              <ol className="space-y-2.5">
                {images.map((img, idx) => {
                  const isFirst = idx === 0
                  const isLast = idx === images.length - 1
                  return (
                    <li
                      key={img.id}
                      className="flex gap-3 rounded-xl border border-warm-200 bg-card p-2.5 sm:p-3"
                    >
                      {/* Kolom kiri: panah reorder + nomor */}
                      <div className="flex shrink-0 flex-col items-center justify-between gap-1">
                        <button
                          type="button"
                          onClick={() => handleMove(idx, -1)}
                          disabled={isFirst}
                          aria-label="Pindah ke atas"
                          title="Pindah ke atas"
                          className={cn(
                            'flex size-7 items-center justify-center rounded-md border transition',
                            isFirst
                              ? 'cursor-not-allowed border-warm-200 text-warm-300'
                              : 'border-warm-300 text-warm-700 hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600',
                          )}
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <span className="flex size-7 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                          {idx + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleMove(idx, 1)}
                          disabled={isLast}
                          aria-label="Pindah ke bawah"
                          title="Pindah ke bawah"
                          className={cn(
                            'flex size-7 items-center justify-center rounded-md border transition',
                            isLast
                              ? 'cursor-not-allowed border-warm-200 text-warm-300'
                              : 'border-warm-300 text-warm-700 hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600',
                          )}
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                      </div>

                      {/* Thumbnail */}
                      <div className="size-20 shrink-0 overflow-hidden rounded-lg border border-warm-200 bg-warm-100 sm:size-24">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={img.url}
                          alt={img.originalName}
                          className="size-full object-cover"
                        />
                      </div>

                      {/* Caption + meta + delete */}
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <Label
                            htmlFor={`caption-${img.id}`}
                            className="text-[11px] font-semibold text-warm-700"
                          >
                            Keterangan foto ke-{idx + 1}
                          </Label>
                          <button
                            type="button"
                            onClick={() => handleDelete(img.id)}
                            disabled={deletingId === img.id}
                            aria-label="Hapus foto"
                            title="Hapus foto"
                            className="flex size-6 shrink-0 items-center justify-center rounded-md text-warm-500 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            {deletingId === img.id ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                          </button>
                        </div>
                        <Textarea
                          id={`caption-${img.id}`}
                          value={img.caption ?? ''}
                          onChange={(e) =>
                            handleCaptionChange(img.id, e.target.value)
                          }
                          rows={2}
                          maxLength={200}
                          placeholder='Contoh: "Foto utama produk", "Testimoni dari Bu Ani", "Detail jahitan", "Foto pemakaian"'
                          className="resize-none text-xs"
                        />
                      </div>
                    </li>
                  )
                })}
              </ol>

              {/* Tombol tambah foto */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || creatingDraft}
                className={cn(
                  'flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm font-semibold transition',
                  uploading || creatingDraft
                    ? 'cursor-wait border-primary-300 text-warm-500'
                    : 'border-primary-300 bg-primary-50/30 text-primary-700 hover:border-primary-500 hover:bg-primary-50',
                )}
              >
                {uploading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Mengupload…
                  </>
                ) : (
                  <>
                    <Plus className="size-4" />
                    Tambah foto
                  </>
                )}
              </button>

              <p className="rounded-md bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-900">
                💡 <strong>Tips:</strong> isi keterangan singkat tiap foto (mis.
                &ldquo;foto utama produk&rdquo;, &ldquo;testimoni Bu Ani&rdquo;,
                &ldquo;detail jahitan&rdquo;). Keterangan ini ikut dipakai saat
                generate prompt — AI jadi tahu mana foto produk, mana testimoni,
                mana yang dipakai sebagai hero.
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files)
        }}
      />

      {images.length === 0 && !advancedMode && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Upload minimal 1 foto untuk lanjut ke step berikut. Idealnya 3-6 foto
          (campuran produk + testimoni).
        </p>
      )}
    </div>
  )
}

// ─── Step 3: Prompt AI ──────────────────────────────────────────────────

const TONE_OPTIONS = ['Friendly', 'Profesional', 'Santai', 'Sales-y'] as const
type Tone = (typeof TONE_OPTIONS)[number]

function Step3Prompt({ images }: { images: LpImage[] }) {
  // Form state — bertahan kalau user toggle generated → edit ulang.
  const [productName, setProductName] = useState('')
  const [price, setPrice] = useState('')
  const [description, setDescription] = useState('')
  const [targetCustomer, setTargetCustomer] = useState('')
  const [tone, setTone] = useState<Tone>('Friendly')
  const [brandColor, setBrandColor] = useState('')
  const [waNumber, setWaNumber] = useState('')

  // Hasil generate.
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function handleGenerate() {
    if (productName.trim().length < 2) {
      toast.error('Nama produk minimal 2 karakter')
      return
    }
    if (!price.trim()) {
      toast.error('Harga wajib diisi')
      return
    }
    if (description.trim().length < 5) {
      toast.error('Deskripsi minimal 5 karakter')
      return
    }
    if (!waNumber.trim() || waNumber.replace(/\D/g, '').length < 10) {
      toast.error('Nomor WhatsApp tidak valid (format: 62 + nomor tanpa 0)')
      return
    }
    const prompt = buildPromptTemplate({
      images,
      productName,
      price,
      description,
      targetCustomer,
      tone,
      brandColor,
      waNumber: waNumber.replace(/\D/g, ''),
    })
    setGeneratedPrompt(prompt)
    setCopied(false)
    // Auto-scroll prompt ke view kalau popover panjang.
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }, 50)
  }

  async function handleCopy() {
    if (!generatedPrompt) return
    try {
      await navigator.clipboard.writeText(generatedPrompt)
      setCopied(true)
      toast.success('Prompt tercopy! Paste di Gemini atau Claude.ai')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Browser tidak izinkan akses clipboard. Copy manual.')
    }
  }

  function handleEditAgain() {
    setGeneratedPrompt(null)
    setCopied(false)
  }

  // ─── Mode "Form belum di-generate" ─────────────────────────────────
  if (!generatedPrompt) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-lg font-extrabold text-warm-900">
            Step 3 — Isi info produk
          </h2>
          <p className="mt-1 text-sm text-warm-600">
            Isi form sederhana ini, klik <strong>Generate Prompt</strong>.
            Setelah itu, copy hasilnya & paste ke Gemini atau Claude.ai untuk
            bikin HTML.
          </p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lpg-name" className="text-xs">
              Nama produk / bisnis <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="lpg-name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Contoh: Sneakers Brand Lokal X"
              maxLength={100}
              className="h-9 text-sm"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lpg-price" className="text-xs">
                Harga <span className="text-rose-500">*</span>
              </Label>
              <Input
                id="lpg-price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Rp 350.000"
                maxLength={50}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lpg-tone" className="text-xs">
                Gaya bicara
              </Label>
              <Select value={tone} onValueChange={(v) => setTone(v as Tone)}>
                <SelectTrigger id="lpg-tone" className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONE_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="text-sm">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lpg-desc" className="text-xs">
              Deskripsi produk <span className="text-rose-500">*</span>
            </Label>
            <Textarea
              id="lpg-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="1-3 kalimat tentang produkmu. Contoh: Sneakers handmade dari kulit asli, ringan dan nyaman dipakai seharian. Cocok untuk casual maupun semi-formal."
              maxLength={500}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lpg-wa" className="text-xs">
              Nomor WhatsApp untuk tombol CTA{' '}
              <span className="text-rose-500">*</span>
            </Label>
            <div className="flex items-stretch overflow-hidden rounded-md border border-warm-200">
              <span className="flex items-center bg-warm-50 px-2 text-xs text-warm-600">
                +
              </span>
              <Input
                id="lpg-wa"
                value={waNumber}
                onChange={(e) => setWaNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="6281234567890"
                maxLength={15}
                className="h-9 rounded-none border-0 font-mono text-sm focus-visible:ring-0"
              />
            </div>
            <p className="text-[10px] text-warm-500">
              Format: 62 + nomor tanpa 0 di depan (mis. 6281234567890)
            </p>
          </div>

          {/* Field opsional dalam group collapsible-feel */}
          <details className="rounded-md border border-warm-200 bg-warm-50/40">
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-warm-700 hover:text-warm-900">
              + Detail tambahan (opsional, supaya hasil makin bagus)
            </summary>
            <div className="space-y-3 px-3 pb-3 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="lpg-target" className="text-xs">
                  Target customer
                </Label>
                <Input
                  id="lpg-target"
                  value={targetCustomer}
                  onChange={(e) => setTargetCustomer(e.target.value)}
                  placeholder="Contoh: wanita 18-35 tahun, urban, pekerja kantoran"
                  maxLength={150}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lpg-color" className="text-xs">
                  Warna brand utama
                </Label>
                <Input
                  id="lpg-color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  placeholder="Contoh: orange & putih, biru navy + emas"
                  maxLength={80}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </details>
        </div>

        <Button
          type="button"
          onClick={handleGenerate}
          size="lg"
          className="w-full bg-primary-500 hover:bg-primary-600"
        >
          <Wand2 className="mr-2 size-4" />
          Generate Prompt
        </Button>

        <p className="text-[10px] text-warm-500">
          Setelah klik, prompt siap-copy akan muncul di sini. Kamu paste-nya di
          Gemini / Claude.ai.
        </p>
      </div>
    )
  }

  // ─── Mode "Sudah di-generate" — tampilkan prompt + tombol AI ─────────
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-extrabold text-warm-900">
            Step 3 — Prompt siap di-copy
          </h2>
          <p className="mt-1 text-sm text-warm-600">
            Klik <strong>Copy Prompt</strong>, lalu paste di Gemini atau
            Claude.ai untuk bikin HTML-nya.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleEditAgain}
          className="shrink-0"
        >
          <Pencil className="mr-1.5 size-3.5" /> Edit ulang
        </Button>
      </div>

      <div className="relative">
        <Textarea
          value={generatedPrompt}
          readOnly
          rows={12}
          className="resize-none bg-warm-50 font-mono text-[11px] leading-relaxed"
        />
        <Button
          type="button"
          onClick={handleCopy}
          size="sm"
          className={cn(
            'absolute right-2 top-2 shadow-md',
            copied
              ? 'bg-emerald-500 hover:bg-emerald-600'
              : 'bg-primary-500 hover:bg-primary-600',
          )}
        >
          {copied ? (
            <>
              <CheckCircle2 className="mr-1 size-4" /> Tercopy!
            </>
          ) : (
            <>
              <Copy className="mr-1 size-4" /> Copy Prompt
            </>
          )}
        </Button>
      </div>

      <div className="rounded-xl border-2 border-primary-200 bg-primary-50/50 p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary-600" />
          <h3 className="text-sm font-bold text-warm-900">
            Buka AI gratis di tab baru:
          </h3>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Button
            asChild
            variant="outline"
            size="lg"
            className="justify-start border-warm-300 bg-card hover:bg-warm-50"
          >
            <Link
              href="https://gemini.google.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="mr-2 text-lg">✨</span>
              <span className="flex-1 text-left">
                <span className="block font-semibold">Gemini (Google)</span>
                <span className="block text-[10px] text-warm-500">
                  wajib pakai mode <strong className="text-primary-600">Canvas</strong>
                </span>
              </span>
              <ExternalLink className="ml-auto size-4 text-warm-400" />
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="justify-start border-warm-300 bg-card hover:bg-warm-50"
          >
            <Link
              href="https://claude.ai"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="mr-2 text-lg">🤖</span>
              <span className="flex-1 text-left">
                <span className="block font-semibold">Claude.ai</span>
                <span className="block text-[10px] text-warm-500">
                  claude.ai (paling bagus untuk HTML)
                </span>
              </span>
              <ExternalLink className="ml-auto size-4 text-warm-400" />
            </Link>
          </Button>
        </div>
      </div>

      <ol className="space-y-1.5 rounded-lg border border-warm-200 bg-card p-4 text-sm text-warm-700">
        <li className="flex gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
            1
          </span>
          Klik <strong>Copy Prompt</strong> di atas
        </li>
        <li className="flex gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
            2
          </span>
          Buka Gemini atau Claude.ai (login pakai akun Google / email)
        </li>
        <li className="flex gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
            3
          </span>
          <span>
            <strong>Khusus Gemini</strong>: di bawah kolom ketik, klik tombol{' '}
            <span className="inline-flex items-center gap-1 rounded-md border border-primary-300 bg-primary-50 px-1.5 py-0.5 text-[11px] font-semibold text-primary-700">
              <Sparkles className="size-3" /> Canvas
            </span>{' '}
            dulu — supaya hasilnya berupa preview HTML, bukan teks panjang.
            (Kalau pakai Claude.ai, langsung paste saja, tidak perlu setting apa-apa.)
          </span>
        </li>
        <li className="flex gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
            4
          </span>
          Paste prompt → kirim, tunggu AI generate HTML
        </li>
        <li className="flex gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[10px] font-bold text-primary-700">
            5
          </span>
          Copy SELURUH HTML (mulai{' '}
          <code className="rounded bg-warm-100 px-1 text-[10px]">
            &lt;!DOCTYPE html&gt;
          </code>{' '}
          sampai{' '}
          <code className="rounded bg-warm-100 px-1 text-[10px]">
            &lt;/html&gt;
          </code>
          )
        </li>
        <li className="flex gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
            6
          </span>
          Klik <strong>Lanjut</strong> di bawah, paste HTML-nya
        </li>
      </ol>
    </div>
  )
}

// ─── Step 4: Paste HTML & Submit ────────────────────────────────────────

function Step4Paste({
  htmlContent,
  onChange,
  submitting,
  onSubmit,
}: {
  htmlContent: string
  onChange: (next: string) => void
  ensureDraft: () => Promise<string | null>
  lpId: string | null
  submitting: boolean
  onSubmit: () => Promise<void>
}) {
  const isValid =
    htmlContent.trim().length > 200 &&
    htmlContent.includes('<') &&
    htmlContent.includes('>')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-lg font-extrabold text-warm-900">
          Step 4 — Paste HTML hasil AI
        </h2>
        <p className="mt-1 text-sm text-warm-600">
          Paste seluruh HTML yang AI hasilkan ke kotak di bawah, lalu klik{' '}
          <strong>Simpan & Buka Editor</strong>.
        </p>
      </div>

      <Textarea
        value={htmlContent}
        onChange={(e) => onChange(e.target.value)}
        rows={14}
        placeholder={'<!DOCTYPE html>\n<html lang="id">\n  <head>\n    ...\n  </head>\n  <body>\n    ...\n  </body>\n</html>'}
        className="resize-y bg-warm-900 font-mono text-[11px] leading-relaxed text-warm-100 placeholder:text-warm-500"
      />

      <div className="flex flex-wrap items-center gap-3 text-xs text-warm-600">
        <span>
          {htmlContent.length.toLocaleString('id-ID')} karakter
        </span>
        {htmlContent.length > 0 && (
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold',
              isValid
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-800',
            )}
          >
            {isValid ? (
              <>
                <CheckCircle2 className="size-3" /> HTML terlihat valid
              </>
            ) : (
              <>HTML kelihatan terlalu pendek atau salah format</>
            )}
          </span>
        )}
      </div>

      <Button
        type="button"
        onClick={() => void onSubmit()}
        disabled={!isValid || submitting}
        size="lg"
        className="w-full bg-emerald-600 hover:bg-emerald-700"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" />
            Menyimpan…
          </>
        ) : (
          <>
            <Upload className="mr-2 size-4" />
            Simpan & Buka Editor LP
          </>
        )}
      </Button>

      <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-900">
        💡 Setelah klik Simpan, kamu akan dibawa ke editor LP. Di sana kamu
        bisa edit visual (klik teks/gambar), ganti warna, ubah link, dan
        publish LP-mu.
      </p>
    </div>
  )
}
