'use client'

// /upgrade — checkout flow 3 step:
// Step 1: Konfirmasi pilihan (durasi, breakdown harga)
// Step 2: Pilih payment method (Tripay / Manual Transfer)
// Step 3: Instruksi pembayaran
//
// Polling Tripay status setiap 5 detik. Manual transfer: form upload bukti.
import type { LpTier } from '@prisma/client'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Copy,
  CreditCard,
  Loader2,
  Upload,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  DURATION_DISCOUNTS,
  calculateSubscriptionPrice,
} from '@/lib/subscription-pricing'
import { cn } from '@/lib/utils'

interface Pkg {
  id: string
  name: string
  tier: LpTier
  description: string | null
  maxLp: number
  maxStorageMB: number
  priceMonthly: number
}

interface BankAccount {
  bankName: string
  accountNumber: string
  accountName: string
}

interface Props {
  pkg: Pkg
  initialDuration: number
  bankAccount: BankAccount | null
}

// Tripay channels yg umum dipakai customer Indonesia. Subset dari list lengkap
// supaya UI tidak overwhelming.
const POPULAR_CHANNELS = [
  { code: 'BCAVA', name: 'BCA Virtual Account' },
  { code: 'BNIVA', name: 'BNI Virtual Account' },
  { code: 'BRIVA', name: 'BRI Virtual Account' },
  { code: 'MANDIRIVA', name: 'Mandiri Virtual Account' },
  { code: 'QRIS', name: 'QRIS' },
  { code: 'OVO', name: 'OVO' },
  { code: 'DANA', name: 'DANA' },
  { code: 'SHOPEEPAY', name: 'ShopeePay' },
]

interface CheckoutResult {
  subscriptionId: string
  invoiceId: string
  invoiceNumber: string
  paymentMethod: 'TRIPAY' | 'MANUAL_TRANSFER'
  paymentUrl?: string
  payCode?: string | null
  paymentName?: string
  amount: number
  uniqueCode?: number
  bank?: BankAccount | null
  expiresAt: string
  instructions?: string
}

type Step = 'confirm' | 'payment' | 'instructions'

