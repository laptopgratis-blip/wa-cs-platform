'use client'

// Pixel Tracking management — 3 platform cards (Meta, Google Ads, TikTok)
// dengan dialog setup. Phase 1: full CRUD + test event Meta. Google Ads &
// TikTok server-side test menyusul di Phase 3.
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Edit3,
  FileText,
  Plus,
  TestTube,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PageContainer } from '@/components/shared/PageContainer'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { TONES } from '@/lib/ui-tones'
import {
  PIXEL_PLATFORMS,
  PIXEL_PLATFORM_HELPER,
  PIXEL_PLATFORM_LABELS,
  type PixelPlatform,
} from '@/lib/validations/pixel-integration'

interface PixelItem {
  id: string
  platform: string
  displayName: string
  pixelId: string
  serverSideEnabled: boolean
  accessTokenSet: boolean
  conversionLabelInitiateCheckout: string | null
  conversionLabelLead: string | null
  conversionLabelPurchase: string | null
  testEventCode: string | null
  isTestMode: boolean
  triggerOnBuyerProofUpload: boolean
  triggerOnAdminProofUpload: boolean
  triggerOnAdminMarkPaid: boolean
  isActive: boolean
  totalEvents: number
  lastEventAt: string | null
  createdAt: string
}

interface PixelsClientProps {
  initialItems: PixelItem[]
  limit: number
}

// Inisial platform sebagai avatar huruf — ikon brand tidak tersedia di lucide.
// Warna sengaja seragam (netral): identitas platform dibawa hurufnya, bukan hue.
const PLATFORM_INITIAL: Record<string, string> = {
  META: 'M',
  GOOGLE_ADS: 'G',
  GA4: 'GA',
  TIKTOK: 'T',
}

interface FormState {
  platform: PixelPlatform
  displayName: string
  pixelId: string
  serverSideEnabled: boolean
  accessToken: string
  conversionLabelInitiateCheckout: string
  conversionLabelLead: string
  conversionLabelPurchase: string
  testEventCode: string
  isTestMode: boolean
  triggerOnBuyerProofUpload: boolean
  triggerOnAdminProofUpload: boolean
  triggerOnAdminMarkPaid: boolean
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  platform: 'META',
  displayName: '',
  pixelId: '',
  serverSideEnabled: false,
  accessToken: '',
  conversionLabelInitiateCheckout: '',
  conversionLabelLead: '',
  conversionLabelPurchase: '',
  testEventCode: '',
  isTestMode: false,
  // Default: hanya AdminMarkPaid yang true — preserve behavior pre-fitur.
  triggerOnBuyerProofUpload: false,
  triggerOnAdminProofUpload: false,
  triggerOnAdminMarkPaid: true,
  isActive: true,
}

// Status pemasangan pixel: mati / browser-only / browser + server-side.
function PixelStatusBadge({ item }: { item: PixelItem }) {
  if (!item.isActive) {
    return <StatusBadge tone="neutral" label="Off" />
  }
  if (item.serverSideEnabled && item.accessTokenSet) {
    return (
      <StatusBadge
        tone="success"
        icon={CheckCircle2}
        label="Browser + Server-side"
      />
    )
  }
  return (
    <StatusBadge tone="warning" icon={AlertCircle} label="Browser pixel only" />
  )
}

