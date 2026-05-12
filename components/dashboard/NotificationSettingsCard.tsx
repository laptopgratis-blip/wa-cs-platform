'use client'

// Card pengaturan notifikasi dashboard untuk seller. Sederhana: toggle
// enable + pilih sound preset. Save langsung via PATCH (tidak butuh tombol
// "Simpan" — toggle = instant save).
//
// Sound preview pakai utility yang sama dengan SocialProofPopup public,
// jadi sound yang seller dengar di sini = sound yang akan play saat ada
// order baru waktu dashboard terbuka.
import { Bell, Loader2, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Switch } from '@/components/ui/switch'
import {
  type NotificationSound,
  playNotificationSound,
} from '@/lib/utils/notification-sound'

interface Settings {
  dashboardOrderPopupEnabled: boolean
  dashboardOrderPopupSound: string
}

const SOUND_OPTIONS: { v: NotificationSound | 'off'; label: string }[] = [
  { v: 'chime', label: 'Chime' },
  { v: 'bell', label: 'Bell' },
  { v: 'ding', label: 'Ding' },
  { v: 'pop', label: 'Pop' },
  { v: 'off', label: 'Mute' },
]

export function NotificationSettingsCard() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/me/notification-settings')
      const json = (await res.json()) as { success: boolean; data?: Settings }
      if (json.success && json.data) setSettings(json.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function patch(partial: Partial<Settings>) {
    if (!settings) return
    const next = { ...settings, ...partial }
    setSettings(next)
    setSaving(true)
    try {
      const res = await fetch('/api/me/notification-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal simpan pengaturan')
        setSettings(settings) // rollback
      }
    } catch {
      toast.error('Gagal simpan pengaturan')
      setSettings(settings)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <Loader2 className="mr-2 inline size-4 animate-spin" />
        Memuat pengaturan…
      </div>
    )
  }
  if (!settings) return null

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="size-4 text-primary-600" />
          <h3 className="text-sm font-semibold">Notifikasi Order di Dashboard</h3>
        </div>
        {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-xs text-muted-foreground">
        Saat dashboard terbuka, popup kecil muncul setiap ada order/pembayaran
        baru — biar kakak tetap semangat ngerjain bisnis.
      </p>

      <div className="flex items-start justify-between gap-3 rounded-md border bg-warm-50 p-3">
        <div>
          <p className="text-sm font-medium">Aktifkan popup notifikasi</p>
          <p className="text-xs text-muted-foreground">
            Off = popup tidak muncul (tetap bisa cek manual di Pesanan).
          </p>
        </div>
        <Switch
          checked={settings.dashboardOrderPopupEnabled}
          onCheckedChange={(v) =>
            patch({ dashboardOrderPopupEnabled: v })
          }
          className="mt-0.5"
        />
      </div>

      {settings.dashboardOrderPopupEnabled && (
        <div className="space-y-2 rounded-md border bg-warm-50 p-3">
          <div className="flex items-center gap-2">
            <Volume2 className="size-3.5 text-warm-700" />
            <p className="text-sm font-medium">Pilih sound notif</p>
          </div>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {SOUND_OPTIONS.map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => {
                  void patch({ dashboardOrderPopupSound: opt.v })
                  if (opt.v !== 'off') playNotificationSound(opt.v)
                }}
                className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                  settings.dashboardOrderPopupSound === opt.v
                    ? 'border-primary-500 bg-primary-50 font-semibold text-primary-900'
                    : 'border-warm-200 bg-card text-warm-700 hover:bg-warm-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Klik untuk preview. Sound disintesis langsung oleh browser (Web
            Audio API), tidak butuh download.
          </p>
        </div>
      )}
    </div>
  )
}
