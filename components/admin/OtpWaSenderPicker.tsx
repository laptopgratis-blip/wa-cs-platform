'use client'

// Picker untuk pilih WhatsappSession mana yang dipakai kirim OTP auth.
// Tampil di /admin/settings. List semua session CONNECTED (across users)
// dengan radio button. Pilih satu → PATCH /api/admin/settings dgn key
// OTP_WA_SESSION_ID. Pilih "Otomatis" → simpan empty string → fallback
// ke admin session di runtime.
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
  user: { email: string; role: string }
}

export function OtpWaSenderPicker() {
  const [sessions, setSessions] = useState<ConnectedSession[]>([])
  const [currentValue, setCurrentValue] = useState<string>('') // empty = otomatis
  const [savedValue, setSavedValue] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

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
        data?: { OTP_WA_SESSION_ID?: string }
      }
      const list = sessionsJson.success && sessionsJson.data ? sessionsJson.data : []
      setSessions(list)
      const v = settingsJson.data?.OTP_WA_SESSION_ID ?? ''
      setCurrentValue(v)
      setSavedValue(v)
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

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'OTP_WA_SESSION_ID', value: currentValue }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menyimpan')
        return
      }
      setSavedValue(currentValue)
      toast.success('Pengirim OTP WhatsApp diperbarui')
    } finally {
      setSaving(false)
    }
  }

  const dirty = currentValue !== savedValue

  return (
    <Card className="rounded-xl border-warm-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-warm-900">
          Pengirim OTP WhatsApp
        </CardTitle>
        <CardDescription className="text-xs text-warm-500">
          Pilih sesi WhatsApp yang dipakai untuk kirim kode OTP login/signup.
          Disarankan pakai nomor dedicated &quot;Hulao Official&quot; supaya
          tidak mengganggu sesi CS / sales user. Kalau pilih &quot;Otomatis&quot;,
          sistem cari sesi CONNECTED milik admin sebagai fallback.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
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
