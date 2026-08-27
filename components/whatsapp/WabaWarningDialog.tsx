'use client'

// Popup "Perhatian Sebelum Menghubungkan WhatsApp" (pola kirimchat, palet
// hulao) — checklist kesiapan + persetujuan ketentuan, tampil sebelum proses
// hubungkan benar-benar jalan (Embedded Signup maupun Token Manual).
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

const CHECKLIST = [
  'Identitas bisnis di WhatsApp sesuai dengan nama brand atau website resmi.',
  'Foto profil menampilkan logo atau identitas bisnis yang jelas.',
  'Produk atau layanan yang ditampilkan relevan dan aktif.',
  'Nomor WhatsApp telah dipakai untuk keperluan bisnis selama beberapa waktu.',
  'Bisnis punya website yang bisa diakses, kebijakan privasi, dan syarat & ketentuan.',
]

interface WabaWarningDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  platformName?: string
}

export function WabaWarningDialog({
  open,
  onOpenChange,
  onConfirm,
  platformName = 'Hulao',
}: WabaWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle
            className={cn('flex items-center gap-2', TONES.warning.text)}
          >
            <AlertTriangle className="size-5" />
            Perhatian Sebelum Menghubungkan WhatsApp
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-warm-600">
          Sebelum menghubungkan akun WhatsApp Business ke {platformName}, pastikan informasi bisnismu
          sudah siap agar proses verifikasi Meta berjalan lancar.
        </p>

        <ul className="space-y-2.5">
          {CHECKLIST.map((item) => (
            <li key={item} className="flex items-start gap-2.5 text-sm text-warm-700">
              <CheckCircle2
                className={cn('mt-0.5 size-4 shrink-0', TONES.success.text)}
                aria-hidden
              />
              {item}
            </li>
          ))}
        </ul>

        <div
          className={cn(
            'rounded-lg border p-3 text-sm',
            TONES.info.bg,
            TONES.info.border,
            TONES.info.text,
          )}
        >
          Dengan melanjutkan, kamu menyetujui{' '}
          <a
            href="https://www.whatsapp.com/legal/business-terms"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2"
          >
            Ketentuan WhatsApp Business
          </a>{' '}
          dan memberi izin {platformName} untuk menghubungkan akun WhatsApp Business-mu.
        </div>

        <div
          className={cn(
            'flex items-start gap-2 rounded-lg border p-3 text-sm',
            TONES.warning.bg,
            TONES.warning.border,
            TONES.warning.text,
          )}
        >
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Ketidaksesuaian data bisa membuat proses verifikasi tertunda atau nomor tidak bisa kirim
          pesan.
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false)
              onConfirm()
            }}
          >
            Lanjutkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
