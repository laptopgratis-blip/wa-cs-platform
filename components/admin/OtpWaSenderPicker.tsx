'use client'

// Pengaturan pengiriman OTP auth di /admin/settings:
// 1. Mode channel (OTP_CHANNEL_MODE): Email saja / WhatsApp saja / keduanya.
//    "Email saja" menghentikan semua trafik OTP via WA — dipakai kalau
//    nomor WA kena limit/blokir karena volume OTP.
// 2. Picker WhatsappSession pengirim (OTP_WA_SESSION_ID). Pilih
//    "Otomatis" → empty string → fallback admin session di runtime.
import { Loader2, Plus, RefreshCw, Save, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AddWaModal } from '@/components/whatsapp/AddWaModal'

interface ConnectedSession {
  id: string
  phoneNumber: string | null
  displayName: string | null
  updatedAt: string
  // Trek 2B: sesi bisa Baileys (teks bebas) atau Cloud API (OTP di luar
  // window butuh template AUTH_OTP ter-approve di WABA-nya).
  provider?: 'BAILEYS' | 'CLOUD_API'
  wabaId?: string | null
  user: { email: string; role: string }
}

interface PlatformTemplateItem {
  purposeKey: string
  description: string
  name: string
  status: string | null
  rejectionReason: string | null
}

type ChannelMode = 'EMAIL' | 'WA' | 'BOTH'

const CHANNEL_OPTIONS: { value: ChannelMode; label: string; desc: string }[] = [
  {
    value: 'EMAIL',
    label: 'Email saja',
    desc: 'OTP hanya via email. WhatsApp tidak dipakai sama sekali — pilih ini kalau nomor WA sering kena limit/blokir.',
  },
  {
    value: 'WA',
    label: 'WhatsApp saja',
    desc: 'OTP hanya via WhatsApp. Kalau WA gagal terkirim, sistem otomatis fallback ke email supaya user tidak terkunci.',
  },
  {
    value: 'BOTH',
    label: 'Email + WhatsApp',
    desc: 'OTP dikirim ke kedua channel sekaligus (volume WA paling tinggi).',
  },
]

