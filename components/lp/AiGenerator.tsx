'use client'

// AiGenerator — panel atas tengah editor LP. Form deskripsi + URL gambar +
// style + CTA + nomor WA, panggil /api/lp/generate, hasilkan HTML yang
// langsung mengganti htmlContent di editor.
//
// Collapsible — default collapsed setelah generate sukses (kasih ruang ke editor).
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Gem,
  Loader2,
  PenLine,
  Sparkles,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  LP_CTA_TYPES,
  LP_STYLES,
  type LpCtaType,
  type LpStyle,
} from '@/lib/validations/lp-generate'

// Template prompt yg di-copy saat user free dialihkan ke alur manual.
// User tinggal isi placeholder, paste ke ChatGPT/Claude.ai gratis, lalu paste
// HTML hasil ke editor Hulao.
const MANUAL_PROMPT_TEMPLATE = `Buat HTML landing page lengkap untuk bisnis saya:

Nama Bisnis: [tulis nama]
Produk/Jasa: [deskripsi]
Target Customer: [siapa]
Tone: [profesional/santai/sales-y]
Warna Brand: [warna utama]
Call to Action: [tombol utama]
Nomor WhatsApp: [nomor]

Buat HTML lengkap dengan:
- Inline CSS (tidak pakai file terpisah)
- Mobile responsive
- Hero section dengan headline kuat
- Features/Benefits, Testimonials, FAQ section
- Footer dengan kontak
- Tombol WhatsApp click-to-chat

Berikan hanya kode HTML lengkap dalam satu file, tanpa penjelasan tambahan.`

interface Props {
  lpId: string
  // Hasil HTML masuk ke HTML editor di shell.
  onGenerated: (html: string) => void
}

