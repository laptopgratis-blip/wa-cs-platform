'use client'

// PostPublishClient — UI 15 status WA pasca-publish LP.
// Flow:
//   1. Mount → kalau belum ada sample, otomatis POST /start untuk generate 3.
//   2. Tampilkan 3 sample full + 12 placeholder (blurred / locked).
//   3. Klik "Buka 12 sisa" → kalau saldo cukup, POST /unlock; kalau kurang,
//      redirect ke /billing dengan ?from=post-publish&lpId=X.
//   4. Setelah unlock sukses, refresh state.
import {
  CheckCircle2,
  Copy,
  Loader2,
  Lock,
  Send,
  Share2,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { PageContainer } from '@/components/shared/PageContainer'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { StatusMeta } from '@/lib/status'
import { TONES } from '@/lib/ui-tones'
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

// Label lokal (istilah funnel versi post-publish) + tone dari registry.
const FUNNEL_BADGE: Record<string, StatusMeta> = {
  TOFU: { label: 'Awareness', tone: 'info' },
  MOFU: { label: 'Consideration', tone: 'warning' },
  BOFU: { label: 'Closing', tone: 'success' },
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
  const lockedCount = Math.max(0, state.totalExpected - state.totalGenerated)

  return (
    <PageContainer width="default">
      {/* Header hero */}
      <Card className={cn('overflow-hidden', TONES.success.bg)}>
        <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <div className="mb-1 flex items-center gap-2">
              <CheckCircle2 className={cn('size-5', TONES.success.text)} />
              <span
                className={cn(
                  'text-sm font-semibold tracking-wider uppercase',
                  TONES.success.text,
                )}
              >
                LP Live & Siap Jualan
              </span>
            </div>
            <h1 className="font-display text-warm-900 text-2xl font-bold tracking-tight md:text-3xl">
              {lp.title}
            </h1>
            <Link
              href={lpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-warm-600 hover:text-primary-600 mt-1 inline-flex items-center gap-1 font-mono text-sm"
            >
              {lpUrl} ↗
            </Link>
            <p className="text-warm-600 mt-3 max-w-xl text-sm">
              Tinggal datengin pembeli. Saya buatkan{' '}
              <strong>15 status WhatsApp siap pakai</strong> dari LP kamu —
              tinggal salin, buka WA, posting di Status. Pengunjung tahu produk
              kamu dalam hitungan jam, bukan minggu.
            </p>
          </div>
          <div className="flex flex-col gap-2 md:w-52">
            <Button onClick={shareLpToWa} size="lg" variant="outline">
              <Share2 className="mr-2 size-4" />
              Bagikan LP ke WA
            </Button>
            <Link
              href={lpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="border-warm-300 bg-card text-warm-700 hover:bg-warm-50 rounded-lg border px-4 py-2 text-center text-xs font-semibold"
            >
              Lihat LP →
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Progress + unlock CTA */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-display text-warm-900 text-lg font-semibold">
                {state.totalGenerated} dari {state.totalExpected} status siap
              </div>
              <p className="text-warm-500 text-xs">
                {state.totalGenerated < 3 &&
                  'Lagi disiapkan… (~30 detik untuk 3 sample)'}
                {state.totalGenerated >= 3 &&
                  state.totalGenerated < 15 &&
                  `${samplesReady.length} sample gratis dari Hulao. ${lockedCount} sisa terkunci.`}
                {state.totalGenerated >= 15 &&
                  'Semua status sudah siap. Tinggal posting harian.'}
              </p>
            </div>
            {state.totalGenerated >= 3 && state.totalGenerated < 15 && (
              <Button onClick={handleUnlock} disabled={unlocking} size="lg">
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
          <div className="bg-warm-100 mt-3 h-2 overflow-hidden rounded-full">
            <div
              className="from-primary-400 to-primary-600 h-full bg-linear-to-r transition-all duration-500"
              style={{
                width: `${Math.min(100, (state.totalGenerated / state.totalExpected) * 100)}%`,
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Loading state untuk 3 sample */}
      {generatingSamples && state.totalGenerated === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="text-primary-500 size-8 animate-spin" />
            <p className="text-warm-700 text-sm font-medium">
              AI lagi nulis 3 sample status WA dari LP kamu…
            </p>
            <p className="text-warm-500 text-xs">
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
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-2.5">
            <Sparkles className="text-primary-500 mt-0.5 size-4 shrink-0" />
            <div className="text-warm-700 text-sm">
              <p className="font-semibold">Tips bikin status convert:</p>
              <ul className="text-warm-600 mt-1.5 space-y-1 text-xs">
                <li>· Posting 2-3 status sehari, bukan sekaligus 15</li>
                <li>· Pilih jam sibuk WA: 07-09, 12-13, 19-22</li>
                <li>· Selingi dengan foto produk, jangan teks doang</li>
                <li>· Setelah ada chat masuk → balas cepat (max 5 menit)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
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
    <Card className="flex flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <span className="bg-primary-100 text-primary-700 flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold">
            {index + 1}
          </span>
          <CardTitle className="text-warm-900 line-clamp-1 text-sm font-semibold">
            {piece.title}
          </CardTitle>
        </div>
        <StatusBadge
          tone={badge.tone}
          label={badge.label}
          className="shrink-0"
        />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="border-warm-200 bg-warm-50/40 rounded-lg border p-3 text-sm">
          {piece.bodyJson.hook && (
            <p className="text-warm-900 font-semibold">{piece.bodyJson.hook}</p>
          )}
          {piece.bodyJson.body && (
            <p className="text-warm-700 mt-2 whitespace-pre-line">
              {piece.bodyJson.body}
            </p>
          )}
          {piece.bodyJson.cta && (
            <p className="text-warm-600 mt-2 italic">{piece.bodyJson.cta}</p>
          )}
        </div>
        <Button
          onClick={onCopy}
          size="sm"
          className={cn('mt-auto w-full', copied && TONES.success.solid)}
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

function LockedCard({
  index,
  onClick,
}: {
  index: number
  onClick: () => void
}) {
  return (
    <Card
      className="bg-warm-50/40 hover:bg-warm-50/60 relative flex cursor-pointer flex-col overflow-hidden transition-all"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="flex items-center gap-2">
          <span className="bg-warm-200 text-warm-600 flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold">
            {index + 1}
          </span>
          <CardTitle className="text-warm-500 text-sm font-semibold">
            Status #{index + 1}
          </CardTitle>
        </div>
        <Lock className="text-warm-400 size-4" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="border-warm-300 bg-card/60 flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-center">
          <div className="space-y-1.5">
            <div className="bg-warm-200/70 mx-auto h-3 w-32 rounded" />
            <div className="bg-warm-200/60 mx-auto h-2.5 w-40 rounded" />
            <div className="bg-warm-200/60 mx-auto h-2.5 w-28 rounded" />
          </div>
          <p className="text-warm-500 mt-2 text-xs">Klik untuk buka</p>
        </div>
      </CardContent>
    </Card>
  )
}
