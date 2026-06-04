'use client'

// PostPublishClient — UI 15 status WA pasca-publish LP.
// Flow:
//   1. Mount → kalau belum ada sample, otomatis POST /start untuk generate 3.
//   2. Tampilkan 3 sample full + 12 placeholder (blurred / locked).
//   3. Klik "Buka 12 sisa" → kalau saldo cukup, POST /unlock; kalau kurang,
//      redirect ke /billing dengan ?from=post-publish&lpId=X.
//   4. Setelah unlock sukses, refresh state.
import { CheckCircle2, Copy, Loader2, Lock, Send, Share2, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface PieceBody {
  title?: string
  hook?: string
  body?: string
  cta?: string
  imageHint?: string
}

interface Piece {
  id: string
  title: string
  bodyJson: PieceBody
  funnelStage: string
  isPaid: boolean
  createdAt: string
}

interface PostPublishState {
  briefId: string | null
  pieces: Piece[]
  totalGenerated: number
  totalExpected: number
  isComplete: boolean
}

interface Lp {
  id: string
  title: string
  slug: string
  isPublished: boolean
}

interface Props {
  lp: Lp
  initialState: PostPublishState
  initialBalance: number
}

const FUNNEL_BADGE: Record<string, { label: string; cls: string }> = {
  TOFU: { label: 'Awareness', cls: 'bg-blue-100 text-blue-700' },
  MOFU: { label: 'Consideration', cls: 'bg-amber-100 text-amber-700' },
  BOFU: { label: 'Closing', cls: 'bg-emerald-100 text-emerald-700' },
}

function formatStatusText(piece: Piece, lpUrl: string): string {
  const lines: string[] = []
  if (piece.bodyJson.hook) lines.push(piece.bodyJson.hook)
  if (piece.bodyJson.body) lines.push('', piece.bodyJson.body)
  if (piece.bodyJson.cta) lines.push('', piece.bodyJson.cta)
  // Selalu tambahkan link LP di akhir — itu yang user paste di WA Status.
  lines.push('', lpUrl)
  return lines.join('\n').trim()
}

export function PostPublishClient({ lp, initialState, initialBalance }: Props) {
  const [state, setState] = useState(initialState)
  const [balance, setBalance] = useState(initialBalance)
  const [generatingSamples, setGeneratingSamples] = useState(false)
  const [unlocking, setUnlocking] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const lpUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/p/${lp.slug}`
      : `/p/${lp.slug}`

  // Auto-trigger generate samples kalau belum ada.
  useEffect(() => {
    if (state.totalGenerated >= 3) return
    void triggerSampleGenerate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Saat user mendarat dari flow top-up sukses (?paid=1), kasih pengakuan +
  // bersihkan intent supaya tidak tampil berulang. URL juga dirapikan.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (url.searchParams.get('paid') !== '1') return
    toast.success('Saldo masuk! Ayo generate 15 status WA.', { duration: 5000 })
    try {
      window.sessionStorage.removeItem('hulao:postPublishReturn')
    } catch {
      /* abaikan */
    }
    url.searchParams.delete('paid')
    window.history.replaceState({}, '', url.toString())
  }, [])

  async function triggerSampleGenerate() {
    if (generatingSamples) return
    setGeneratingSamples(true)
    try {
      const res = await fetch(`/api/content/post-publish/${lp.id}/start`, {
        method: 'POST',
      })
      const json = (await res.json()) as {
        success: boolean
        data?: { state: PostPublishState }
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal generate 3 sample')
        return
      }
      setState(json.data.state)
    } catch (err) {
      console.error('[trigger sample]', err)
      toast.error('Koneksi gagal. Refresh halaman ya.')
    } finally {
      setGeneratingSamples(false)
    }
  }

  async function handleUnlock() {
    if (unlocking) return
    // Estimasi cost untuk 12 status (12 × ±300 token rata-rata).
    // Kalau saldo jelas kurang, langsung lempar ke /billing.
    const ESTIMATE_TOKENS = 12 * 350
    if (balance < ESTIMATE_TOKENS) {
      toast.info('Saldo kurang. Top-up dulu yuk.')
      // Redirect ke billing dengan info konteks.
      window.location.href = `/billing?from=post-publish&lpId=${lp.id}`
      return
    }
    setUnlocking(true)
    try {
      const res = await fetch(`/api/content/post-publish/${lp.id}/unlock`, {
        method: 'POST',
      })
      const json = (await res.json()) as {
        success: boolean
        data?: {
          state: PostPublishState
          generatedCount: number
          totalTokensCharged: number
        }
        error?: string
        message?: string
        tokensRequired?: number
      }

      if (res.status === 402 && json.error === 'INSUFFICIENT_BALANCE') {
        toast.error(json.message || 'Saldo tidak cukup. Top-up dulu.')
        window.location.href = `/billing?from=post-publish&lpId=${lp.id}`
        return
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal generate 12 sisa')
        return
      }
      setState(json.data.state)
      setBalance((b) => b - json.data!.totalTokensCharged)
      toast.success(
        `${json.data.generatedCount} status berhasil dibuat (potong ${json.data.totalTokensCharged.toLocaleString('id-ID')} token).`,
      )
    } catch (err) {
      console.error('[unlock]', err)
      toast.error('Koneksi gagal. Coba lagi.')
    } finally {
      setUnlocking(false)
    }
  }

  async function copyAndOpenWa(piece: Piece) {
    const text = formatStatusText(piece, lpUrl)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(piece.id)
      setTimeout(() => setCopiedId(null), 3000)
      toast.success(
        'Teks sudah disalin. Buka WhatsApp → Status → tahan untuk paste.',
      )
      // Buka WA via deeplink — di mobile akan open app, di desktop open WA Web.
      window.open('https://wa.me/', '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Gagal salin. Select teks manual lalu copy.')
    }
  }

  function shareLpToWa() {
    const text = `${lp.title}\n\n${lpUrl}`
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const samplesReady = state.pieces.filter((p) => !p.isPaid)
  const unlockedPieces = state.pieces.filter((p) => p.isPaid)
  const lockedCount = Math.max(
    0,
    state.totalExpected - state.totalGenerated,
  )

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 overflow-y-auto p-4 md:p-6">
      {/* Header hero */}
      <Card className="overflow-hidden rounded-2xl border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50">
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />
              <span className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
                LP Live & Siap Jualan
              </span>
            </div>
            <h1 className="font-display text-2xl font-extrabold text-warm-900 md:text-3xl">
              {lp.title}
            </h1>
            <Link
              href={lpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm font-mono text-warm-600 hover:text-primary-600"
            >
              {lpUrl} ↗
            </Link>
            <p className="mt-3 max-w-xl text-sm text-warm-600">
              Tinggal datengin pembeli. Saya buatkan{' '}
              <strong>15 status WhatsApp siap pakai</strong> dari LP kamu —
              tinggal salin, buka WA, posting di Status. Pengunjung tahu produk
              kamu dalam hitungan jam, bukan minggu.
            </p>
          </div>
          <div className="flex flex-col gap-2 md:w-52">
            <Button
              onClick={shareLpToWa}
              size="lg"
              className="rounded-full bg-emerald-500 font-semibold text-white shadow-md hover:bg-emerald-600"
            >
              <Share2 className="mr-2 size-4" />
              Bagikan LP ke WA
            </Button>
            <Link
              href={lpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-warm-300 bg-card px-4 py-2 text-center text-xs font-semibold text-warm-700 hover:bg-warm-50"
            >
              Lihat LP →
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Progress + unlock CTA */}
      <div className="rounded-xl border border-warm-200 bg-card p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="font-display text-lg font-bold text-warm-900">
              {state.totalGenerated} dari {state.totalExpected} status siap
            </div>
            <p className="text-xs text-warm-500">
              {state.totalGenerated < 3 && 'Lagi disiapkan… (~30 detik untuk 3 sample)'}
              {state.totalGenerated >= 3 && state.totalGenerated < 15 &&
                `${samplesReady.length} sample gratis dari Hulao. ${lockedCount} sisa terkunci.`}
              {state.totalGenerated >= 15 && 'Semua status sudah siap. Tinggal posting harian.'}
            </p>
          </div>
          {state.totalGenerated >= 3 && state.totalGenerated < 15 && (
            <Button
              onClick={handleUnlock}
              disabled={unlocking}
              size="lg"
              className="rounded-full bg-primary-500 font-semibold text-white shadow-orange hover:bg-primary-600"
            >
              {unlocking ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Membuka {lockedCount} sisa…
                </>
              ) : (
                <>
                  <Lock className="mr-2 size-4" />
                  Buka {lockedCount} status sisa
                </>
              )}
            </Button>
          )}
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-warm-100">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-primary-500 transition-all duration-500"
            style={{
              width: `${Math.min(100, (state.totalGenerated / state.totalExpected) * 100)}%`,
            }}
          />
        </div>
      </div>

      {/* Loading state untuk 3 sample */}
      {generatingSamples && state.totalGenerated === 0 && (
        <Card className="rounded-xl border-warm-200">
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="size-8 animate-spin text-primary-500" />
            <p className="text-sm font-medium text-warm-700">
              AI lagi nulis 3 sample status WA dari LP kamu…
            </p>
            <p className="text-xs text-warm-500">
              Ini gratis dari Hulao. ~30 detik.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Grid status cards */}
      {state.totalGenerated > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {state.pieces.map((piece, idx) => (
            <StatusCard
              key={piece.id}
              piece={piece}
              index={idx}
              copied={copiedId === piece.id}
              onCopy={() => copyAndOpenWa(piece)}
            />
          ))}

          {/* Placeholder locked cards */}
          {Array.from({ length: lockedCount }).map((_, i) => (
            <LockedCard
              key={`locked-${i}`}
              index={state.totalGenerated + i}
              onClick={handleUnlock}
            />
          ))}
        </div>
      )}

      {/* Footer tips */}
      <div className="rounded-xl border border-warm-200 bg-warm-50/40 p-4">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary-500" />
          <div className="text-sm text-warm-700">
            <p className="font-semibold">Tips bikin status convert:</p>
            <ul className="mt-1.5 space-y-1 text-xs text-warm-600">
              <li>· Posting 2-3 status sehari, bukan sekaligus 15</li>
              <li>· Pilih jam sibuk WA: 07-09, 12-13, 19-22</li>
              <li>· Selingi dengan foto produk, jangan teks doang</li>
              <li>· Setelah ada chat masuk → balas cepat (max 5 menit)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatusCard({
  piece,
  index,
  copied,
  onCopy,
}: {
  piece: Piece
  index: number
  copied: boolean
  onCopy: () => void
}) {
  const badge = FUNNEL_BADGE[piece.funnelStage] ?? FUNNEL_BADGE.TOFU
  return (
    <Card
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border-warm-200 transition-shadow hover:shadow-md',
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-100 font-mono text-xs font-bold text-primary-700">
            {index + 1}
          </span>
          <CardTitle className="text-sm font-semibold text-warm-900 line-clamp-1">
            {piece.title}
          </CardTitle>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
            badge.cls,
          )}
        >
          {badge.label}
        </span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="rounded-lg border border-warm-200 bg-warm-50/40 p-3 text-sm">
          {piece.bodyJson.hook && (
            <p className="font-semibold text-warm-900">{piece.bodyJson.hook}</p>
          )}
          {piece.bodyJson.body && (
            <p className="mt-2 whitespace-pre-line text-warm-700">
              {piece.bodyJson.body}
            </p>
          )}
          {piece.bodyJson.cta && (
            <p className="mt-2 text-warm-600 italic">{piece.bodyJson.cta}</p>
          )}
        </div>
        <Button
          onClick={onCopy}
          size="sm"
          className={cn(
            'mt-auto w-full rounded-full font-semibold transition-colors',
            copied
              ? 'bg-emerald-500 text-white hover:bg-emerald-600'
              : 'bg-primary-500 text-white hover:bg-primary-600',
          )}
        >
          {copied ? (
            <>
              <CheckCircle2 className="mr-2 size-4" />
              Tersalin · buka WA
            </>
          ) : (
            <>
              <Send className="mr-2 size-4" />
              Salin & Buka WA
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}

function LockedCard({ index, onClick }: { index: number; onClick: () => void }) {
  return (
    <Card className="relative flex cursor-pointer flex-col overflow-hidden rounded-xl border-2 border-dashed border-warm-300 bg-warm-50/40 transition-all hover:border-primary-300 hover:bg-warm-50/60"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-warm-200 font-mono text-xs font-bold text-warm-600">
            {index + 1}
          </span>
          <CardTitle className="text-sm font-semibold text-warm-500">
            Status #{index + 1}
          </CardTitle>
        </div>
        <Lock className="size-4 text-warm-400" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-warm-300 bg-card/60 p-4 text-center">
          <div className="space-y-1.5">
            <div className="mx-auto h-3 w-32 rounded bg-warm-200/70" />
            <div className="mx-auto h-2.5 w-40 rounded bg-warm-200/60" />
            <div className="mx-auto h-2.5 w-28 rounded bg-warm-200/60" />
          </div>
          <p className="mt-2 text-[11px] text-warm-500">Klik untuk buka</p>
        </div>
      </CardContent>
    </Card>
  )
}
