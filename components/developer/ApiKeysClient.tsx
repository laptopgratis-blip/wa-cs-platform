'use client'

// Pengelola kunci API seller. Kunci mentah hanya muncul SEKALI (respons POST),
// jadi dialog buat-kunci punya dua mode: form → tampilan "salin sekarang".
import { Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge, type StatusTone } from '@/components/shared/StatusBadge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
// Impor dari file validasi, BUKAN dari lib/services/seller-api-keys — service
// itu menarik Prisma dan tidak boleh masuk bundle browser.
import { MAX_ACTIVE_KEYS_PER_USER } from '@/lib/validations/seller-api-key'

interface ApiKeyRow {
  id: string
  name: string
  maskedKey: string
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  isActive: boolean
}

const dateFmt = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return dateFmt.format(new Date(iso))
}

function statusOf(k: ApiKeyRow): { tone: StatusTone; label: string } {
  if (k.revokedAt) return { tone: 'neutral', label: 'Dicabut' }
  if (!k.isActive) return { tone: 'warning', label: 'Kedaluwarsa' }
  return { tone: 'success', label: 'Aktif' }
}

/** Copy dengan fallback: Clipboard API butuh secure context (https/localhost). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // jatuh ke fallback di bawah
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
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

interface ApiKeysClientProps {
  /** Daftar awal dari server — hindari fetch di useEffect (aturan lint repo). */
  initialKeys: ApiKeyRow[]
}

export function ApiKeysClient({ initialKeys }: ApiKeysClientProps) {
  const [keys, setKeys] = useState<ApiKeyRow[]>(initialKeys)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [expiry, setExpiry] = useState<string>('null')
  const [creating, setCreating] = useState(false)
  const [plainKey, setPlainKey] = useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null)
  const [revoking, setRevoking] = useState(false)

  const reload = async () => {
    try {
      const res = await fetch('/api/pengembang/api-keys')
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Gagal memuat daftar kunci')
      setKeys(json.data.keys)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const activeCount = keys.filter((k) => !k.revokedAt).length

  const handleCreate = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/pengembang/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          expiresInDays: expiry === 'null' ? null : Number(expiry),
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Gagal membuat kunci')
      setPlainKey(json.data.plainKey)
      await reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      const res = await fetch(`/api/pengembang/api-keys/${revokeTarget.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error ?? 'Gagal mencabut kunci')
      toast.success(`Kunci "${revokeTarget.name}" dicabut`)
      setRevokeTarget(null)
      await reload()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRevoking(false)
    }
  }

  const resetForm = () => {
    setPlainKey(null)
    setName('')
    setExpiry('null')
  }

  const closeDialog = () => {
    setDialogOpen(false)
    // Reset ditunda supaya teks tidak berkedip saat dialog menutup.
    setTimeout(resetForm, 200)
  }

  const openDialog = () => {
    // Reset SINKRON di sini juga: kalau user menutup tampilan kunci lalu
    // membuka dialog lagi dalam 200 ms, timeout di atas belum jalan dan dialog
    // akan terbuka menampilkan kunci lama yang tadi sudah "disimpan".
    resetForm()
    setDialogOpen(true)
  }

  return (
    <Card className="rounded-xl border-warm-200">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold text-warm-900 dark:text-warm-50">
              Kunci API
            </h2>
            <p className="text-sm text-warm-500">
              {activeCount} dari {MAX_ACTIVE_KEYS_PER_USER} kunci aktif terpakai.
            </p>
          </div>
          <Button
            onClick={openDialog}
            disabled={activeCount >= MAX_ACTIVE_KEYS_PER_USER}
          >
            <Plus className="mr-2 size-4" /> Buat Kunci
          </Button>
        </div>

        {keys.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="Belum ada kunci API"
            description="Buat kunci pertama untuk menghubungkan n8n, Zapier, atau skrip sendiri ke akunmu."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Kunci</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead>Terakhir dipakai</TableHead>
                  <TableHead>Kedaluwarsa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((k) => {
                  const st = statusOf(k)
                  return (
                    <TableRow key={k.id}>
                      <TableCell className="font-medium">{k.name}</TableCell>
                      <TableCell className="font-mono text-xs">{k.maskedKey}</TableCell>
                      <TableCell className="text-sm text-warm-500">{fmtDate(k.createdAt)}</TableCell>
                      <TableCell
                        className="text-sm text-warm-500"
                        title="Diperbarui maksimal sekali tiap 5 menit"
                      >
                        {fmtDate(k.lastUsedAt)}
                      </TableCell>
                      <TableCell className="text-sm text-warm-500">
                        {k.expiresAt ? fmtDate(k.expiresAt) : 'Tidak pernah'}
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={st.tone} label={st.label} />
                      </TableCell>
                      <TableCell className="text-right">
                        {!k.revokedAt && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setRevokeTarget(k)}
                          >
                            <Trash2 className="size-4" />
                            <span className="sr-only">Cabut kunci {k.name}</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={(o) => (o ? openDialog() : closeDialog())}>
        <DialogContent>
          {plainKey ? (
            <>
              <DialogHeader>
                <DialogTitle>Kunci API berhasil dibuat</DialogTitle>
                <DialogDescription>
                  Salin sekarang — kunci ini tidak akan bisa dilihat lagi setelah dialog ditutup.
                </DialogDescription>
              </DialogHeader>
              <Alert variant="destructive">
                <AlertTitle>Simpan di tempat aman</AlertTitle>
                <AlertDescription>
                  Siapa pun yang punya kunci ini bisa membaca data akunmu. Simpan di credential
                  store (n8n/Zapier), jangan di URL atau kode publik.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Input readOnly value={plainKey} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    const ok = await copyText(plainKey)
                    if (ok) toast.success('Kunci disalin')
                    else toast.error('Gagal menyalin — pilih teksnya lalu salin manual')
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={closeDialog}>Saya sudah menyimpannya</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Buat Kunci API</DialogTitle>
                <DialogDescription>
                  Beri nama sesuai tempat pemakaiannya supaya mudah dicabut kalau bocor.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="key-name">Nama kunci</Label>
                  <Input
                    id="key-name"
                    value={name}
                    maxLength={60}
                    placeholder="Contoh: n8n produksi"
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="key-expiry">Masa berlaku</Label>
                  <Select value={expiry} onValueChange={setExpiry}>
                    <SelectTrigger id="key-expiry">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="null">Tidak pernah kedaluwarsa</SelectItem>
                      <SelectItem value="30">30 hari</SelectItem>
                      <SelectItem value="90">90 hari</SelectItem>
                      <SelectItem value="365">1 tahun</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog} disabled={creating}>
                  Batal
                </Button>
                <Button onClick={handleCreate} disabled={creating || name.trim().length < 2}>
                  {creating && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Buat Kunci
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revokeTarget !== null}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title={`Cabut kunci "${revokeTarget?.name ?? ''}"?`}
        description="Integrasi yang masih memakai kunci ini akan langsung gagal dengan error 401. Kunci yang sudah dicabut tidak bisa diaktifkan lagi."
        confirmLabel="Ya, Cabut"
        isLoading={revoking}
        onConfirm={handleRevoke}
      />
    </Card>
  )
}