export function PixelsClient({ initialItems, limit }: PixelsClientProps) {
  const [items, setItems] = useState<PixelItem[]>(initialItems)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
  } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  function openCreate(platform: PixelPlatform) {
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      platform,
      displayName: `${PIXEL_PLATFORM_LABELS[platform]} - Saya`,
    })
    setDialogOpen(true)
  }

  function openEdit(p: PixelItem) {
    setEditingId(p.id)
    setForm({
      platform: p.platform as PixelPlatform,
      displayName: p.displayName,
      pixelId: p.pixelId,
      serverSideEnabled: p.serverSideEnabled,
      accessToken: '', // sengaja kosong — user kalau mau ganti, isi baru
      conversionLabelInitiateCheckout: p.conversionLabelInitiateCheckout ?? '',
      conversionLabelLead: p.conversionLabelLead ?? '',
      conversionLabelPurchase: p.conversionLabelPurchase ?? '',
      testEventCode: p.testEventCode ?? '',
      isTestMode: p.isTestMode,
      triggerOnBuyerProofUpload: p.triggerOnBuyerProofUpload,
      triggerOnAdminProofUpload: p.triggerOnAdminProofUpload,
      triggerOnAdminMarkPaid: p.triggerOnAdminMarkPaid,
      isActive: p.isActive,
    })
    setDialogOpen(true)
  }

  async function refreshList() {
    const res = await fetch('/api/integrations/pixels')
    const data = await res.json()
    if (data.success) setItems(data.data.items)
  }

  async function handleSubmit() {
    if (!form.displayName.trim()) {
      toast.error('Nama integrasi wajib diisi')
      return
    }
    if (!form.pixelId.trim()) {
      toast.error('Pixel ID wajib diisi')
      return
    }
    if (form.serverSideEnabled && !editingId && !form.accessToken.trim()) {
      toast.error(
        'Aktifkan server-side butuh access token. Atau matikan toggle dulu.',
      )
      return
    }

    setSaving(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: Record<string, any> = {
        platform: form.platform,
        displayName: form.displayName.trim(),
        pixelId: form.pixelId.trim(),
        serverSideEnabled: form.serverSideEnabled,
        conversionLabelInitiateCheckout:
          form.conversionLabelInitiateCheckout.trim() || null,
        conversionLabelLead: form.conversionLabelLead.trim() || null,
        conversionLabelPurchase: form.conversionLabelPurchase.trim() || null,
        testEventCode: form.testEventCode.trim() || null,
        isTestMode: form.isTestMode,
        triggerOnBuyerProofUpload: form.triggerOnBuyerProofUpload,
        triggerOnAdminProofUpload: form.triggerOnAdminProofUpload,
        triggerOnAdminMarkPaid: form.triggerOnAdminMarkPaid,
        isActive: form.isActive,
      }
      // accessToken: only include kalau user isi (atau create baru).
      // Skip kalau editing & user tidak isi — server pertahankan existing.
      if (form.accessToken.trim()) {
        payload.accessToken = form.accessToken.trim()
      } else if (!editingId && !form.serverSideEnabled) {
        // create baru tanpa server-side: kirim accessToken null biar bersih
        payload.accessToken = null
      }

      const url = editingId
        ? `/api/integrations/pixels/${editingId}`
        : '/api/integrations/pixels'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        // Toast durasi panjang supaya user sempat baca pesan error
        // (mis. validation Zod / format pixel ID).
        toast.error(data.error ?? 'Gagal menyimpan', { duration: 8_000 })
        console.error('[pixel save]', { status: res.status, body: data })
        return
      }
      await refreshList()
      toast.success(
        editingId ? 'Integrasi diperbarui' : 'Integrasi ditambahkan',
      )
      setDialogOpen(false)
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/integrations/pixels/${deleteTarget.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menghapus')
        return
      }
      setDeleteTarget(null)
      await refreshList()
      toast.success('Integrasi dihapus')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setIsDeleting(false)
    }
  }

  async function handleTest(item: PixelItem) {
    if (!item.serverSideEnabled || !item.accessTokenSet) {
      toast.error(
        'Aktifkan server-side & set access token dulu untuk test event',
      )
      return
    }
    setTesting(item.id)
    try {
      const res = await fetch(`/api/integrations/pixels/${item.id}/test`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal kirim test event')
        return
      }
      if (data.data.succeeded) {
        toast.success(data.data.hint ?? 'Test event terkirim')
      } else {
        // Backend `hint` sudah parse Meta error_user_msg → descriptive.
        // Toast sengaja durasi panjang supaya user sempat baca hint.
        toast.error(
          data.data.hint ??
            data.data.errorMessage ??
            `Status ${data.data.responseStatus} — cek logs.`,
          { duration: 10_000 },
        )
      }
      await refreshList()
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setTesting(null)
    }
  }

  // Group items by platform supaya 1 card per platform tampil dengan list
  // integrasi user (boleh multi-account per platform).
  const itemsByPlatform = PIXEL_PLATFORMS.reduce(
    (acc, p) => {
      acc[p] = items.filter((i) => i.platform === p)
      return acc
    },
    {} as Record<PixelPlatform, PixelItem[]>,
  )

  return (
    <PageContainer>
      <PageHeader
        title="Pixel Tracking"
        description={
          <>
            Pasang pixel iklan untuk track conversion dari Meta, Google, dan
            TikTok. Server-side (CAPI) lebih akurat & tidak terblok adblock.
            <span className="text-warm-500 ml-1">
              ({items.length}/{limit} integrasi)
            </span>
          </>
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/integrations/pixels/logs">
              <FileText className="mr-1 size-4" />
              Lihat Logs
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PIXEL_PLATFORMS.map((platform) => {
          const list = itemsByPlatform[platform]
          return (
            <Card key={platform}>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span
                    aria-hidden
                    className="bg-warm-100 text-warm-700 flex size-7 items-center justify-center rounded-lg text-xs font-semibold"
                  >
                    {PLATFORM_INITIAL[platform] ?? '?'}
                  </span>
                  <h2 className="text-warm-900 font-semibold">
                    {PIXEL_PLATFORM_LABELS[platform]}
                  </h2>
                </div>

                {list.length === 0 ? (
                  <div className="bg-warm-50 mb-3 rounded-lg border border-dashed p-3 text-center">
                    <p className="text-warm-500 text-sm">Belum dipasang</p>
                  </div>
                ) : (
                  <ul className="mb-3 space-y-2">
                    {list.map((item) => (
                      <li
                        key={item.id}
                        className="bg-warm-50 rounded-lg border p-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-warm-900 truncate text-sm font-medium">
                              {item.displayName}
                            </p>
                            <p className="text-warm-600 truncate font-mono text-xs">
                              {item.pixelId}
                            </p>
                          </div>
                          <PixelStatusBadge item={item} />
                        </div>
                        <div className="text-warm-500 mt-1.5 flex items-center justify-between text-xs">
                          <span className="inline-flex items-center gap-1">
                            {item.totalEvents} event
                            {item.lastEventAt &&
                              ` · ${formatRelativeTime(item.lastEventAt)}`}
                            {item.isTestMode && (
                              <>
                                {' · '}
                                <TestTube className="size-3" aria-hidden /> Test
                                mode
                              </>
                            )}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => openEdit(item)}
                          >
                            <Edit3 className="mr-1 size-3" /> Edit
                          </Button>
                          {item.serverSideEnabled && item.accessTokenSet && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleTest(item)}
                              disabled={testing === item.id}
                            >
                              <TestTube className="mr-1 size-3" />
                              {testing === item.id ? 'Testing…' : 'Test'}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:bg-destructive/10 h-7 px-2 text-xs"
                            onClick={() =>
                              setDeleteTarget({
                                id: item.id,
                                name: item.displayName,
                              })
                            }
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => openCreate(platform)}
                  disabled={items.length >= limit}
                >
                  <Plus className="mr-1 size-4" />
                  Setup {PIXEL_PLATFORM_LABELS[platform]}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div
        className={`rounded-lg border p-4 text-sm ${TONES.info.border} ${TONES.info.bg} ${TONES.info.text}`}
      >
        <p className="flex items-center gap-2 font-semibold">
          <Activity className="size-4" />
          Cara kerja
        </p>
        <ul className="mt-2 space-y-1">
          <li>
            • <strong>Browser pixel</strong>: script otomatis terpasang di Form
            Order publik. Track PageView, ViewContent, AddToCart,
            InitiateCheckout, Purchase di sisi customer.
          </li>
          <li>
            • <strong>Server-side (CAPI)</strong>: server kami kirim event
            langsung ke Meta/TikTok. Lebih akurat — tidak terblok adblock, tidak
            hilang saat customer block cookies.
          </li>
          <li>
            • <strong>COD</strong>: Purchase fire saat order dibuat.
          </li>
          <li>
            • <strong>Transfer</strong>: Lead fire saat order dibuat. Purchase
            fire sesuai trigger yang kamu pilih per-pixel (upload bukti pembeli,
            upload bukti admin, atau saat di-tandai PAID).
          </li>
        </ul>
      </div>

      {/* Setup/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg lg:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit' : 'Setup'}{' '}
              {PIXEL_PLATFORM_LABELS[form.platform]}
            </DialogTitle>
            <DialogDescription>
              {PIXEL_PLATFORM_HELPER[form.platform].pixelIdHelp}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="px-name">Nama Integrasi</Label>
              <Input
                id="px-name"
                value={form.displayName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, displayName: e.target.value }))
                }
                placeholder="Mis. Meta - Akun Cleanoz"
              />
              <p className="text-warm-500 text-xs">
                Untuk identifikasi di list — bukan dipakai oleh platform.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="px-id">
                {PIXEL_PLATFORM_HELPER[form.platform].pixelIdLabel}
              </Label>
              <Input
                id="px-id"
                value={form.pixelId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, pixelId: e.target.value }))
                }
                className="font-mono"
                placeholder={
                  form.platform === 'META'
                    ? '1234567890123456'
                    : form.platform === 'GOOGLE_ADS'
                      ? 'AW-1234567890'
                      : form.platform === 'GA4'
                        ? 'G-XXXXXXXXXX'
                        : 'C12ABC34DEF56'
                }
              />
            </div>

            <div className="border-primary-200 bg-primary-50 space-y-3 rounded-lg border-2 p-3">
              <div className="flex items-center justify-between">
                <Label className="text-primary-900 cursor-pointer text-sm font-semibold">
                  Aktifkan Server-side ({form.platform === 'META' && 'CAPI'}
                  {form.platform === 'TIKTOK' && 'Events API'}
                  {(form.platform === 'GOOGLE_ADS' ||
                    form.platform === 'GA4') &&
                    'Measurement Protocol'}
                  )
                </Label>
                <Switch
                  checked={form.serverSideEnabled}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, serverSideEnabled: v }))
                  }
                />
              </div>
              <p className="text-primary-800 text-xs">
                Direkomendasikan — tracking lebih akurat & tidak terblok adblock
                customer.
              </p>

              {form.serverSideEnabled && (
                <div className="space-y-1.5">
                  <Label htmlFor="px-token" className="text-primary-900">
                    Access Token
                  </Label>
                  {/* Status badge — kasih user kepastian token sudah ke-save atau belum.
                      Ini menghilangkan kebingungan "kok field kosong, berarti tidak tersimpan?"
                      Field SENGAJA kosong saat edit supaya tidak overwrite kalau user tidak isi. */}
                  {editingId &&
                    (() => {
                      const existing = items.find((i) => i.id === editingId)
                      if (existing?.accessTokenSet) {
                        return (
                          <div
                            className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs ${TONES.success.border} ${TONES.success.bg} ${TONES.success.text}`}
                          >
                            <span className="flex items-center gap-1.5">
                              <CheckCircle2 className="size-3.5" />
                              <strong>Token sudah tersimpan</strong>{' '}
                              (terenkripsi)
                            </span>
                            <span>
                              Kosongkan field di bawah jika tidak ingin diganti
                            </span>
                          </div>
                        )
                      }
                      return (
                        <div
                          className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs ${TONES.warning.border} ${TONES.warning.bg} ${TONES.warning.text}`}
                        >
                          <AlertCircle className="size-3.5" />
                          <strong>Token belum di-set</strong> — server-side
                          belum akan jalan tanpa token
                        </div>
                      )
                    })()}
                  <Input
                    id="px-token"
                    type="password"
                    value={form.accessToken}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, accessToken: e.target.value }))
                    }
                    placeholder={
                      editingId
                        ? 'Paste token BARU di sini (atau kosongkan untuk pertahankan yang lama)'
                        : 'Paste token di sini'
                    }
                    autoComplete="off"
                  />
                  <p className="text-primary-800 text-xs">
                    {PIXEL_PLATFORM_HELPER[form.platform].tokenHelp}
                  </p>
                </div>
              )}
            </div>

            {form.platform === 'GOOGLE_ADS' && (
              <div className="bg-warm-50 space-y-3 rounded-lg border p-3">
                <p className="text-warm-900 text-sm font-semibold">
                  Conversion Labels
                </p>
                <p className="text-warm-600 text-xs">
                  Buat 3 conversion action di Google Ads, copy label-nya ke
                  sini.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="g-init">Initiate Checkout</Label>
                  <Input
                    id="g-init"
                    value={form.conversionLabelInitiateCheckout}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        conversionLabelInitiateCheckout: e.target.value,
                      }))
                    }
                    placeholder="aabb-cdef"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="g-lead">Lead</Label>
                  <Input
                    id="g-lead"
                    value={form.conversionLabelLead}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        conversionLabelLead: e.target.value,
                      }))
                    }
                    placeholder="xxxx-yyyy"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="g-purchase">Purchase</Label>
                  <Input
                    id="g-purchase"
                    value={form.conversionLabelPurchase}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        conversionLabelPurchase: e.target.value,
                      }))
                    }
                    placeholder="1111-2222"
                  />
                </div>
              </div>
            )}

            {form.platform === 'META' && (
              <div className="bg-warm-50 space-y-3 rounded-lg border p-3">
                <p className="text-warm-900 text-sm font-semibold">
                  Test Event (opsional)
                </p>
                <p className="text-warm-600 text-xs">
                  Sebelum live, kirim event ke Test Events Tool dulu. Aktifkan
                  test mode supaya semua event di-mark sebagai test.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="meta-test">Test Event Code</Label>
                  <Input
                    id="meta-test"
                    value={form.testEventCode}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        testEventCode: e.target.value,
                      }))
                    }
                    placeholder="TEST12345"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="cursor-pointer text-sm">
                    Test Mode (semua event masuk Test Events Tool)
                  </Label>
                  <Switch
                    checked={form.isTestMode}
                    onCheckedChange={(v) =>
                      setForm((f) => ({ ...f, isTestMode: v }))
                    }
                  />
                </div>
              </div>
            )}

            <div className="border-primary-200 bg-primary-50 space-y-3 rounded-lg border-2 p-3">
              <div>
                <p className="text-primary-900 text-sm font-semibold">
                  Kapan event <span className="font-mono">Purchase</span>{' '}
                  di-fire?
                </p>
                <p className="text-primary-800 mt-0.5 text-xs">
                  Untuk metode TRANSFER, pilih satu atau lebih momen di bawah.
                  Order COD selalu fire Purchase saat dibuat (tidak
                  terpengaruh). Dedup otomatis — order yang sama tidak di-fire
                  dobel.
                </p>
              </div>

              <label className="border-primary-200 hover:bg-primary-50/50 flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2 transition">
                <input
                  type="checkbox"
                  checked={form.triggerOnBuyerProofUpload}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      triggerOnBuyerProofUpload: e.target.checked,
                    }))
                  }
                  className="accent-primary-500 mt-0.5 size-4 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-warm-900 text-sm font-medium">
                    Bukti transfer diupload oleh pembeli
                  </p>
                  <p className="text-warm-600 text-xs">
                    Paling cepat — fire saat pembeli upload bukti via halaman
                    invoice (status jadi WAITING_CONFIRMATION). Belum
                    diverifikasi admin.
                  </p>
                </div>
              </label>

              <label className="border-primary-200 hover:bg-primary-50/50 flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2 transition">
                <input
                  type="checkbox"
                  checked={form.triggerOnAdminProofUpload}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      triggerOnAdminProofUpload: e.target.checked,
                    }))
                  }
                  className="accent-primary-500 mt-0.5 size-4 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-warm-900 text-sm font-medium">
                    Bukti transfer diupload oleh admin sendiri
                  </p>
                  <p className="text-warm-600 text-xs">
                    Saat admin terima bukti via WA/email lalu input manual URL
                    bukti di dialog detail order.
                  </p>
                </div>
              </label>

              <label className="border-primary-200 hover:bg-primary-50/50 flex cursor-pointer items-start gap-2 rounded-md border bg-white px-3 py-2 transition">
                <input
                  type="checkbox"
                  checked={form.triggerOnAdminMarkPaid}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      triggerOnAdminMarkPaid: e.target.checked,
                    }))
                  }
                  className="accent-primary-500 mt-0.5 size-4 cursor-pointer"
                />
                <div className="flex-1">
                  <p className="text-warm-900 text-sm font-medium">
                    Order ditandai PAID oleh admin
                  </p>
                  <p className="text-warm-600 text-xs">
                    Paling akurat — fire saat admin konfirmasi pembayaran valid
                    & ubah status ke PAID.{' '}
                    <span className="font-semibold">
                      Default direkomendasikan.
                    </span>
                  </p>
                </div>
              </label>

              {!form.triggerOnBuyerProofUpload &&
                !form.triggerOnAdminProofUpload &&
                !form.triggerOnAdminMarkPaid && (
                  <div
                    className={`flex items-start gap-1.5 rounded-md border px-3 py-2 text-xs ${TONES.warning.border} ${TONES.warning.bg} ${TONES.warning.text}`}
                  >
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                    Tidak ada trigger aktif — Purchase TIDAK akan pernah di-fire
                    ke pixel ini untuk order TRANSFER.
                  </div>
                )}
            </div>

            <div className="bg-warm-50 flex items-center justify-between rounded-lg border px-3 py-2">
              <Label className="cursor-pointer text-sm">
                Aktif (tampil sebagai pilihan di Form Order)
              </Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Batal
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
        title={`Hapus integrasi "${deleteTarget?.name ?? ''}"?`}
        description="Pixel berhenti track conversion dari form order yang memakainya."
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </PageContainer>
  )
}
