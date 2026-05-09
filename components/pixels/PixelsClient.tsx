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

import { Badge } from '@/components/ui/badge'
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
  isActive: boolean
  totalEvents: number
  lastEventAt: string | null
  createdAt: string
}

interface PixelsClientProps {
  initialItems: PixelItem[]
  limit: number
}

const PLATFORM_EMOJI: Record<string, string> = {
  META: '📘',
  GOOGLE_ADS: '🎯',
  GA4: '📊',
  TIKTOK: '🎵',
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
  isActive: true,
}

function StatusBadge({ item }: { item: PixelItem }) {
  if (!item.isActive) {
    return <Badge variant="secondary">Off</Badge>
  }
  if (item.serverSideEnabled && item.accessTokenSet) {
    return (
      <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
        <CheckCircle2 className="mr-1 size-3" />
        Browser + Server-side
      </Badge>
    )
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
      <AlertCircle className="mr-1 size-3" />
      Browser pixel only
    </Badge>
  )
}

export function PixelsClient({ initialItems, limit }: PixelsClientProps) {
  const [items, setItems] = useState<PixelItem[]>(initialItems)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)

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
      accessToken: '',  // sengaja kosong — user kalau mau ganti, isi baru
      conversionLabelInitiateCheckout: p.conversionLabelInitiateCheckout ?? '',
      conversionLabelLead: p.conversionLabelLead ?? '',
      conversionLabelPurchase: p.conversionLabelPurchase ?? '',
      testEventCode: p.testEventCode ?? '',
      isTestMode: p.isTestMode,
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
        toast.error(data.error ?? 'Gagal menyimpan')
        return
      }
      await refreshList()
      toast.success(editingId ? 'Integrasi diperbarui' : 'Integrasi ditambahkan')
      setDialogOpen(false)
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Hapus integrasi "${name}"?`)) return
    try {
      const res = await fetch(`/api/integrations/pixels/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        toast.error(data.error ?? 'Gagal menghapus')
        return
      }
      await refreshList()
      toast.success('Integrasi dihapus')
    } catch {
      toast.error('Terjadi kesalahan jaringan')
    }
  }

  async function handleTest(item: PixelItem) {
    if (!item.serverSideEnabled || !item.accessTokenSet) {
      toast.error('Aktifkan server-side & set access token dulu untuk test event')
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
    <div className="container mx-auto max-w-5xl px-4 py-6 md:py-8">
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-warm-900 md:text-3xl">
            Pixel Tracking
          </h1>
          <p className="mt-1 text-sm text-warm-600">
            Pasang pixel iklan untuk track conversion dari Meta, Google, dan
            TikTok. Server-side (CAPI) lebih akurat & tidak terblok adblock.
            <span className="ml-1 text-warm-500">
              ({items.length}/{limit} integrasi)
            </span>
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/integrations/pixels/logs">
            <FileText className="mr-1 size-4" />
            Lihat Logs
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PIXEL_PLATFORMS.map((platform) => {
          const list = itemsByPlatform[platform]
          return (
            <Card key={platform}>
              <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-xl">{PLATFORM_EMOJI[platform]}</span>
                  <h2 className="font-semibold text-warm-900">
                    {PIXEL_PLATFORM_LABELS[platform]}
                  </h2>
                </div>

                {list.length === 0 ? (
                  <div className="mb-3 rounded-lg border border-dashed bg-warm-50 p-3 text-center">
                    <p className="text-sm text-warm-600">⚪ Belum dipasang</p>
                  </div>
                ) : (
                  <ul className="mb-3 space-y-2">
                    {list.map((item) => (
                      <li
                        key={item.id}
                        className="rounded-lg border bg-warm-50 p-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-warm-900">
                              {item.displayName}
                            </p>
                            <p className="truncate font-mono text-xs text-warm-600">
                              {item.pixelId}
                            </p>
                          </div>
                          <StatusBadge item={item} />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-xs text-warm-500">
                          <span>
                            {item.totalEvents} event
                            {item.lastEventAt &&
                              ` · ${formatRelativeTime(item.lastEventAt)}`}
                            {item.isTestMode && ' · 🧪 Test mode'}
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
                            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              handleDelete(item.id, item.displayName)
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

      <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p className="flex items-center gap-2 font-semibold">
          <Activity className="size-4" />
          Cara kerja
        </p>
        <ul className="mt-2 space-y-1 text-blue-800">
          <li>
            • <strong>Browser pixel</strong>: script otomatis terpasang di Form
            Order publik. Track PageView, ViewContent, AddToCart,
            InitiateCheckout, Purchase di sisi customer.
          </li>
          <li>
            • <strong>Server-side (CAPI)</strong>: server kami kirim event
            langsung ke Meta/TikTok. Lebih akurat — tidak terblok adblock,
            tidak hilang saat customer block cookies.
          </li>
          <li>
            • <strong>COD</strong> fire Purchase saat order dibuat.{' '}
            <strong>Transfer</strong> fire Lead saat dibuat, lalu Purchase
            saat kamu konfirmasi PAID.
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
              <p className="text-xs text-warm-500">
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

            <div className="space-y-3 rounded-lg border-2 border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer text-sm font-semibold text-emerald-900">
                  Aktifkan Server-side ({form.platform === 'META' && 'CAPI'}
                  {form.platform === 'TIKTOK' && 'Events API'}
                  {(form.platform === 'GOOGLE_ADS' || form.platform === 'GA4') &&
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
              <p className="text-xs text-emerald-800">
                Direkomendasikan — tracking lebih akurat & tidak terblok
                adblock customer.
              </p>

              {form.serverSideEnabled && (
                <div className="space-y-1.5">
                  <Label htmlFor="px-token" className="text-emerald-900">
                    Access Token{editingId && ' (kosongkan jika tidak diubah)'}
                  </Label>
                  <Input
                    id="px-token"
                    type="password"
                    value={form.accessToken}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, accessToken: e.target.value }))
                    }
                    placeholder={editingId ? '•••• (existing)' : 'Paste token di sini'}
                    autoComplete="off"
                  />
                  <p className="text-xs text-emerald-800">
                    {PIXEL_PLATFORM_HELPER[form.platform].tokenHelp}
                  </p>
                </div>
              )}
            </div>

            {form.platform === 'GOOGLE_ADS' && (
              <div className="space-y-3 rounded-lg border bg-warm-50 p-3">
                <p className="text-sm font-semibold text-warm-900">
                  Conversion Labels
                </p>
                <p className="text-xs text-warm-600">
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
              <div className="space-y-3 rounded-lg border bg-warm-50 p-3">
                <p className="text-sm font-semibold text-warm-900">
                  Test Event (opsional)
                </p>
                <p className="text-xs text-warm-600">
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

            <div className="flex items-center justify-between rounded-lg border bg-warm-50 px-3 py-2">
              <Label className="cursor-pointer text-sm">
                Aktif (tampil sebagai pilihan di Form Order)
              </Label>
              <Switch
                checked={form.isActive}
                onCheckedChange={(v) =>
                  setForm((f) => ({ ...f, isActive: v }))
                }
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
    </div>
  )
}
