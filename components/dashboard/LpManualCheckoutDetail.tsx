'use client'

// Detail checkout transfer manual untuk upgrade LP. Mirip ManualCheckoutDetail
// tapi info section khusus paket LP (tier, maxLp, storage) — bukan token.
import type { LpTier, ManualPaymentStatus } from '@prisma/client'
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  Globe,
  HardDrive,
  Layers,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import {
  buildLpUpgradeConfirmMessage,
  WaConfirmButton,
} from '@/components/shared/WaConfirmButton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { formatNumber, formatRupiah } from '@/lib/format'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

interface BankAccount {
  id: string
  bankName: string
  accountNumber: string
  accountName: string
}

interface LpPaymentData {
  id: string
  amount: number
  uniqueCode: number
  totalAmount: number
  status: ManualPaymentStatus
  proofUrl: string | null
  proofNote: string | null
  rejectionReason: string | null
  createdAt: string
  expiresAt: string
  package: {
    name: string
    tier: LpTier
    maxLp: number
    maxStorageMB: number
  }
}

interface Props {
  payment: LpPaymentData
  banks: BankAccount[]
  user: { name: string | null; email: string }
}

const STATUS_LABEL: Record<ManualPaymentStatus, string> = {
  PENDING: 'Menunggu Verifikasi',
  CONFIRMED: 'Dikonfirmasi',
  REJECTED: 'Ditolak',
}

const STATUS_VARIANT: Record<
  ManualPaymentStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  PENDING: 'secondary',
  CONFIRMED: 'default',
  REJECTED: 'destructive',
}

