'use client'

// Bank Mutation Auto-Reader (BETA) — main dashboard untuk user.
//
// State machine:
//   1. Belum setup (initial == null) → tampilkan disclaimer keras + form
//      setup. User HARUS centang consent sebelum lanjut.
//   2. Sudah setup → tampilkan status koneksi + statistik + setting toggle.
//      Action: Sync sekarang, Lihat mutasi, Update kredensial, Disconnect.
//
// Status koneksi mengikuti lastScrapeStatus:
//   - SUCCESS → 🟢 Terhubung
//   - OTP_REQUIRED / BLOCKED → 🔴 fitur tidak feasible / akun terkunci
//   - AUTH_FAILED → 🟠 perlu update kredensial
//   - ERROR → 🟠 error sementara, retry akan jalan
//   - null (belum scrape) → 🟡 menunggu sync pertama
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Switch } from '@/components/ui/switch'
import { formatRelativeTime } from '@/lib/format-time'
import { formatNumber, formatRupiah } from '@/lib/format'

export interface BankMutationIntegrationView {
  id: string
  bankCode: string
  accountNumber: string | null
  accountName: string | null
  accountBalance: number | null
  isActive: boolean
  isBetaConsented: boolean
  isAdminBlocked: boolean
  autoConfirmEnabled: boolean
  matchByExactAmount: boolean
  matchByCustomerName: boolean
  scrapeIntervalMinutes: number
  lastScrapedAt: string | null
  lastScrapeStatus: string | null
  lastScrapeError: string | null
  totalMutationsCaptured: number
  totalAutoConfirmed: number
  totalScrapes: number
  totalScrapeFailures: number
  hasCredentials: boolean
}

interface Props {
  initial: BankMutationIntegrationView | null
}

const DISCLAIMER_BULLETS_NEGATIVE = [
  'Anda memberikan kredensial KlikBCA Individual ke Hulao.',
  'Sharing kredensial banking melanggar Term of Service BCA.',
  'Akun BCA bisa terkena suspect/lock kalau ada anomali login dari IP server.',
  'Hulao TIDAK bertanggung jawab atas masalah dengan akun BCA Anda.',
]
const DISCLAIMER_BULLETS_POSITIVE = [
  'Hanya read-only access — tanpa KeyBCA token, transfer keluar tidak bisa.',
  'Kredensial dienkripsi AES-256-GCM sebelum disimpan.',
  'Bisa di-disconnect kapan saja & data mutasi terhapus.',
  'Admin Hulao punya kill switch global kalau ada masalah.',
]

