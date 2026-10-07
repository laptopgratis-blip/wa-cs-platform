'use client'

// Dialog "Impor Kontak": CSV upload / tempel dari spreadsheet → satu nomor WA.
// Alur 2 langkah: Periksa (dryRun, tanpa menulis) → Impor N kontak.
// Kontak hasil impor diberi tag supaya bisa dipilih sebagai target Broadcast.
import { Loader2, Upload } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { toast } from 'sonner'

import { ImportPreviewSummary } from '@/components/contacts/ImportPreviewSummary'
import type {
  ImportPreview,
  ImportResult,
  ImportSessionOption,
} from '@/components/contacts/types'
import { Button } from '@/components/ui/button'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { fetchJson } from '@/lib/fetch-json'
import { ymdInJakarta } from '@/lib/services/contacts/import-parse'

// Selaras dengan batas server (CONTACT_IMPORT_MAX_CHARS ≈ 2 MB).
const MAX_FILE_BYTES = 2 * 1024 * 1024
const EXCEL_EXT_RE = /\.(xlsx|xls|ods|numbers)$/i

type Mode = 'paste' | 'file'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessions: ImportSessionOption[]
  onImported: () => void
}

function sessionLabel(s: ImportSessionOption): string {
  const name = s.displayName || (s.phoneNumber ? `+${s.phoneNumber}` : 'Nomor tanpa nama')
  const phone = s.displayName && s.phoneNumber ? ` (+${s.phoneNumber})` : ''
  const kind = s.provider === 'CLOUD_API' ? 'Meta Cloud API' : 'WhatsApp Web'
  return `${name}${phone} · ${kind}`
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error ?? new Error('Gagal membaca file'))
    reader.readAsText(file)
  })
}

function defaultTag(): string {
  return `impor-${ymdInJakarta(new Date())}`
}

