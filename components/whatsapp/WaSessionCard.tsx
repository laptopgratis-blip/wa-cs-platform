'use client'

// Card untuk satu WA session — tampilkan nomor, nama, status, dan aksi,
// plus form pilihan Soul + Model AI.
import {
  BadgeCheck,
  Copy,
  LayoutTemplate,
  Loader2,
  MoreVertical,
  Phone,
  QrCode,
  Save,
  Trash2,
  Unplug,
} from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { StatusBadge as SharedStatusBadge } from '@/components/shared/StatusBadge'
import {
  CoexSyncStatus,
  type CoexSyncSnapshot,
} from '@/components/whatsapp/CoexSyncStatus'
import { StatusBadge } from '@/components/whatsapp/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  getSocket,
  subscribeWaSession,
  type StatusEventPayload,
  type SubscribeErrorPayload,
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
  // BAILEYS (QR, unofficial) atau CLOUD_API (WhatsApp Business API resmi).
  provider: 'BAILEYS' | 'CLOUD_API'
  // Cloud API: nomor juga hidup di WA Business App di HP.
  isCoexistence: boolean
  lastError: string | null
  // Status sync kontak/riwayat coexistence (null bila bukan coexistence).
  coexSync: CoexSyncSnapshot | null
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

// Salin ke clipboard dengan fallback execCommand — Clipboard API butuh
// secure context, sementara staging/LAN kadang diakses lewat http.
async function copySessionId(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // jatuh ke fallback
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

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

  const isCloud = session.provider === 'CLOUD_API'

  useEffect(() => {
    // Sesi Cloud API tidak punya state realtime di wa-service (status hidup
    // di DB) — skip subscribe supaya tidak spam token request.
    if (isCloud) return

    const socket = getSocket()
    let cancelled = false

    // Subscribe pakai token short-lived dari server — wa-service menolak
    // join room tanpa token valid (anti QR hijack). isCancelled mencegah
    // subscribe telat (setelah cleanup unsubscribe) saat komponen unmount.
    void subscribeWaSession(socket, session.id, {
      isCancelled: () => cancelled,
    }).then((result) => {
      if (cancelled || result.ok) return
      toast.error(result.error || 'Gagal terhubung ke status realtime')
    })

    function handleStatus(payload: StatusEventPayload) {
      if (payload.sessionId !== session.id) return
      // Defensive: hanya update status kalau payload benar-benar punya field-nya.
      // Event 'connected' / 'disconnected' punya schema berbeda — tidak ada
      // 'status', tapi kita derive secara eksplisit di handler-nya sendiri.
      if (payload.status) setStatus(payload.status)
      if (typeof payload.phoneNumber === 'string')
        setPhoneNumber(payload.phoneNumber)
      if (typeof payload.displayName === 'string')
        setDisplayName(payload.displayName)
    }

    function handleConnected(payload: {
      sessionId: string
      phoneNumber?: string
      displayName?: string | null
    }) {
      if (payload.sessionId !== session.id) return
      setStatus('CONNECTED')
      if (typeof payload.phoneNumber === 'string')
        setPhoneNumber(payload.phoneNumber)
      if (typeof payload.displayName === 'string')
        setDisplayName(payload.displayName)
    }

    function handleDisconnected(payload: { sessionId: string }) {
      if (payload.sessionId !== session.id) return
      setStatus('DISCONNECTED')
    }

    function handleSubscribeError(payload: SubscribeErrorPayload) {
      if (payload.sessionId !== session.id) return
      toast.error(payload.error || 'Gagal subscribe status realtime')
    }

    socket.on('status', handleStatus)
    socket.on('connected', handleConnected)
    socket.on('disconnected', handleDisconnected)
    socket.on('subscribe-error', handleSubscribeError)

    return () => {
      cancelled = true
      socket.off('status', handleStatus)
      socket.off('connected', handleConnected)
      socket.off('disconnected', handleDisconnected)
      socket.off('subscribe-error', handleSubscribeError)
      socket.emit('unsubscribe', session.id)
    }
  }, [session.id, isCloud])

  // null = dialog tertutup. Aksi destruktif WAJIB lewat konfirmasi — dulu
  // "Putuskan koneksi" dan "Hapus & logout" langsung eksekusi dari menu,
  // satu salah klik cukup untuk mencabut nomor produksi.
  const [confirmMode, setConfirmMode] = useState<null | 'disconnect' | 'wipe'>(
    null,
  )

  async function disconnect(wipe: boolean) {
    setBusy(true)
    try {
      const res = await fetch(`/api/whatsapp/${session.id}/disconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wipe }),
      })
      const json = (await res.json().catch(() => null)) as {
        success: boolean
        error?: string
      } | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error || 'Gagal memutus koneksi')
        return
      }
      toast.success(wipe ? 'WhatsApp dihapus' : 'Koneksi diputus')
      setConfirmMode(null)
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
      const json = (await res.json().catch(() => null)) as {
        success: boolean
        error?: string
      } | null
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
    <TooltipProvider>
      <Card className="hover-lift">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <div className="flex items-center gap-3">
            <div className="bg-primary-100 text-primary-500 flex size-10 items-center justify-center rounded-xl">
              <Phone className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base">
                {/* Fallback hierarchy: displayName (kalau Baileys sudah populate) →
                 nomor (kalau sudah pair) → string default. */}
                {displayName ||
                  (phoneNumber ? `+${phoneNumber}` : 'WhatsApp belum tertaut')}
              </CardTitle>
              <p className="text-muted-foreground text-xs">
                {phoneNumber
                  ? displayName
                    ? `+${phoneNumber}`
                    : 'Nama belum terdeteksi'
                  : isCloud
                    ? 'Menunggu data nomor dari Meta'
                    : 'Belum pair — scan QR dulu'}
              </p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Opsi WhatsApp"
                disabled={isBusy}
              >
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
                device tanpa update status di sini). Sesi Cloud API tidak
                memakai QR — repair-nya lewat Embedded Signup ulang. */}
              {/* ID sesi dipakai sebagai `session_id` di API publik untuk memilih
                  nomor pengirim. Sebelumnya nilai ini tidak muncul di UI mana
                  pun, jadi satu-satunya cara mendapatkannya adalah memanggil
                  GET /api/v1/senders manual. */}
              <DropdownMenuItem
                onClick={async () => {
                  const ok = await copySessionId(session.id)
                  if (ok) toast.success('ID sesi disalin — pakai sebagai session_id di API')
                  else toast.error('Gagal menyalin — salin manual dari /api/v1/senders')
                }}
              >
                <Copy className="mr-2 size-4" />
                Salin ID sesi (untuk API)
              </DropdownMenuItem>
              {onRepair && !isCloud && (
                <DropdownMenuItem onClick={() => onRepair(session.id)}>
                  <QrCode className="mr-2 size-4" />
                  Pair Ulang (scan QR baru)
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={status === 'DISCONNECTED'}
                onClick={() => setConfirmMode('disconnect')}
              >
                <Unplug className="mr-2 size-4" />
                Putuskan koneksi
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setConfirmMode('wipe')}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 size-4" />
                Hapus & logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>

        <CardContent className="space-y-4 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {status === 'ERROR' && session.lastError ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">
                      <StatusBadge status={status} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    {session.lastError}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <StatusBadge status={status} />
              )}
              {isCloud && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-default">
                      <SharedStatusBadge
                        tone="success"
                        icon={BadgeCheck}
                        label={
                          session.isCoexistence ? 'Coexistence' : 'Cloud API'
                        }
                      />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    {session.isCoexistence
                      ? 'WhatsApp Business API resmi — nomor tetap aktif di WA Business App di HP'
                      : 'WhatsApp Business API resmi (nomor khusus Cloud API)'}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              Ditambahkan {formatDate(session.createdAt)}
            </span>
          </div>

          {isCloud && session.isCoexistence && session.coexSync && (
            <CoexSyncStatus sessionId={session.id} initial={session.coexSync} />
          )}

          {isCloud && (
            <Link
              href={`/whatsapp/templates?session=${session.id}`}
              className="text-primary-600 inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
            >
              <LayoutTemplate className="size-3.5" /> Kelola Template Meta
              (broadcast, follow-up, OTP)
            </Link>
          )}

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Soul</Label>
              <Select
                value={soulId ?? NONE}
                onValueChange={(v) => setSoulId(v === NONE ? null : v)}
                disabled={souls.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue
                    placeholder={
                      souls.length === 0
                        ? 'Buat soul dulu di menu Soul'
                        : 'Pilih soul'
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
                <SelectTrigger className="w-full">
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
              className="w-full"
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

      <ConfirmDialog
        open={confirmMode !== null}
        onOpenChange={(o) => (o ? undefined : setConfirmMode(null))}
        isLoading={isBusy}
        variant={confirmMode === 'wipe' ? 'destructive' : 'default'}
        title={
          confirmMode === 'wipe'
            ? `Hapus & logout ${displayName || (phoneNumber ? `+${phoneNumber}` : 'nomor ini')}?`
            : 'Putuskan koneksi WhatsApp?'
        }
        confirmLabel={confirmMode === 'wipe' ? 'Ya, Hapus & Logout' : 'Ya, Putuskan'}
        description={
          confirmMode === 'wipe' ? (
            <span className="space-y-2">
              <span className="block">
                Kredensial nomor ini dihapus dari Hulao dan AI berhenti membalas.
                Riwayat chat &amp; kontak TETAP tersimpan.
              </span>
              {isCloud ? (
                // Poin yang paling sering bikin bingung: melepas di Hulao TIDAK
                // melepas nomor di sisi Meta, jadi memakainya di akun lain tetap
                // ditolak ("nomor sudah terdaftar") sampai dilepas di sana.
                <span className="block">
                  Nomor ini <strong>tetap terdaftar</strong> di WhatsApp Business
                  Account milikmu di Meta — Hulao hanya melepas akses. Untuk
                  memakai nomor yang sama di akun atau platform lain, hapus atau
                  migrasikan nomornya lewat WhatsApp Manager dulu.
                </span>
              ) : (
                <span className="block">
                  Untuk memakai nomor ini lagi, kamu perlu scan QR dari awal.
                </span>
              )}
            </span>
          ) : (
            <span>
              AI berhenti membalas pesan di nomor ini. Riwayat chat &amp; kontak
              tetap tersimpan, dan kamu bisa menghubungkan lagi kapan saja tanpa
              scan ulang.
            </span>
          )
        }
        onConfirm={() => disconnect(confirmMode === 'wipe')}
      />
    </TooltipProvider>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
