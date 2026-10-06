'use client'

// Orchestrator AI optimization flow:
//   1. Tombol "Optimasi dengan AI" → fetch estimate
//   2. Confirm dialog tampil cost breakdown — user OK → POST /optimize (202)
//   3. Job jalan di BACKGROUND (2-4 menit). Dialog progres boleh ditutup;
//      polling tetap jalan (useOptimizeJob) dan hasil juga tersimpan di
//      Riwayat Saran AI. Reload di tengah proses → polling dilanjutkan.
//   4. Result dialog: suggestions + preview iframe + Apply / Tutup
//   5. Apply → POST /apply → toast sukses + onApplied callback (parent refresh).
//      409 = LP diedit sejak saran dibuat → konfirmasi → ulang dengan force.
//
// Kalau saldo tidak cukup, dialog langsung tampil pesan + tombol top-up.
import { AlertCircle, Loader2, Sparkles, Wand2 } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import {
  isStaleApplyConflict,
  postApplyOptimization,
  STALE_APPLY_DESCRIPTION,
  STALE_APPLY_TITLE,
} from '@/components/lp-lab/apply-optimization'
import { OptimizeResultDialog } from '@/components/lp-lab/OptimizeResultDialog'
import {
  formatElapsed,
  type OptimizationResult,
  useOptimizeJob,
} from '@/components/lp-lab/useOptimizeJob'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchJson } from '@/lib/fetch-json'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface CostEstimate {
  htmlChars: number
  originalHtmlChars?: number
  base64ImagesStripped?: number
  estimatedInputTokens: number
  estimatedOutputTokens: number
  providerCostUsd: number
  providerCostRp: number
  platformTokensCharge: number
  platformChargeRp: number
  modelName?: string
  exceedsContextLimit?: boolean
  contextLimitMessage?: string
}

interface EstimateData {
  estimate: CostEstimate
  currentBalance: number
  sufficientBalance: boolean
  hasAnalytics: boolean
  signalsCount: number
}

interface Envelope<T> {
  success: boolean
  data?: T
}

interface Props {
  lpId: string
  lpSlug: string
  onApplied?: () => void
}

type Step = 'idle' | 'estimating' | 'confirm' | 'result' | 'applying'