function useCountdown(expiresAt: string) {
  const target = useMemo(() => new Date(expiresAt).getTime(), [expiresAt])
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const remaining = Math.max(0, target - now)
  const h = Math.floor(remaining / 3_600_000)
  const m = Math.floor((remaining % 3_600_000) / 60_000)
  const s = Math.floor((remaining % 60_000) / 1000)
  return {
    expired: remaining === 0,
    text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`,
  }
}

export function LpManualCheckoutDetail({ payment, banks, user }: Props) {
  const router = useRouter()
  const { expired, text: countdownText } = useCountdown(payment.expiresAt)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [isUploading, setUploading] = useState(false)

  const StatusIcon =
    payment.status === 'CONFIRMED'
      ? CheckCircle2
      : payment.status === 'REJECTED'
        ? XCircle
        : Clock

  function copy(value: string, label: string) {
    void navigator.clipboard.writeText(value)
    toast.success(`${label} disalin`)
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) {
      toast.error('Pilih file bukti transfer dulu')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (note.trim()) fd.append('note', note.trim())
      const res = await fetch(`/api/payment/manual/${payment.id}/proof`, {
        method: 'POST',
        body: fd,
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal mengupload bukti')
        return
      }
      toast.success('Bukti transfer terkirim, menunggu verifikasi admin.')
      setFile(null)
      router.refresh()
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setUploading(false)
    }
  }

  const canUploadOrReplace = payment.status === 'PENDING' && !expired
  const lpLabel =
    payment.package.maxLp >= 999
      ? 'Unlimited LP'
      : `${formatNumber(payment.package.maxLp)} LP`

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-warm-500 text-xs font-medium tracking-wider uppercase">
                Order LP Upgrade #{payment.id.slice(-8).toUpperCase()}
              </div>
              <div className="font-display text-warm-900 mt-1 text-lg font-bold">
                Paket LP {payment.package.name}
              </div>
              <div className="text-warm-600 mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="bg-warm-100 rounded px-2 py-0.5 font-mono font-semibold">
                  {payment.package.tier}
                </span>
                <span className="flex items-center gap-1">
                  <Layers className="size-3" /> {lpLabel}
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive className="size-3" />{' '}
                  {payment.package.maxStorageMB} MB
                </span>
              </div>
            </div>
            <Badge
              variant={STATUS_VARIANT[payment.status]}
              className="flex items-center gap-1.5"
            >
              <StatusIcon className="size-3.5" />
              {STATUS_LABEL[payment.status]}
            </Badge>
          </div>

          {payment.status === 'PENDING' && (
            <div
              className={cn(
                'flex items-center justify-between rounded-lg border p-3 text-sm',
                TONES.warning.border,
                TONES.warning.bg,
                TONES.warning.text,
              )}
            >
              <div className="flex items-center gap-2">
                <Clock className="size-4" />
                <span>Sisa waktu transfer</span>
              </div>
              <span className="font-mono text-base font-bold tabular-nums">
                {expired ? 'Expired' : countdownText}
              </span>
            </div>
          )}

          <div className="border-primary-300 bg-primary-50/50 rounded-lg border-2 border-dashed p-4">
            <div className="text-primary-700 text-xs font-medium tracking-wider uppercase">
              Total Transfer (TEPAT)
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <div className="font-display text-primary-700 text-3xl font-bold tabular-nums">
                {formatRupiah(payment.totalAmount)}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-primary-600 hover:bg-primary-100 hover:text-primary-700"
                onClick={() =>
                  copy(String(payment.totalAmount), 'Nominal transfer')
                }
              >
                <Copy className="mr-1.5 size-3.5" />
                Salin
              </Button>
            </div>
            <p className="text-warm-700 mt-2 text-xs">
              Termasuk <span className="font-semibold">3 digit kode unik</span>{' '}
              <span className="bg-card text-primary-700 rounded px-1.5 py-0.5 font-mono font-semibold">
                {payment.uniqueCode}
              </span>{' '}
              untuk identifikasi otomatis. Transfer{' '}
              <span className="font-semibold">
                tepat sebesar nominal di atas
              </span>
              .
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-warm-500">Harga paket</span>
              <span className="font-medium tabular-nums">
                {formatRupiah(payment.amount)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-warm-500">Kode unik</span>
              <span className="font-mono font-medium">
                +{payment.uniqueCode}
              </span>
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between text-base">
              <span className="text-warm-700 font-medium">Total</span>
              <span className="font-display text-warm-900 text-lg font-bold tabular-nums">
                {formatRupiah(payment.totalAmount)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="font-display text-warm-900 mb-3 text-base font-semibold">
          Transfer ke salah satu rekening berikut
        </h2>
        {banks.length === 0 ? (
          <Card>
            <CardContent className="text-destructive flex items-center gap-2 p-4 text-sm">
              <AlertCircle className="size-4" />
              Belum ada rekening aktif. Hubungi admin.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {banks.map((b) => (
              <Card key={b.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    <div className="bg-primary-50 text-primary-600 flex size-8 items-center justify-center rounded-md">
                      <Building2 className="size-4" />
                    </div>
                    <div className="font-display text-warm-900 font-semibold">
                      {b.bankName}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-warm-800 font-mono text-base font-semibold tracking-wider">
                      {b.accountNumber}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => copy(b.accountNumber, 'Nomor rekening')}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                  <div className="text-warm-500 text-xs">
                    a.n. {b.accountName}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {payment.status === 'REJECTED' && payment.rejectionReason && (
        <Card className={TONES.danger.bg}>
          <CardContent className="space-y-1 p-4 text-sm">
            <div className="text-destructive flex items-center gap-2 font-semibold">
              <XCircle className="size-4" />
              Pembayaran Ditolak
            </div>
            <div className="text-warm-700">{payment.rejectionReason}</div>
          </CardContent>
        </Card>
      )}

      {payment.status === 'CONFIRMED' && (
        <Card className={TONES.success.bg}>
          <CardContent
            className={cn(
              'flex items-center gap-2 p-4 text-sm',
              TONES.success.text,
            )}
          >
            <Globe className="size-4" />
            Pembayaran sudah dikonfirmasi — kuota LP kamu sudah di-upgrade ke{' '}
            {payment.package.tier}.
          </CardContent>
        </Card>
      )}

      {payment.proofUrl && (
        <div>
          <h2 className="font-display text-warm-900 mb-2 text-base font-semibold">
            Bukti transfer yang sudah diupload
          </h2>
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="border-warm-200 bg-warm-50 relative h-72 w-full overflow-hidden rounded-lg border">
                <Image
                  src={payment.proofUrl}
                  alt="Bukti transfer"
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
              {payment.proofNote && (
                <p className="text-warm-500 text-xs">
                  Catatan kamu: {payment.proofNote}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {canUploadOrReplace && (
        <form onSubmit={handleUpload} className="space-y-4">
          <h2 className="font-display text-warm-900 text-base font-semibold">
            {payment.proofUrl ? 'Upload ulang bukti' : 'Upload bukti transfer'}
          </h2>
          <div className="space-y-2">
            <Label htmlFor="proof-file">
              File bukti (JPG/PNG/WebP, max 2 MB)
            </Label>
            <Input
              id="proof-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proof-note">Catatan (opsional)</Label>
            <Textarea
              id="proof-note"
              rows={3}
              placeholder="Misal: transfer dari rekening Mandiri pribadi"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="submit" disabled={isUploading || !file} size="lg">
              {isUploading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Upload className="mr-2 size-4" />
              )}
              Upload Bukti Transfer
            </Button>
            <WaConfirmButton
              message={buildLpUpgradeConfirmMessage({
                packageName: payment.package.name,
                tier: payment.package.tier,
                maxLp: payment.package.maxLp,
                maxStorageMB: payment.package.maxStorageMB,
                userName: user.name,
                userEmail: user.email,
                totalAmount: payment.totalAmount,
                uniqueCode: payment.uniqueCode,
                hasProof: Boolean(payment.proofUrl),
              })}
              helperText="Kamu juga bisa kirim bukti transfer langsung via WA"
            />
          </div>
        </form>
      )}

      {expired && payment.status === 'PENDING' && (
        <Card className={TONES.neutral.bg}>
          <CardContent className="text-warm-700 p-4 text-sm">
            Order ini sudah expired (lewat 24 jam). Silakan buat order baru dari
            halaman Upgrade LP.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