export function BankMutationClient({ initial }: Props) {
  const router = useRouter()
  const [integration, setIntegration] = useState(initial)
  const [setupOpen, setSetupOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [confirmDisconnect, setConfirmDisconnect] = useState(false)

  // Stage: belum setup ATAU klik "Update Kredensial" → buka dialog setup
  const showSetup = setupOpen || (!integration && true)

  async function refreshIntegration() {
    const res = await fetch('/api/integrations/bank-mutation')
    const j = await res.json()
    if (j.success) setIntegration(j.data.integration)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/integrations/bank-mutation/scrape', {
        method: 'POST',
      })
      const j = await res.json()
      if (!res.ok || !j.success) {
        throw new Error(j.error || 'Gagal trigger sync')
      }
      toast.success('Sync dimulai. Hasil muncul dalam ~30 detik.')
      // Poll status setiap 5 detik max 6 kali (= 30 detik)
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 5000))
        await refreshIntegration()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal sync')
    } finally {
      setSyncing(false)
    }
  }

  async function handleSettingChange(
    field: keyof BankMutationIntegrationView,
    value: boolean | number,
  ) {
    if (!integration) return
    const optimistic = { ...integration, [field]: value }
    setIntegration(optimistic)
    const res = await fetch('/api/integrations/bank-mutation', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    })
    const j = await res.json()
    if (!res.ok || !j.success) {
      toast.error(j.error || 'Gagal update setting')
      setIntegration(integration) // rollback
    } else {
      toast.success('Tersimpan')
    }
  }

  async function handleDisconnect() {
    const res = await fetch('/api/integrations/bank-mutation', {
      method: 'DELETE',
    })
    const j = await res.json()
    if (!res.ok || !j.success) {
      toast.error(j.error || 'Gagal disconnect')
      return
    }
    toast.success('Disconnected')
    setIntegration(null)
    setConfirmDisconnect(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Banknote className="h-6 w-6" />
            Auto-Confirm Pembayaran
            <Badge variant="outline" className="border-orange-400 bg-orange-50 text-orange-700">
              BETA
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Otomatis baca mutasi BCA & konfirmasi order TRANSFER tanpa approve manual.
          </p>
        </div>
        {integration?.hasCredentials && (
          <div className="flex gap-2">
            <Link href="/integrations/bank-mutation/mutations">
              <Button variant="outline" size="sm">
                Lihat Mutasi
              </Button>
            </Link>
            <Link href="/integrations/bank-mutation/jobs">
              <Button variant="outline" size="sm">
                Logs
              </Button>
            </Link>
          </div>
        )}
      </div>

      <BetaDisclaimerBanner />

      {!integration ? (
        <SetupCard
          open={showSetup}
          onSaved={async () => {
            setSetupOpen(false)
            await refreshIntegration()
            toast.success('Integration tersimpan. Klik Sync untuk test koneksi.')
          }}
        />
      ) : (
        <>
          <StatusCard integration={integration} onSync={handleSync} syncing={syncing} />
          <SettingsCard
            integration={integration}
            onChange={handleSettingChange}
          />
          <StatsCard integration={integration} />
          <div className="flex justify-between gap-3 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSetupOpen(true)}
            >
              Update Kredensial
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDisconnect(true)}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Disconnect & Hapus
            </Button>
          </div>
        </>
      )}

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Setup Akun BCA</DialogTitle>
            <DialogDescription>
              User ID & PIN KlikBCA Individual akan dienkripsi AES-256-GCM.
            </DialogDescription>
          </DialogHeader>
          <SetupForm
            mode="update"
            onSaved={async () => {
              setSetupOpen(false)
              await refreshIntegration()
              toast.success('Kredensial diperbarui. Klik Sync untuk test.')
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect & Hapus Data?</DialogTitle>
            <DialogDescription>
              Semua mutasi & log job akan terhapus. Order yang sudah ter-PAID
              tidak terpengaruh. Tindakan ini tidak bisa di-undo.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDisconnect(false)}
            >
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDisconnect}>
              Ya, Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BetaDisclaimerBanner() {
  return (
    <Alert variant="destructive" className="border-orange-400 bg-orange-50">
      <ShieldAlert className="h-5 w-5" />
      <AlertTitle className="text-orange-900">Fitur BETA — Pakai dengan Risiko</AlertTitle>
      <AlertDescription className="text-orange-900/90">
        <ul className="mt-2 space-y-1 text-sm">
          {DISCLAIMER_BULLETS_NEGATIVE.map((b) => (
            <li key={b}>❌ {b}</li>
          ))}
          {DISCLAIMER_BULLETS_POSITIVE.map((b) => (
            <li key={b}>✅ {b}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

function statusVisual(integration: BankMutationIntegrationView) {
  if (integration.isAdminBlocked) {
    return {
      icon: <XCircle className="h-5 w-5 text-red-600" />,
      label: 'Diblokir Admin',
      tone: 'destructive' as const,
      detail:
        'Admin Hulao memblokir integrasi ini sementara. Hubungi support untuk klarifikasi.',
    }
  }
  if (!integration.lastScrapeStatus) {
    return {
      icon: <Loader2 className="h-5 w-5 text-yellow-600 animate-spin" />,
      label: 'Belum sync pertama',
      tone: 'default' as const,
      detail: 'Klik Sync untuk test koneksi.',
    }
  }
  switch (integration.lastScrapeStatus) {
    case 'SUCCESS':
      return {
        icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
        label: 'Terhubung',
        tone: 'default' as const,
        detail: null,
      }
    case 'OTP_REQUIRED':
      return {
        icon: <XCircle className="h-5 w-5 text-red-600" />,
        label: 'OTP/KeyBCA diminta',
        tone: 'destructive' as const,
        detail:
          'BCA meminta OTP/KeyBCA untuk login dari IP server. Fitur scraper tidak feasible saat ini. Gunakan konfirmasi manual.',
      }
    case 'AUTH_FAILED':
      return {
        icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
        label: 'Kredensial salah',
        tone: 'destructive' as const,
        detail: 'User ID atau PIN BCA salah. Update kredensial Anda.',
      }
    case 'BLOCKED':
      return {
        icon: <XCircle className="h-5 w-5 text-red-600" />,
        label: 'Akun BCA terkunci',
        tone: 'destructive' as const,
        detail:
          'Akun BCA Anda terkunci. Unblock via Halo BCA / cabang dulu, lalu coba lagi.',
      }
    case 'ERROR':
    default:
      return {
        icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
        label: 'Error sementara',
        tone: 'destructive' as const,
        detail: integration.lastScrapeError || 'Coba sync lagi.',
      }
  }
}

function StatusCard({
  integration,
  onSync,
  syncing,
}: {
  integration: BankMutationIntegrationView
  onSync: () => void
  syncing: boolean
}) {
  const v = statusVisual(integration)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {v.icon}
          Status: {v.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {v.detail && (
          <Alert variant={v.tone}>
            <AlertDescription>{v.detail}</AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Bank</div>
            <div className="font-medium">{integration.bankCode}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Rekening</div>
            <div className="font-medium font-mono">
              {integration.accountNumber || <span className="text-muted-foreground italic">belum diketahui</span>}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Nama</div>
            <div className="font-medium">
              {integration.accountName || <span className="text-muted-foreground italic">belum diketahui</span>}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Saldo terakhir</div>
            <div className="font-medium">
              {integration.accountBalance !== null
                ? formatRupiah(integration.accountBalance)
                : '—'}
            </div>
          </div>
          <div className="sm:col-span-2">
            <div className="text-muted-foreground">Last sync</div>
            <div className="font-medium">
              {integration.lastScrapedAt
                ? formatRelativeTime(integration.lastScrapedAt)
                : 'Belum pernah sync'}
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={onSync} disabled={syncing} size="sm">
            {syncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {syncing ? 'Sync berjalan...' : 'Sync Sekarang'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SettingsCard({
  integration,
  onChange,
}: {
  integration: BankMutationIntegrationView
  onChange: (
    field: keyof BankMutationIntegrationView,
    value: boolean | number,
  ) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pengaturan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium text-sm">Aktifkan auto-confirm</div>
            <div className="text-xs text-muted-foreground">
              Order TRANSFER yang totalnya match mutasi CR akan otomatis ter-PAID.
            </div>
          </div>
          <Switch
            checked={integration.autoConfirmEnabled}
            onCheckedChange={(v) => onChange('autoConfirmEnabled', v)}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium text-sm">Match by exact amount</div>
            <div className="text-xs text-muted-foreground">
              Cocokkan totalRp order persis dengan amount mutasi (default ON).
            </div>
          </div>
          <Switch checked={integration.matchByExactAmount} disabled />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium text-sm">
              Match by customer name (eksperimental)
            </div>
            <div className="text-xs text-muted-foreground">
              Kalau ada beberapa order dengan total sama, pilih berdasarkan nama
              di deskripsi mutasi.
            </div>
          </div>
          <Switch
            checked={integration.matchByCustomerName}
            onCheckedChange={(v) => onChange('matchByCustomerName', v)}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium text-sm">Aktif</div>
            <div className="text-xs text-muted-foreground">
              Pause sementara tanpa hapus data.
            </div>
          </div>
          <Switch
            checked={integration.isActive}
            onCheckedChange={(v) => onChange('isActive', v)}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function StatsCard({
  integration,
}: {
  integration: BankMutationIntegrationView
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Statistik</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Stat label="Mutasi tercatat" value={formatNumber(integration.totalMutationsCaptured)} />
          <Stat label="Auto-confirmed" value={formatNumber(integration.totalAutoConfirmed)} />
          <Stat label="Total scrapes" value={formatNumber(integration.totalScrapes)} />
          <Stat
            label="Scrape gagal"
            value={formatNumber(integration.totalScrapeFailures)}
            tone={integration.totalScrapeFailures > 0 ? 'warning' : 'default'}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'warning'
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div
        className={
          'font-bold text-xl ' +
          (tone === 'warning' ? 'text-amber-600' : '')
        }
      >
        {value}
      </div>
    </div>
  )
}

function SetupCard({
  open,
  onSaved,
}: {
  open: boolean
  onSaved: () => void | Promise<void>
}) {
  const [step, setStep] = useState<'consent' | 'form'>('consent')
  const [consented, setConsented] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mulai Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {step === 'consent' ? (
          <div className="space-y-3">
            <p className="text-sm">
              Sebelum setup, baca disclaimer di atas dan centang persetujuan.
            </p>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={consented}
                onCheckedChange={(v) => setConsented(v === true)}
              />
              <span>
                Saya membaca & menerima risiko fitur BETA ini. Saya paham
                bahwa Hulao tidak bertanggung jawab atas masalah dengan akun
                BCA saya.
              </span>
            </label>
            <div className="flex gap-2">
              <Button
                onClick={() => setStep('form')}
                disabled={!consented}
                size="sm"
              >
                Lanjutkan Setup
              </Button>
              <Link href="/dashboard">
                <Button variant="outline" size="sm">
                  Saya Batal
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <SetupForm mode="create" onSaved={onSaved} />
        )}
      </CardContent>
    </Card>
  )
}

function SetupForm({
  mode,
  onSaved,
}: {
  mode: 'create' | 'update'
  onSaved: () => void | Promise<void>
}) {
  const [bcaUserId, setBcaUserId] = useState('')
  const [bcaPin, setBcaPin] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!bcaUserId.trim() || !bcaPin.trim()) {
      toast.error('User ID dan PIN wajib diisi')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/integrations/bank-mutation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bcaUserId,
          bcaPin,
          isBetaConsented: true,
        }),
      })
      const j = await res.json()
      if (!res.ok || !j.success) {
        throw new Error(j.error || 'Gagal simpan')
      }
      await onSaved()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="bca-user-id">User ID KlikBCA Individual</Label>
        <Input
          id="bca-user-id"
          value={bcaUserId}
          onChange={(e) => setBcaUserId(e.target.value)}
          autoComplete="off"
          placeholder="Contoh: BUDISANTOSO"
        />
      </div>
      <div>
        <Label htmlFor="bca-pin">PIN Internet Banking (6 digit)</Label>
        <Input
          id="bca-pin"
          type="password"
          value={bcaPin}
          onChange={(e) => setBcaPin(e.target.value)}
          autoComplete="off"
          inputMode="numeric"
          placeholder="••••••"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Setelah simpan, klik Sync di status panel untuk test koneksi.
      </p>
      <div className="flex justify-end gap-2">
        <Button onClick={handleSubmit} disabled={submitting} size="sm">
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {mode === 'create' ? 'Aktifkan' : 'Simpan'}
        </Button>
      </div>
    </div>
  )
}
