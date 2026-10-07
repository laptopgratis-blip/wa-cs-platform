'use client'

// Ringkasan pratinjau impor kontak (hasil dryRun /api/contacts/import):
// angka valid/tidak valid/duplikat/sudah ada + contoh alasan baris gagal.
import { AlertTriangle } from 'lucide-react'

import type { ImportPreview } from '@/components/contacts/types'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-warm-900 text-xl font-semibold tabular-nums">
        {value.toLocaleString('id-ID')}
      </p>
    </div>
  )
}

export function ImportPreviewSummary({ preview }: { preview: ImportPreview }) {
  const newCount = Math.max(0, preview.validCount - preview.existingInSession)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Nomor valid" value={preview.validCount} />
        <Stat label="Tidak valid" value={preview.invalidCount} />
        <Stat label="Duplikat di file" value={preview.duplicatesInFile} />
        <Stat label="Sudah ada di nomor ini" value={preview.existingInSession} />
      </div>

      <p className="text-warm-700 text-sm">
        {newCount.toLocaleString('id-ID')} kontak baru akan dibuat
        {preview.existingInSession > 0
          ? `; ${preview.existingInSession.toLocaleString('id-ID')} kontak lama hanya ditambah tag "${preview.tag}" (nama diisi bila masih kosong).`
          : ` dengan tag "${preview.tag}".`}
      </p>

      {preview.suppressedElsewhere > 0 && (
        <p className="text-warm-700 text-sm">
          {preview.suppressedElsewhere.toLocaleString('id-ID')} nomor diblokir atau berhenti
          langganan di nomor WhatsApp lain Anda — kontak barunya ikut ditandai sehingga tidak
          menerima broadcast.
        </p>
      )}

      <p className="text-muted-foreground text-xs">
        Kontak baru masuk stage Baru. Broadcast yang menargetkan stage Baru — termasuk yang
        sudah terjadwal — ikut menjangkau mereka; pakai tag impor untuk menargetkan secara
        terpisah.
      </p>

      {preview.truncated && (
        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border p-3 text-sm',
            TONES.warning.bg,
            TONES.warning.border,
            TONES.warning.text,
          )}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Data berisi {preview.totalRows.toLocaleString('id-ID')} baris — hanya{' '}
            {preview.maxRows.toLocaleString('id-ID')} baris pertama yang diproses. Pecah
            file sisanya lalu impor lagi.
          </span>
        </div>
      )}

      {preview.validSample.length > 0 && (
        <div className="space-y-2">
          <p className="text-warm-700 text-sm font-medium">Contoh kontak terbaca</p>
          <ul className="text-muted-foreground space-y-1 text-sm">
            {preview.validSample.map((c) => (
              <li key={c.phone}>
                {c.name ?? 'Tanpa nama'} · {c.phone}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.invalidSample.length > 0 && (
        <div className="space-y-2">
          <p className="text-warm-700 text-sm font-medium">
            Baris tidak valid (dilewati)
            {preview.invalidCount > preview.invalidSample.length &&
              ` — menampilkan ${preview.invalidSample.length} dari ${preview.invalidCount.toLocaleString('id-ID')}`}
          </p>
          <div className="max-h-48 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[70px]">Baris</TableHead>
                  <TableHead>Isi kolom nomor</TableHead>
                  <TableHead>Alasan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.invalidSample.map((r) => (
                  <TableRow key={`${r.line}-${r.raw}`}>
                    <TableCell className="tabular-nums">{r.line}</TableCell>
                    <TableCell className="max-w-[160px] truncate">{r.raw || '—'}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-normal">
                      {r.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