export function UpgradeView({ pkg, initialDuration, bankAccount }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('confirm')
  const [duration, setDuration] = useState(initialDuration)
  const [paymentMethod, setPaymentMethod] =
    useState<'TRIPAY' | 'MANUAL_TRANSFER'>('TRIPAY')
  const [tripayChannel, setTripayChannel] = useState('QRIS')
  const [isSubmitting, setSubmitting] = useState(false)
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null)

  const calc = calculateSubscriptionPrice(pkg.priceMonthly, duration)
  const durationConfig = DURATION_DISCOUNTS.find((d) => d.months === duration)

  async function startCheckout() {
    setSubmitting(true)
    try {
      const res = await fetch('/api/subscription/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lpPackageId: pkg.id,
          durationMonths: duration,
          paymentMethod,
          tripayChannel:
            paymentMethod === 'TRIPAY' ? tripayChannel : undefined,
        }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: CheckoutResult
        error?: string
      }
      if (!res.ok || !json.success || !json.data) {
        toast.error(json.error || 'Gagal membuat invoice')
        return
      }
      setCheckout(json.data)
      setStep('instructions')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-extrabold">
          Upgrade ke {pkg.name}
        </h1>
        <StepIndicator current={step} />
      </header>

      {step === 'confirm' && (
        <ConfirmStep
          pkg={pkg}
          duration={duration}
          setDuration={setDuration}
          calc={calc}
          discountPct={durationConfig?.discountPct ?? 0}
          onNext={() => setStep('payment')}
        />
      )}

      {step === 'payment' && (
        <PaymentStep
          paymentMethod={paymentMethod}
          setPaymentMethod={setPaymentMethod}
          tripayChannel={tripayChannel}
          setTripayChannel={setTripayChannel}
          bankAccount={bankAccount}
          isSubmitting={isSubmitting}
          onBack={() => setStep('confirm')}
          onSubmit={startCheckout}
        />
      )}

      {step === 'instructions' && checkout && (
        <InstructionsStep
          checkout={checkout}
          onPaid={() => router.push('/billing/subscription')}
        />
      )}
    </div>
  )
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'confirm', label: 'Konfirmasi' },
    { id: 'payment', label: 'Pembayaran' },
    { id: 'instructions', label: 'Bayar' },
  ]
  return (
    <div className="flex items-center gap-1 text-xs">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-1">
          <span
            className={cn(
              'rounded-full px-2 py-1 font-medium',
              current === s.id
                ? 'bg-primary-500 text-white'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {i + 1}. {s.label}
          </span>
          {i < steps.length - 1 && (
            <ArrowRight className="size-3 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  )
}

function ConfirmStep({
  pkg,
  duration,
  setDuration,
  calc,
  discountPct,
  onNext,
}: {
  pkg: Pkg
  duration: number
  setDuration: (n: number) => void
  calc: ReturnType<typeof calculateSubscriptionPrice>
  discountPct: number
  onNext: () => void
}) {
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Plan dipilih</p>
          <p className="font-display text-xl font-bold">
            {pkg.name}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              ({pkg.maxLp >= 999 ? 'Unlimited' : pkg.maxLp} LP ·{' '}
              {pkg.maxStorageMB} MB storage)
            </span>
          </p>
        </div>

        <div className="space-y-2">
          <Label>Durasi</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DURATION_DISCOUNTS.map((d) => (
              <button
                key={d.months}
                type="button"
                onClick={() => setDuration(d.months)}
                className={cn(
                  'rounded-lg border p-3 text-center text-sm transition-colors',
                  duration === d.months
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-border hover:border-primary-500/50',
                )}
              >
                <div className="font-medium">{d.label}</div>
                {d.discountPct > 0 && (
                  <div className="text-[10px] text-amber-600">
                    Hemat {d.discountPct}%
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4 font-mono text-sm">
          <Row
            label={`Plan ${pkg.name} × ${duration} bulan`}
            value={`Rp ${calc.priceBase.toLocaleString('id-ID')}`}
          />
          {discountPct > 0 && (
            <Row
              label={`Diskon ${discountPct}%`}
              value={`-Rp ${calc.discountAmount.toLocaleString('id-ID')}`}
              negative
            />
          )}
          <hr className="my-2 border-border" />
          <Row
            label="Total"
            value={`Rp ${calc.priceFinal.toLocaleString('id-ID')}`}
            bold
          />
        </div>

        <Button onClick={onNext} className="w-full">
          Lanjut ke Pembayaran
          <ArrowRight className="ml-2 size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  bold,
  negative,
}: {
  label: string
  value: string
  bold?: boolean
  negative?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn(bold && 'font-bold')}>{label}</span>
      <span
        className={cn(
          bold && 'font-bold',
          negative && 'text-emerald-600',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function PaymentStep({
  paymentMethod,
  setPaymentMethod,
  tripayChannel,
  setTripayChannel,
  bankAccount,
  isSubmitting,
  onBack,
  onSubmit,
}: {
  paymentMethod: 'TRIPAY' | 'MANUAL_TRANSFER'
  setPaymentMethod: (m: 'TRIPAY' | 'MANUAL_TRANSFER') => void
  tripayChannel: string
  setTripayChannel: (c: string) => void
  bankAccount: BankAccount | null
  isSubmitting: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  return (
    <Card>
      <CardContent className="space-y-5 p-6">
        <Tabs
          value={paymentMethod}
          onValueChange={(v) => setPaymentMethod(v as typeof paymentMethod)}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="TRIPAY">
              <CreditCard className="mr-2 size-4" />
              Online (Tripay)
            </TabsTrigger>
            <TabsTrigger value="MANUAL_TRANSFER">
              <Building2 className="mr-2 size-4" />
              Transfer Manual
            </TabsTrigger>
          </TabsList>

          <TabsContent value="TRIPAY" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              Bayar otomatis via VA bank, QRIS, atau e-wallet. Status
              langsung ter-update di akun setelah bayar.
            </p>
            <Label>Pilih channel</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {POPULAR_CHANNELS.map((ch) => (
                <button
                  key={ch.code}
                  type="button"
                  onClick={() => setTripayChannel(ch.code)}
                  className={cn(
                    'rounded-lg border p-3 text-left text-sm transition-colors',
                    tripayChannel === ch.code
                      ? 'border-primary-500 bg-primary-500/10'
                      : 'border-border hover:border-primary-500/50',
                  )}
                >
                  {ch.name}
                </button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="MANUAL_TRANSFER" className="space-y-3 pt-4">
            <p className="text-sm text-muted-foreground">
              Transfer ke rekening Hulao, lalu upload bukti transfer. Admin
              akan konfirmasi maksimal 1×24 jam.
            </p>
            {bankAccount ? (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm">
                <div>
                  <strong>{bankAccount.bankName}</strong>
                </div>
                <div className="mt-1 font-mono">
                  {bankAccount.accountNumber}
                </div>
                <div className="text-muted-foreground">
                  a/n {bankAccount.accountName}
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Belum ada rekening bank aktif. Hubungi admin atau pilih
                Tripay.
              </p>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            Kembali
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              isSubmitting ||
              (paymentMethod === 'MANUAL_TRANSFER' && !bankAccount)
            }
            className="flex-1"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Memproses...
              </>
            ) : (
              'Lanjut ke Pembayaran'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function InstructionsStep({
  checkout,
  onPaid,
}: {
  checkout: CheckoutResult
  onPaid: () => void
}) {
  if (checkout.paymentMethod === 'TRIPAY') {
    return <TripayInstructions checkout={checkout} onPaid={onPaid} />
  }
  return <ManualInstructions checkout={checkout} onPaid={onPaid} />
}

function TripayInstructions({
  checkout,
  onPaid,
}: {
  checkout: CheckoutResult
  onPaid: () => void
}) {
  const [status, setStatus] = useState<'PENDING' | 'PAID' | 'EXPIRED'>(
    'PENDING',
  )
  const pollerRef = useRef<NodeJS.Timeout | null>(null)

  // Poll status invoice setiap 5 detik. Stop saat PAID/EXPIRED.
  useEffect(() => {
    let aborted = false
    async function check() {
      try {
        const res = await fetch('/api/subscription/current')
        const json = (await res.json()) as {
          success: boolean
          data?: { subscription: { id: string; status: string } | null }
        }
        if (
          !aborted &&
          json.success &&
          json.data?.subscription?.id === checkout.subscriptionId &&
          json.data.subscription.status === 'ACTIVE'
        ) {
          setStatus('PAID')
          if (pollerRef.current) clearInterval(pollerRef.current)
          toast.success('Pembayaran sukses!')
          setTimeout(onPaid, 1500)
        }
      } catch {
        /* ignore network blip */
      }
    }
    pollerRef.current = setInterval(check, 5000)
    return () => {
      aborted = true
      if (pollerRef.current) clearInterval(pollerRef.current)
    }
  }, [checkout.subscriptionId, onPaid])

  function copyPayCode() {
    if (!checkout.payCode) return
    void navigator.clipboard.writeText(checkout.payCode)
    toast.success('Kode bayar disalin')
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          {status === 'PAID' ? (
            <CheckCircle2 className="size-5 text-emerald-500" />
          ) : (
            <Loader2 className="size-5 animate-spin text-primary-500" />
          )}
          <span className="font-medium">
            {status === 'PAID'
              ? 'Pembayaran Diterima!'
              : 'Menunggu Pembayaran...'}
          </span>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-sm text-muted-foreground">Total Bayar</div>
          <div className="font-display text-2xl font-extrabold">
            Rp {checkout.amount.toLocaleString('id-ID')}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Invoice {checkout.invoiceNumber} · {checkout.paymentName}
          </div>
        </div>

        {checkout.payCode && (
          <div className="space-y-2">
            <Label>Kode Bayar / Virtual Account</Label>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={checkout.payCode}
                className="font-mono"
              />
              <Button variant="outline" size="icon" onClick={copyPayCode}>
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
        )}

        {checkout.paymentUrl && (
          <Button asChild className="w-full">
            <a
              href={checkout.paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Buka Halaman Pembayaran
            </a>
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          Halaman ini akan auto-update saat pembayaran diterima. Tidak perlu
          refresh manual. Invoice expire dalam 24 jam.
        </p>
      </CardContent>
    </Card>
  )
}

function ManualInstructions({
  checkout,
  onPaid,
}: {
  checkout: CheckoutResult
  onPaid: () => void
}) {
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)

  async function handleUpload() {
    if (!proofFile) {
      toast.error('Pilih file bukti transfer')
      return
    }
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', proofFile)
      form.append('invoiceId', checkout.invoiceId)
      if (note) form.append('note', note)
      const res = await fetch('/api/subscription/upload-proof', {
        method: 'POST',
        body: form,
      })
      const json = (await res.json()) as {
        success: boolean
        error?: string
      }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal upload bukti')
        return
      }
      setUploaded(true)
      toast.success('Bukti transfer ter-upload, menunggu konfirmasi admin.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="text-sm text-muted-foreground">
            Total Bayar (PERSIS)
          </div>
          <div className="font-display text-2xl font-extrabold">
            Rp {checkout.amount.toLocaleString('id-ID')}
          </div>
          <div className="mt-1 text-xs text-amber-700">
            Termasuk kode unik {checkout.uniqueCode} di akhir — penting untuk
            identifikasi transfer.
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Invoice {checkout.invoiceNumber}
          </div>
        </div>

        {checkout.bank && (
          <div className="rounded-lg border p-4">
            <div className="text-sm font-medium">{checkout.bank.bankName}</div>
            <div className="mt-1 font-mono text-lg">
              {checkout.bank.accountNumber}
            </div>
            <div className="text-sm text-muted-foreground">
              a/n {checkout.bank.accountName}
            </div>
          </div>
        )}

        {!uploaded ? (
          <div className="space-y-3">
            <div>
              <Label htmlFor="proof-file">Bukti Transfer (max 2 MB)</Label>
              <Input
                id="proof-file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div>
              <Label htmlFor="proof-note">Catatan (opsional)</Label>
              <Textarea
                id="proof-note"
                rows={2}
                placeholder="Mis. nama pengirim, jam transfer..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <Button
              onClick={handleUpload}
              disabled={!proofFile || uploading}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Mengupload...
                </>
              ) : (
                <>
                  <Upload className="mr-2 size-4" />
                  Saya Sudah Transfer & Upload Bukti
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <CheckCircle2 className="mx-auto size-12 text-emerald-500" />
            <p className="font-medium">Bukti ter-upload!</p>
            <p className="text-sm text-muted-foreground">
              Admin akan konfirmasi pembayaranmu maksimal 1×24 jam. Kamu akan
              dapat notifikasi saat akun aktif.
            </p>
            <Button onClick={onPaid} variant="outline" className="w-full">
              Kembali ke Billing
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