export function OptimizeFlow({ lpId, onApplied }: Props) {
  const [step, setStep] = useState<Step>('idle')
  const [estimate, setEstimate] = useState<EstimateData | null>(null)
  const [result, setResult] = useState<OptimizationResult | null>(null)
  // Dialog progres boleh ditutup; ref dipakai callback polling untuk tahu
  // apakah hasil langsung dibuka atau cukup lewat toast "Lihat hasil".
  const [runningOpen, setRunningOpen] = useState(false)
  const runningOpenRef = useRef(false)
  // 409 dari /apply — LP diedit sejak saran dibuat, tunggu konfirmasi user.
  const [confirmStaleApply, setConfirmStaleApply] = useState(false)

  function showRunning(open: boolean) {
    runningOpenRef.current = open
    setRunningOpen(open)
  }

  const job = useOptimizeJob(lpId, {
    onDone: (res) => {
      setResult(res)
      if (runningOpenRef.current) {
        showRunning(false)
        setStep('result')
        return
      }
      toast.success('Optimasi AI selesai', {
        description: 'Saran perbaikan & HTML baru siap direview.',
        duration: 60_000,
        action: { label: 'Lihat hasil', onClick: () => setStep('result') },
      })
    },
    onFailed: (message) => {
      showRunning(false)
      toast.error(message)
    },
    onTimeout: () => {
      showRunning(false)
      toast.info(
        'Optimasi masih diproses lebih lama dari biasanya. Cek hasilnya nanti di Riwayat Saran AI.',
      )
    },
  })
  const jobBusy = job.phase !== 'idle'

  function closeAll() {
    setStep('idle')
    setEstimate(null)
    setResult(null)
  }

  async function startEstimate() {
    setStep('estimating')
    const r = await fetchJson<Envelope<EstimateData>>(
      `/api/lp/${encodeURIComponent(lpId)}/optimize/estimate`,
      { cache: 'no-store' },
      'Gagal hitung estimasi',
    )
    if (!r.ok || !r.data?.data) {
      toast.error(r.error ?? 'Gagal hitung estimasi')
      setStep('idle')
      return
    }
    setEstimate(r.data.data)
    setStep('confirm')
  }

  async function runOptimize() {
    setStep('idle')
    showRunning(true)
    const started = await job.start()
    if (started?.alreadyRunning) {
      toast.info(
        'Optimasi untuk LP ini sudah berjalan — melanjutkan proses yang ada.',
      )
    }
  }

  async function applyOptimization(force = false) {
    if (!result) return
    setStep('applying')
    const r = await postApplyOptimization(lpId, result.optimizationId, force)
    if (isStaleApplyConflict(r)) {
      // LP diedit sejak saran dibuat — minta konfirmasi menimpa.
      setStep('result')
      setConfirmStaleApply(true)
      return
    }
    if (!r.ok) {
      toast.error(r.error ?? 'Gagal apply')
      setStep('result')
      return
    }
    toast.success('LP berhasil di-update dengan saran AI')
    closeAll()
    onApplied?.()
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={jobBusy ? () => showRunning(true) : startEstimate}
        disabled={
          step === 'estimating' ||
          step === 'applying' ||
          job.phase === 'starting'
        }
      >
        {step === 'estimating' || jobBusy ? (
          <Loader2 className="mr-1.5 size-4 animate-spin" />
        ) : (
          <Wand2 className="mr-1.5 size-4" />
        )}
        {job.phase === 'running'
          ? `Optimasi berjalan ${formatElapsed(job.elapsedSec)}`
          : 'Optimasi dengan AI'}
      </Button>

      {/* Confirm dialog — cost breakdown */}
      <Dialog
        open={step === 'confirm'}
        onOpenChange={(o) => {
          if (!o) closeAll()
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              <Sparkles className="text-primary-600 mr-1 inline size-5" />
              Optimasi LP dengan AI
            </DialogTitle>
            <DialogDescription>
              AI akan analisa LP berdasarkan data analytics + chat customer,
              lalu kasih saran perbaikan + HTML versi baru.
            </DialogDescription>
          </DialogHeader>

          {estimate && <EstimateDetails estimate={estimate} />}

          <DialogFooter>
            <Button variant="outline" onClick={closeAll}>
              Batal
            </Button>
            <Button
              onClick={() => void runOptimize()}
              disabled={
                !estimate?.sufficientBalance ||
                estimate?.estimate.exceedsContextLimit
              }
            >
              <Wand2 className="mr-1.5 size-4" />
              Lanjutkan Optimasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RunningDialog
        open={runningOpen && jobBusy}
        onClose={() => showRunning(false)}
        elapsedSec={job.elapsedSec}
        durationLabel={job.durationLabel}
        starting={job.phase === 'starting'}
      />

      <OptimizeResultDialog
        key={result?.optimizationId ?? 'none'}
        open={step === 'result' || step === 'applying'}
        lpId={lpId}
        result={result}
        applying={step === 'applying'}
        onApply={() => void applyOptimization()}
        onDiscard={closeAll}
      />

      <ConfirmDialog
        open={confirmStaleApply}
        onOpenChange={setConfirmStaleApply}
        title={STALE_APPLY_TITLE}
        description={STALE_APPLY_DESCRIPTION}
        confirmLabel="Tetap Apply"
        variant="default"
        onConfirm={() => {
          setConfirmStaleApply(false)
          void applyOptimization(true)
        }}
      />
    </>
  )
}

function RunningDialog({
  open,
  onClose,
  elapsedSec,
  durationLabel,
  starting,
}: {
  open: boolean
  onClose: () => void
  elapsedSec: number
  durationLabel: string | null
  starting: boolean
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Sparkles className="text-primary-600 mr-1 inline size-5" />
            Optimasi LP dengan AI
          </DialogTitle>
          <DialogDescription>
            AI sedang analisa LP & menulis ulang HTML-nya.
          </DialogDescription>
        </DialogHeader>
        <div className="border-border bg-card flex flex-col items-center gap-2 rounded-lg border p-4 text-center">
          <Loader2 className="text-primary-600 size-4 animate-spin" />
          <div className="text-warm-900 text-sm font-medium">
            {starting
              ? 'Memulai optimasi…'
              : 'AI sedang analisa & generate perbaikan…'}
          </div>
          <div className="text-warm-500 text-xs tabular-nums">
            {durationLabel ? `Perkiraan ${durationLabel} · ` : ''}
            berjalan {formatElapsed(elapsedSec)}
          </div>
          <p className="text-warm-600 text-xs">
            Boleh ditutup — proses tetap jalan di server. Hasil juga tersimpan
            di Riwayat Saran AI.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EstimateDetails({ estimate }: { estimate: EstimateData }) {
  return (
    <div className="space-y-3">
      <div className="border-warm-200 bg-warm-50 rounded-lg border p-3 text-sm">
        <div className="text-warm-900 font-semibold">Konteks input AI:</div>
        <ul className="text-warm-700 mt-1 space-y-0.5 text-xs">
          <li>
            • HTML LP saat ini:{' '}
            <strong>
              {(estimate.estimate.htmlChars / 1000).toFixed(1)}K karakter
            </strong>
            {(estimate.estimate.base64ImagesStripped ?? 0) > 0 && (
              <span className="text-warm-500">
                {' '}
                ({estimate.estimate.base64ImagesStripped} gambar base64 di-skip
                dari{' '}
                {((estimate.estimate.originalHtmlChars ?? 0) / 1000).toFixed(0)}
                K char asli)
              </span>
            )}
          </li>
          <li>
            • Customer signals:{' '}
            <strong>
              {estimate.signalsCount > 0
                ? `${estimate.signalsCount} pesan match`
                : 'belum ada'}
            </strong>
          </li>
          <li>
            • Analytics:{' '}
            <strong>
              {estimate.hasAnalytics ? '30 hari terakhir' : 'belum ada visit'}
            </strong>
          </li>
        </ul>
      </div>

      {estimate.estimate.exceedsContextLimit && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border p-3 text-sm',
            TONES.danger.bg,
            TONES.danger.border,
            TONES.danger.text,
          )}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            {estimate.estimate.contextLimitMessage ??
              'LP terlalu besar untuk AI optimization.'}
          </div>
        </div>
      )}

      <div className="border-primary-200 bg-primary-50 rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <div className="text-primary-900 text-sm font-semibold">
            Perkiraan Biaya
          </div>
          {estimate.estimate.modelName && (
            <div className="bg-primary-100 text-primary-800 rounded-full px-2 py-0.5 font-mono text-xs">
              {estimate.estimate.modelName}
            </div>
          )}
        </div>
        <div className="border-border bg-card mt-2 rounded-md border p-2 text-xs">
          <div className="text-warm-500">
            Perkiraan token AI yang akan diproses
          </div>
          <div className="text-warm-900 font-mono text-sm font-bold">
            ~{estimate.estimate.estimatedInputTokens.toLocaleString('id-ID')}{' '}
            input + ~
            {estimate.estimate.estimatedOutputTokens.toLocaleString('id-ID')}{' '}
            output
          </div>
        </div>
        <div className="bg-primary-600 mt-2 rounded-md p-2.5 text-white">
          <div className="text-xs opacity-80">
            Perkiraan token yang akan dipotong:
          </div>
          <div className="font-mono text-lg font-bold">
            ~{estimate.estimate.platformTokensCharge.toLocaleString('id-ID')}{' '}
            token
            <span className="ml-2 text-sm opacity-75">
              (~Rp{' '}
              {Math.round(estimate.estimate.platformChargeRp).toLocaleString(
                'id-ID',
              )}
              )
            </span>
          </div>
        </div>
        <div className="text-primary-800 mt-2 text-xs">
          Saldo kamu sekarang:{' '}
          <strong className="tabular-nums">
            {estimate.currentBalance.toLocaleString('id-ID')}
          </strong>{' '}
          token. Estimasi setelah optimasi:{' '}
          <strong className="tabular-nums">
            ~
            {(
              estimate.currentBalance - estimate.estimate.platformTokensCharge
            ).toLocaleString('id-ID')}
          </strong>{' '}
          token.
        </div>
        <div className="bg-primary-100/60 text-primary-900 mt-2 rounded-md p-2 text-xs leading-relaxed">
          <strong>Catatan:</strong> ini hanya perkiraan. Biaya sesungguhnya
          tergantung panjang prompt + output AI, dan akan ditampilkan setelah
          optimasi selesai. Bisa sedikit lebih besar atau lebih kecil dari
          estimasi.
        </div>
      </div>

      {!estimate.sufficientBalance && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border p-3 text-sm',
            TONES.danger.bg,
            TONES.danger.border,
            TONES.danger.text,
          )}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            Saldo tidak cukup. Top-up dulu sebelum lanjut.
            <Link href="/billing" className="ml-1 font-semibold underline">
              Top-up sekarang →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