export function OtpWaSenderPicker() {
  const [sessions, setSessions] = useState<ConnectedSession[]>([])
  const [currentValue, setCurrentValue] = useState<string>('') // empty = otomatis
  const [savedValue, setSavedValue] = useState<string>('')
  const [mode, setMode] = useState<ChannelMode>('BOTH')
  const [savedMode, setSavedMode] = useState<ChannelMode>('BOTH')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  // Status template platform (AUTH_OTP/INFO_GENERIC) sesi cloud yang dipilih.
  const [platformItems, setPlatformItems] = useState<PlatformTemplateItem[] | null>(null)
  const [platformBusy, setPlatformBusy] = useState(false)

  async function load(): Promise<ConnectedSession[]> {
    setLoading(true)
    try {
      const [sessionsRes, settingsRes] = await Promise.all([
        fetch('/api/admin/wa-sessions-connected'),
        fetch('/api/admin/settings'),
      ])
      const sessionsJson = (await sessionsRes.json()) as {
        success: boolean
        data?: ConnectedSession[]
      }
      const settingsJson = (await settingsRes.json()) as {
        success: boolean
        data?: { OTP_WA_SESSION_ID?: string; OTP_CHANNEL_MODE?: string }
      }
      const list = sessionsJson.success && sessionsJson.data ? sessionsJson.data : []
      setSessions(list)
      const v = settingsJson.data?.OTP_WA_SESSION_ID ?? ''
      setCurrentValue(v)
      setSavedValue(v)
      const m = settingsJson.data?.OTP_CHANNEL_MODE
      const parsedMode: ChannelMode = m === 'EMAIL' || m === 'WA' ? m : 'BOTH'
      setMode(parsedMode)
      setSavedMode(parsedMode)
      return list
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }
  useEffect(() => {
    void load()
  }, [])

  // Setelah QR sukses dipair (AddWaModal call onConnected), refresh list,
  // lalu auto-select session terbaru sebagai sender. Saving belum jalan —
  // user masih klik tombol Simpan supaya tetap eksplisit.
  async function handleSessionConnected() {
    toast.success('Nomor terhubung — pilih lalu Simpan untuk aktif sebagai OTP sender')
    const list = await load()
    if (list.length > 0) {
      // List sudah diurut updatedAt desc — yang terbaru di index 0 = nomor
      // yang baru saja connected.
      setCurrentValue(list[0].id)
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await load()
  }

  async function patchSetting(key: string, value: string): Promise<boolean> {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal menyimpan')
      return false
    }
    return true
  }

  async function handleSave() {
    setSaving(true)
    try {
      if (mode !== savedMode) {
        if (!(await patchSetting('OTP_CHANNEL_MODE', mode))) return
        setSavedMode(mode)
      }
      if (currentValue !== savedValue) {
        if (!(await patchSetting('OTP_WA_SESSION_ID', currentValue))) return
        setSavedValue(currentValue)
      }
      toast.success('Pengaturan OTP diperbarui')
    } finally {
      setSaving(false)
    }
  }

  const dirty = currentValue !== savedValue || mode !== savedMode
  const selectedSession = sessions.find((s) => s.id === currentValue) ?? null
  const selectedIsCloud = selectedSession?.provider === 'CLOUD_API'

  // Muat status template platform saat sender terpilih = sesi Cloud API.
  useEffect(() => {
    if (!selectedIsCloud || !currentValue) {
      const t = window.setTimeout(() => setPlatformItems(null), 0)
      return () => window.clearTimeout(t)
    }
    let cancelled = false
    const t = window.setTimeout(() => {
      fetch(`/api/admin/platform-templates?sessionId=${encodeURIComponent(currentValue)}`)
        .then((r) => r.json() as Promise<{ success: boolean; data?: { items: PlatformTemplateItem[] } }>)
        .then((json) => {
          if (!cancelled) setPlatformItems(json.success && json.data ? json.data.items : [])
        })
        .catch(() => {
          if (!cancelled) setPlatformItems([])
        })
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [selectedIsCloud, currentValue])

  async function preparePlatformTemplates() {
    if (!currentValue) return
    setPlatformBusy(true)
    try {
      const res = await fetch('/api/admin/platform-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentValue }),
      })
      const json = (await res.json()) as {
        success: boolean
        error?: string
        data?: { items: PlatformTemplateItem[] }
      }
      if (!json.success || !json.data) {
        toast.error(json.error ?? 'Gagal menyiapkan template platform')
        return
      }
      setPlatformItems(json.data.items)
      toast.success('Template platform dikirim ke Meta — tunggu review')
    } finally {
      setPlatformBusy(false)
    }
  }

  return (
    <Card className="rounded-xl border-warm-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-warm-900">
          Pengiriman OTP (Login &amp; Signup)
        </CardTitle>
        <CardDescription className="text-xs text-warm-500">
          Atur channel pengiriman kode OTP dan sesi WhatsApp pengirimnya.
          Halaman login/register user otomatis menyesuaikan pilihan channel
          di sini.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-warm-500">
                Channel pengiriman
              </legend>
              {CHANNEL_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                    mode === opt.value
                      ? 'border-primary-500 bg-primary-50/40'
                      : 'border-warm-200 hover:border-warm-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="otp-channel-mode"
                    className="mt-1 accent-primary-500"
                    checked={mode === opt.value}
                    onChange={() => setMode(opt.value)}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-warm-900">
                      {opt.label}
                    </div>
                    <div className="text-xs text-warm-500">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </fieldset>

            {/* Picker sender WA — tidak relevan kalau mode Email saja */}
            <div
              className={`space-y-3 ${mode === 'EMAIL' ? 'pointer-events-none opacity-40' : ''}`}
            >
              <div className="text-xs font-semibold uppercase tracking-wider text-warm-500">
                Pengirim WhatsApp
              </div>
              <p className="text-xs text-warm-500">
                Pilih sesi WhatsApp yang dipakai kirim OTP. Disarankan nomor
                dedicated &quot;Hulao Official&quot; (bukan nomor CS/admin
                aktif) supaya aman dari limit. &quot;Otomatis&quot; = sistem
                pakai sesi CONNECTED milik admin.
              </p>

            <div className="flex items-center justify-between gap-2">
              <Button
                size="sm"
                onClick={() => setAddOpen(true)}
                className="bg-primary-500 text-xs text-white shadow-orange hover:bg-primary-600"
              >
                <Plus className="mr-1.5 size-3.5" />
                Tambah nomor (scan QR)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-xs"
              >
                {refreshing ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 size-3.5" />
                )}
                Refresh list
              </Button>
            </div>

            <fieldset className="space-y-2">
              {/* Otomatis = empty string */}
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  currentValue === ''
                    ? 'border-primary-500 bg-primary-50/40'
                    : 'border-warm-200 hover:border-warm-300'
                }`}
              >
                <input
                  type="radio"
                  name="otp-wa-sender"
                  className="mt-1 accent-primary-500"
                  checked={currentValue === ''}
                  onChange={() => setCurrentValue('')}
                />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-warm-900">
                    Otomatis (fallback admin)
                  </div>
                  <div className="text-xs text-warm-500">
                    Sistem pilih sendiri sesi CONNECTED milik admin. Pakai ini
                    kalau belum punya nomor dedicated.
                  </div>
                </div>
              </label>

              {sessions.length === 0 ? (
                <div className="rounded-lg border border-dashed border-warm-300 bg-warm-50/40 p-4 text-center text-xs text-warm-500">
                  Tidak ada WhatsApp session berstatus CONNECTED. Buat session
                  baru di halaman WhatsApp dulu (scan QR), lalu refresh list.
                </div>
              ) : (
                sessions.map((s) => {
                  const checked = currentValue === s.id
                  return (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                        checked
                          ? 'border-primary-500 bg-primary-50/40'
                          : 'border-warm-200 hover:border-warm-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="otp-wa-sender"
                        className="mt-1 accent-primary-500"
                        checked={checked}
                        onChange={() => setCurrentValue(s.id)}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 text-sm font-semibold text-warm-900">
                          <Smartphone className="size-3.5 text-warm-500" />
                          {s.displayName ?? s.phoneNumber ?? '(tanpa nama)'}
                          {s.user.role === 'ADMIN' && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700">
                              Admin
                            </span>
                          )}
                          {s.provider === 'CLOUD_API' && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
                              Cloud API
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-warm-500">
                          {s.phoneNumber ?? '—'} · pemilik {s.user.email}
                        </div>
                        <div className="font-mono text-[10px] text-warm-400">
                          id: {s.id}
                        </div>
                      </div>
                    </label>
                  )
                })
              )}
            </fieldset>
            </div>

            {selectedIsCloud && (
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-emerald-900">
                    Template platform (nomor Cloud API)
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={preparePlatformTemplates}
                    disabled={platformBusy}
                  >
                    {platformBusy ? (
                      <Loader2 className="mr-1.5 size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1.5 size-3" />
                    )}
                    Siapkan template platform
                  </Button>
                </div>
                <p className="text-[11px] text-emerald-900/70">
                  OTP di luar window 24 jam Meta hanya bisa lewat template AUTHENTICATION yang
                  disetujui. Siapkan sekali; status berubah otomatis setelah review Meta.
                </p>
                {platformItems === null ? (
                  <p className="text-[11px] text-emerald-900/60">Memuat status…</p>
                ) : platformItems.length === 0 ? (
                  <p className="text-[11px] text-emerald-900/60">Belum ada template — klik Siapkan.</p>
                ) : (
                  <ul className="space-y-1 text-[11px]">
                    {platformItems.map((it) => (
                      <li key={it.purposeKey} className="flex items-center justify-between gap-2">
                        <span className="truncate text-emerald-900/80">
                          {it.name} — {it.description}
                        </span>
                        <span
                          className={
                            it.status === 'APPROVED'
                              ? 'font-semibold text-emerald-700'
                              : it.status === 'REJECTED' || it.status === 'PAUSED'
                                ? 'font-semibold text-red-600'
                                : 'font-semibold text-amber-700'
                          }
                          title={it.rejectionReason ?? undefined}
                        >
                          {it.status ?? 'Belum dibuat'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              {dirty && !saving && (
                <span className="text-xs text-amber-600">Belum disimpan</span>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!dirty || saving}
                className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
              >
                {saving ? (
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1.5 size-3.5" />
                )}
                Simpan
              </Button>
            </div>
          </>
        )}
      </CardContent>
      <AddWaModal
        open={addOpen}
        onOpenChange={setAddOpen}
        onConnected={handleSessionConnected}
      />
    </Card>
  )
}