export function ImportContactsDialog({ open, onOpenChange, sessions, onImported }: Props) {
  const [sessionId, setSessionId] = useState(sessions.length === 1 ? (sessions[0]?.id ?? '') : '')
  const [mode, setMode] = useState<Mode>('paste')
  const [pasteText, setPasteText] = useState('')
  const [file, setFile] = useState<{ name: string; text: string } | null>(null)
  const [tag, setTag] = useState(defaultTag)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [isChecking, setChecking] = useState(false)
  const [isImporting, setImporting] = useState(false)

  const busy = isChecking || isImporting
  const text = mode === 'file' ? (file?.text ?? '') : pasteText
  const canCheck = Boolean(sessionId) && text.trim().length > 0 && !busy

  function reset() {
    setSessionId(sessions.length === 1 ? (sessions[0]?.id ?? '') : '')
    setMode('paste')
    setPasteText('')
    setFile(null)
    setTag(defaultTag())
    setPreview(null)
  }

  function handleOpenChange(next: boolean) {
    if (busy) return
    if (!next) reset()
    onOpenChange(next)
  }

  async function handleFile(selected: File | undefined) {
    setPreview(null)
    if (!selected) {
      setFile(null)
      return
    }
    if (EXCEL_EXT_RE.test(selected.name)) {
      toast.error('File Excel belum didukung — simpan dulu sebagai CSV (File → Download/Save As → CSV).')
      return
    }
    if (selected.size > MAX_FILE_BYTES) {
      toast.error('File terlalu besar — maksimal 2 MB. Pecah jadi beberapa file.')
      return
    }
    try {
      setFile({ name: selected.name, text: await readFileText(selected) })
    } catch (err) {
      console.error('[ImportContactsDialog] gagal membaca file:', err)
      toast.error('File tidak bisa dibaca — pastikan formatnya CSV atau teks.')
    }
  }

  async function submit(dryRun: boolean) {
    return fetchJson<{ success: boolean; data?: ImportPreview | ImportResult }>(
      '/api/contacts/import',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, tag, text, dryRun }),
      },
      dryRun ? 'Gagal memeriksa data kontak' : 'Gagal mengimpor kontak',
    )
  }

  async function handleCheck() {
    if (!canCheck) return
    setChecking(true)
    const r = await submit(true)
    setChecking(false)
    if (!r.ok || !r.data?.data) {
      toast.error(r.error ?? 'Gagal memeriksa data kontak')
      return
    }
    const next = r.data.data as ImportPreview
    setPreview(next)
    setTag(next.tag)
  }

  async function handleImport() {
    if (!preview || preview.validCount === 0 || busy) return
    setImporting(true)
    const r = await submit(false)
    setImporting(false)
    if (!r.ok || !r.data?.data) {
      toast.error(r.error ?? 'Gagal mengimpor kontak')
      return
    }
    const res = r.data.data as ImportResult
    const parts = [`${res.created.toLocaleString('id-ID')} kontak baru diimpor`]
    if (res.updatedExisting > 0) {
      parts.push(`${res.updatedExisting.toLocaleString('id-ID')} kontak lama diperbarui`)
    }
    if (res.invalidCount > 0) {
      parts.push(`${res.invalidCount.toLocaleString('id-ID')} baris dilewati`)
    }
    toast.success(`${parts.join(', ')}. Tag: ${res.tag}`)
    onImported()
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Impor Kontak</DialogTitle>
          <DialogDescription>
            Masukkan database pelanggan lama ke salah satu nomor WhatsApp supaya bisa
            dijangkau lewat Broadcast.
          </DialogDescription>
        </DialogHeader>

        {sessions.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Belum ada nomor WhatsApp aktif.{' '}
            <Link href="/whatsapp" className="text-primary-600 underline underline-offset-3">
              Hubungkan nomor dulu
            </Link>{' '}
            lalu kembali ke sini.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-session">Nomor WhatsApp tujuan</Label>
              <Select
                value={sessionId}
                onValueChange={(v) => {
                  setSessionId(v)
                  setPreview(null)
                }}
                disabled={busy}
              >
                <SelectTrigger id="import-session" className="w-full">
                  <SelectValue placeholder="Pilih nomor WhatsApp" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {sessionLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Kontak hanya ditambahkan ke nomor ini — kontak di nomor lain tidak berubah.
              </p>
            </div>

            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as Mode)
                setPreview(null)
              }}
            >
              <TabsList>
                <TabsTrigger value="paste" disabled={busy}>
                  Tempel dari spreadsheet
                </TabsTrigger>
                <TabsTrigger value="file" disabled={busy}>
                  Unggah file CSV
                </TabsTrigger>
              </TabsList>
              <TabsContent value="paste" className="space-y-2">
                <Label htmlFor="import-paste" className="sr-only">
                  Data kontak
                </Label>
                <Textarea
                  id="import-paste"
                  value={pasteText}
                  onChange={(e) => {
                    setPasteText(e.target.value)
                    setPreview(null)
                  }}
                  disabled={busy}
                  placeholder={'Nama\tNomor\nBudi\t081234567890\nSiti\t+62 812 9876 5432'}
                  className="max-h-48 min-h-32 font-mono"
                />
              </TabsContent>
              <TabsContent value="file" className="space-y-2">
                <Label htmlFor="import-file">File CSV atau TXT (maks 2 MB)</Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".csv,.txt,.tsv,text/csv,text/plain,text/tab-separated-values"
                  disabled={busy}
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                />
                {file && <p className="text-muted-foreground text-xs">Terbaca: {file.name}</p>}
              </TabsContent>
            </Tabs>
            <p className="text-muted-foreground text-xs">
              Dari Google Sheets/Excel: salin kolom Nama &amp; Nomor lalu tempel, atau File →
              Download → CSV. Nomor boleh 08…, 62…, atau +62…; nomor luar negeri wajib +kode
              negara.
            </p>

            <div className="space-y-2">
              <Label htmlFor="import-tag">Tag</Label>
              <Input
                id="import-tag"
                value={tag}
                maxLength={30}
                onChange={(e) => {
                  setTag(e.target.value)
                  setPreview(null)
                }}
                disabled={busy}
              />
              <p className="text-muted-foreground text-xs">
                Semua kontak di impor ini diberi tag ini — pilih tag yang sama sebagai target di
                Broadcast.
              </p>
            </div>

            <p className="text-muted-foreground text-xs">
              Pastikan kontak pernah setuju dihubungi — kebijakan Meta; laporan spam bisa
              menurunkan kualitas nomor.
            </p>

            {preview && <ImportPreviewSummary preview={preview} />}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={busy}>
            Batal
          </Button>
          {sessions.length > 0 && (
            <Button
              variant={preview ? 'outline' : 'default'}
              onClick={() => void handleCheck()}
              disabled={!canCheck}
            >
              {isChecking && <Loader2 className="animate-spin" />}
              {isChecking ? 'Memuat…' : preview ? 'Periksa ulang' : 'Periksa'}
            </Button>
          )}
          {preview && (
            <Button
              onClick={() => void handleImport()}
              disabled={busy || preview.validCount === 0}
            >
              {isImporting ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Upload />
              )}
              Impor {preview.validCount.toLocaleString('id-ID')} kontak
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
