'use client'

// Card untuk satu WA session — tampilkan nomor, nama, status, dan aksi,
// plus form pilihan Soul + Model AI.
import {
  Loader2,
  MoreVertical,
  Phone,
  QrCode,
  Save,
  Trash2,
  Unplug,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { StatusBadge } from '@/components/whatsapp/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getSocket,
  type StatusEventPayload,
  type WaStatus,
} from '@/lib/socket-client'
import { formatNumber } from '@/lib/format'

export interface WaSessionData {
  id: string
  phoneNumber: string | null
  displayName: string | null
  status: WaStatus
  createdAt: string
  soulId: string | null
  modelId: string | null
}

export interface SoulOption {
  id: string
  name: string
  isDefault: boolean
}

export interface AiModelOption {
  id: string
  name: string
  costPerMessage: number
}

interface WaSessionCardProps {
  session: WaSessionData
  souls: SoulOption[]
  models: AiModelOption[]
  onChanged: () => void
  /** Trigger modal QR untuk pair-ulang session ini (non-null sessionId). */
  onRepair?: (sessionId: string) => void
}

const NONE = '__NONE__' as const

export function WaSessionCard({
  session,
  souls,
  models,
  onChanged,
  onRepair,
}: WaSessionCardProps) {
  const [status, setStatus] = useState<WaStatus>(session.status)
  const [phoneNumber, setPhoneNumber] = useState(session.phoneNumber)
  const [displayName, setDisplayName] = useState(session.displayName)
  const [isBusy, setBusy] = useState(false)

  // Config form state — diff dengan props supaya tombol "Simpan" disabled kalau tidak berubah.
  const [soulId, setSoulId] = useState<string | null>(session.soulId)
  const [modelId, setModelId] = useState<string | null>(session.modelId)
  const [isSaving, setSaving] = useState(false)

  const dirty = useMemo(
    () => soulId !== session.soulId || modelId !== session.modelId,
    [soulId, modelId, session.soulId, session.modelId],
  )

  useEffect(() => {
    const socket = getSocket()
    socket.emit('subscribe', session.id)

    function handleStatus(payload: StatusEventPayload) {
      if (payload.sessionId !== session.id) return
      // Defensive: hanya update status kalau payload benar-benar punya field-nya.
      // Event 'connected' / 'disconnected' punya schema berbeda — tidak ada
      // 'status', tapi kita derive secara eksplisit di handler-nya sendiri.
      if (payload.status) setStatus(payload.status)
      if (typeof payload.phoneNumber === 'string') setPhoneNumber(payload.phoneNumber)
      if (typeof payload.displayName === 'string') setDisplayName(payload.displayName)
    }

    function handleConnected(payload: { sessionId: string; phoneNumber?: string; displayName?: string | null }) {
      if (payload.sessionId !== session.id) return
      setStatus('CONNECTED')
      if (typeof payload.phoneNumber === 'string') setPhoneNumber(payload.phoneNumber)
      if (typeof payload.displayName === 'string') setDisplayName(payload.displayName)
    }

    function handleDisconnected(payload: { sessionId: string }) {
      if (payload.sessionId !== session.id) return
      setStatus('DISCONNECTED')
    }

    socket.on('status', handleStatus)
    socket.on('connected', handleConnected)
    socket.on('disconnected', handleDisconnected)

    return () => {
      socket.off('status', handleStatus)
      socket.off('connected', handleConnected)
      socket.off('disconnected', handleDisconnected)
      socket.emit('unsubscribe', session.id)
    }
  }, [session.id])

  async function disconnect(wipe: boolean) {
    setBusy(true)
    try {
      const res = await fetch(`/api/whatsapp/${session.id}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wipe }),
      })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error || 'Gagal memutus koneksi')
        return
      }
      toast.success(wipe ? 'WhatsApp dihapus' : 'Koneksi diputus')
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function saveConfig() {
    setSaving(true)
    try {
      const res = await fetch(`/api/whatsapp/${session.id}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soulId, modelId }),
      })
      const json = (await res.json().catch(() => null)) as
        | { success: boolean; error?: string }
        | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error || 'Gagal menyimpan konfigurasi')
        return
      }
      toast.success('Konfigurasi tersimpan')
      onChanged()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="rounded-xl border-warm-200 shadow-sm hover-lift">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary-100 text-primary-500">
            <Phone className="size-5" />
          </div>
          <div>
            <CardTitle className="text-base">
              {/* Fallback hierarchy: displayName (kalau Baileys sudah populate) →
                 nomor (kalau sudah pair) → string default. */}
              {displayName ||
                (phoneNumber ? `+${phoneNumber}` : 'WhatsApp belum tertaut')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {phoneNumber
                ? displayName
                  ? `+${phoneNumber}`
                  : 'Nama belum terdeteksi'
                : 'Belum pair — scan QR dulu'}
            </p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={isBusy}>
              {isBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MoreVertical className="size-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Selalu tampilkan supaya user bisa repair kapan saja, termasuk
                kalau status CONNECTED tapi sebenarnya broken (mis. WA kick
                device tanpa update status di sini). */}
            {onRepair && (
              <DropdownMenuItem onClick={() => onRepair(session.id)}>
                <QrCode className="mr-2 size-4" />
                Pair Ulang (scan QR baru)
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              disabled={status === 'DISCONNECTED'}
              onClick={() => disconnect(false)}
            >
              <Unplug className="mr-2 size-4" />
              Putuskan koneksi
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => disconnect(true)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 size-4" />
              Hapus & logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="space-y-4 border-t pt-4">
        <div className="flex items-center justify-between">
          <StatusBadge status={status} />
          <span className="text-xs text-muted-foreground">
            Ditambahkan {formatDate(session.createdAt)}
          </span>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Soul</Label>
            <Select
              value={soulId ?? NONE}
              onValueChange={(v) => setSoulId(v === NONE ? null : v)}
              disabled={souls.length === 0}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    souls.length === 0 ? 'Buat soul dulu di menu Soul' : 'Pilih soul'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Tidak pakai soul</SelectItem>
                {souls.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.isDefault ? ' (default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Model AI</Label>
            <Select
              value={modelId ?? NONE}
              onValueChange={(v) => setModelId(v === NONE ? null : v)}
              disabled={models.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih model AI" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Tidak pakai AI</SelectItem>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} — {formatNumber(m.costPerMessage)} token/pesan
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            size="sm"
            onClick={saveConfig}
            disabled={!dirty || isSaving}
            className="w-full bg-primary-500 text-white hover:bg-primary-600 disabled:bg-warm-300"
          >
            {isSaving ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            Simpan Konfigurasi
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