export function AiGenerator({ lpId, onGenerated }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(true)
  const [description, setDescription] = useState('')
  const [imageUrls, setImageUrls] = useState('')
  const [style, setStyle] = useState<LpStyle>('MODERN_MINIMALIS')
  const [ctaType, setCtaType] = useState<LpCtaType>('WHATSAPP')
  const [waNumber, setWaNumber] = useState('')
  const [isGenerating, setGenerating] = useState(false)
  const [lastUsage, setLastUsage] = useState<{
    tokensUsed: number
    inputTokens: number
    outputTokens: number
  } | null>(null)
  // Modal "Saldo tidak cukup" — muncul saat backend return 402 INSUFFICIENT_TOKEN.
  // Tidak block fitur lain; user tinggal pilih top-up, copy prompt manual,
  // atau lanjut tanpa AI.
  const [insufficientInfo, setInsufficientInfo] = useState<{
    message: string
    minRequired: number
    currentBalance: number
  } | null>(null)

  async function copyPromptTemplate() {
    try {
      await navigator.clipboard.writeText(MANUAL_PROMPT_TEMPLATE)
      toast.success(
        'Prompt sudah di-copy! Paste di ChatGPT atau Claude.ai untuk generate HTML, lalu paste hasilnya di editor di bawah.',
      )
      setInsufficientInfo(null)
    } catch {
      toast.error('Browser tidak izinkan akses clipboard. Copy manual dari halaman ini.')
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setGenerating(true)
    try {
      const res = await fetch('/api/lp/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lpId,
          description: description.trim(),
          imageUrls: imageUrls.trim(),
          style,
          ctaType,
          waNumber: waNumber.trim(),
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: {
          html: string
          tokensUsed: number
          aiUsage: { inputTokens: number; outputTokens: number }
        }
        error?: string
        message?: string
        minRequired?: number
        currentBalance?: number
      }

      // Backend signal saldo tidak cukup — tampilkan modal opsi alternatif.
      if (
        res.status === 402 &&
        json.error === 'INSUFFICIENT_TOKEN' &&
        typeof json.minRequired === 'number'
      ) {
        setInsufficientInfo({
          message: json.message ?? 'Saldo token tidak cukup untuk AI generate.',
          minRequired: json.minRequired,
          currentBalance: json.currentBalance ?? 0,
        })
        return
      }

      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal generate')
        return
      }
      onGenerated(json.data.html)
      setLastUsage({
        tokensUsed: json.data.tokensUsed,
        inputTokens: json.data.aiUsage.inputTokens,
        outputTokens: json.data.aiUsage.outputTokens,
      })
      toast.success(
        `HTML berhasil di-generate (potong ${json.data.tokensUsed} token)`,
      )
      // Auto-collapse setelah sukses supaya editor punya ruang.
      setOpen(false)
    } catch (err) {
      console.error(err)
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between border-b border-warm-200 px-4 py-2.5 text-left hover:bg-warm-50"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary-500" />
          <span className="font-display text-sm font-bold text-warm-900">
            Generate dengan AI
          </span>
          {lastUsage && !open && (
            <span className="text-[10px] text-warm-500">
              · terakhir: {lastUsage.outputTokens} output tokens, potong{' '}
              {lastUsage.tokensUsed} token platform
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="size-4 text-warm-500" />
        ) : (
          <ChevronDown className="size-4 text-warm-500" />
        )}
      </button>

      {open && (
        <form onSubmit={handleGenerate} className="space-y-3 p-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="ai-desc" className="text-xs">
              Describe produk kamu
            </Label>
            <Textarea
              id="ai-desc"
              rows={4}
              placeholder="Contoh: Saya jual sepatu sneakers wanita brand lokal. Target: wanita 18-35 tahun. Warna: putih dan hitam. Harga: Rp 350.000. WA untuk order: 08xxx"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={3000}
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-imgs" className="text-xs">
              URL gambar (paste dari Image Manager)
            </Label>
            <Textarea
              id="ai-imgs"
              rows={3}
              placeholder={
                'Gambar hero: https://...\nGambar produk 1: https://...'
              }
              value={imageUrls}
              onChange={(e) => setImageUrls(e.target.value)}
              maxLength={5000}
              className="font-mono text-[11px]"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ai-style" className="text-xs">
                Gaya Landing Page
              </Label>
              <Select
                value={style}
                onValueChange={(v) => setStyle(v as LpStyle)}
              >
                <SelectTrigger id="ai-style" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LP_STYLES.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-cta" className="text-xs">
                Tombol CTA utama
              </Label>
              <Select
                value={ctaType}
                onValueChange={(v) => setCtaType(v as LpCtaType)}
              >
                <SelectTrigger id="ai-cta" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LP_CTA_TYPES.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="text-xs">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {ctaType === 'WHATSAPP' && (
            <div className="space-y-1.5">
              <Label htmlFor="ai-wa" className="text-xs">
                Nomor WA (untuk CTA)
              </Label>
              <Input
                id="ai-wa"
                placeholder="6281234567890"
                value={waNumber}
                onChange={(e) =>
                  setWaNumber(e.target.value.replace(/\D/g, ''))
                }
                maxLength={15}
                className="h-9 font-mono text-xs"
              />
              <p className="text-[10px] text-warm-500">
                Format: 62 + nomor tanpa 0 di depan (mis. 6281234567890)
              </p>
            </div>
          )}

          <Button
            type="submit"
            disabled={isGenerating || description.trim().length < 20}
            className="w-full bg-primary-500 text-white shadow-orange hover:bg-primary-600"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Generating… (~10-30 detik)
              </>
            ) : (
              <>
                <Sparkles className="mr-2 size-4" />
                Generate dengan AI · 10 token
              </>
            )}
          </Button>

          {lastUsage && (
            <div className="rounded-md border border-warm-200 bg-warm-50 p-2 text-[10px] text-warm-600">
              Generasi terakhir:{' '}
              <span className="font-semibold">
                {lastUsage.tokensUsed} token platform
              </span>{' '}
              dipotong · AI: {lastUsage.inputTokens} input tokens,{' '}
              {lastUsage.outputTokens} output tokens
            </div>
          )}

          {description.trim().length < 20 && (
            <p className="text-[10px] text-warm-500">
              Deskripsi minimal 20 karakter — semakin detail semakin baik
              hasilnya.
            </p>
          )}
        </form>
      )}

      <Dialog
        open={Boolean(insufficientInfo)}
        onOpenChange={(o) => !o && setInsufficientInfo(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-primary-500" />
              Saldo Token Tidak Cukup
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2 text-left">
              <span className="block">
                AI Generate butuh saldo token aktif minimal{' '}
                <strong>
                  {insufficientInfo?.minRequired.toLocaleString('id-ID')}
                </strong>{' '}
                token. Saldomu sekarang:{' '}
                <strong>
                  {insufficientInfo?.currentBalance.toLocaleString('id-ID')}
                </strong>
                .
              </span>
              <span className="block">
                Kamu masih bisa buat LP keren tanpa AI dari Hulao — pakai cara ini:
              </span>
              <ol className="ml-5 list-decimal space-y-1 text-sm">
                <li>Klik <strong>Copy Prompt Template</strong> di bawah</li>
                <li>Paste di ChatGPT atau Claude.ai (gratis)</li>
                <li>Copy HTML hasilnya</li>
                <li>Paste di editor Hulao bagian bawah, preview & publish</li>
              </ol>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              variant="default"
              className="w-full justify-start"
              onClick={copyPromptTemplate}
            >
              <Copy className="mr-2 size-4" />
              Copy Prompt Template
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => router.push('/billing')}
            >
              <Gem className="mr-2 size-4" />
              Top Up Token
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => setInsufficientInfo(null)}
            >
              <PenLine className="mr-2 size-4" />
              Lanjut Tanpa AI (Edit HTML Manual)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
