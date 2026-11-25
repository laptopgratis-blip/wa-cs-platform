'use client'

// "Kirim dari" (2026-11-25) — pemilih nomor WA pengirim di modal Template
// Follow-Up. Default = ikuti CS WhatsApp produk (perilaku lama). Nomor yang
// dipilih dikunci KETAT: offline → ditunda & dicoba ulang, tidak pindah ke
// nomor lain. Aturan kirimnya: lib/services/followup-template-sender.ts.
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FollowUpSenderOption } from '@/lib/services/followup-sender-options'
import {
  csSessionOptionLabel,
  findCsSessionOption,
  selectableCsSessionOptions,
} from '@/lib/services/products/cs-session-options'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

// Radix Select menolak value string kosong → sentinel untuk "ikuti CS produk".
const FOLLOW_PRODUCT = '__product_cs__'

interface Props {
  /** Nomor WA seller, sudah dikelompokkan per nomor (server page). */
  options: FollowUpSenderOption[]
  /** FollowUpTemplate.senderSessionId di form; null = ikuti CS produk. */
  value: string | null
  onChange: (senderSessionId: string | null) => void
}

export function FollowUpSenderSection({ options, value, onChange }: Props) {
  // Nomor yang sudah dihapus seller hanya tampil di template yang memakainya.
  const selectable = selectableCsSessionOptions(options, value)
  // Id basi (nomor di-scan ulang) tetap tampil sebagai nomor yang sama.
  const selected = findCsSessionOption(selectable, value)
  // Id tersimpan yang tidak dikenali: tampilkan apa adanya supaya tidak
  // terlihat seolah "ikuti CS produk" padahal masih terkunci.
  const unknownId = value && !selected ? value : null
  const current = selected?.id ?? unknownId ?? FOLLOW_PRODUCT

  // Belum ada nomor WA ber-nomor & template tidak menyimpan pilihan apa pun.
  if (selectable.length === 0 && !unknownId) return null

  return (
    <div className="space-y-2">
      <Label htmlFor="followup-sender">Kirim dari</Label>
      <Select
        value={current}
        onValueChange={(next) => onChange(next === FOLLOW_PRODUCT ? null : next)}
      >
        <SelectTrigger id="followup-sender" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FOLLOW_PRODUCT}>
            Ikuti CS WhatsApp produk (default)
          </SelectItem>
          {unknownId && (
            <SelectItem value={unknownId}>
              Nomor lama (sudah tidak tersedia)
            </SelectItem>
          )}
          {selectable.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {csSessionOptionLabel(option)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <SenderHint selected={selected} unknown={Boolean(unknownId)} />
    </div>
  )
}

function SenderHint({
  selected,
  unknown,
}: {
  selected: FollowUpSenderOption | null
  unknown: boolean
}) {
  if (unknown || selected?.isRemoved) {
    return (
      <p className={cn('text-xs', TONES.warning.text)}>
        Nomor ini sudah tidak ada di akun, jadi follow-up ini gagal terkirim.
        Pilih nomor lain atau kembalikan ke CS WhatsApp produk.
      </p>
    )
  }
  if (!selected) {
    return (
      <p className="text-muted-foreground text-xs">
        Pengirim mengikuti CS WhatsApp yang diatur di produk. Tanpa CS produk,
        sistem memilih nomor terhubung secara otomatis — bisa berbeda antar
        pelanggan.
      </p>
    )
  }
  return (
    <div className="text-muted-foreground space-y-1 text-xs">
      <p>
        Follow-up ini selalu dikirim dari nomor ini, dan variabel{' '}
        {'{wa_admin}'} memakai nomor ini. Kalau nomornya offline, pengiriman
        ditunda dan dicoba lagi — tidak dikirim dari nomor lain.
      </p>
      {selected.provider === 'BAILEYS' && (
        <p>Nomor WhatsApp Web tidak butuh Template Meta.</p>
      )}
      {!selected.isConnected && (
        <p className={TONES.warning.text}>
          Nomor ini sedang offline — follow-up tertahan sampai tersambung lagi.
        </p>
      )}
    </div>
  )
}
