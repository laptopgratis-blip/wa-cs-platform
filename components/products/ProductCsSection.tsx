'use client'

// CS WhatsApp per produk (2026-10-12) — pemilih nomor CS di dialog produk.
// Order yang berisi produk ini: pesan otomatis dikirim DARI nomor terpilih
// dan pelanggan diarahkan KE nomor itu (invoice + {wa_admin} follow-up).
// Aturan pemakaiannya ada di lib/services/orders/order-cs.ts.
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  type CsSessionOption,
  csSessionMetaLabel,
  csSessionOptionLabel,
  findCsSessionOption,
  selectableCsSessionOptions,
} from '@/lib/services/products/cs-session-options'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

// Radix Select menolak value string kosong → sentinel untuk "tanpa CS".
const FOLLOW_DEFAULT = '__none__'

interface ProductCsSectionProps {
  /** Nomor WA seller, sudah dikelompokkan per nomor (server page). */
  options: CsSessionOption[]
  /** Product.csSessionId di form; null = ikuti nomor utama. */
  csSessionId: string | null
  onChange: (csSessionId: string | null) => void
}

/**
 * Meta kecil di kartu daftar produk: "CS: +62…" bila produk punya CS, dengan
 * tanda "offline" / "sudah dihapus" supaya seller tahu nomornya bermasalah.
 */
export function ProductCsMeta({
  options,
  csSessionId,
}: Pick<ProductCsSectionProps, 'options' | 'csSessionId'>) {
  const option = findCsSessionOption(options, csSessionId)
  if (!option) return null
  return <p className="text-warm-500 text-xs">{csSessionMetaLabel(option)}</p>
}

export function ProductCsSection({
  options,
  csSessionId,
  onChange,
}: ProductCsSectionProps) {
  // Nomor yang sudah dihapus seller hanya tampil di produk yang memakainya.
  const selectable = selectableCsSessionOptions(options, csSessionId)

  // Produk bisa menunjuk id sesi basi (nomor di-scan ulang) — tetap tampil
  // sebagai nomor yang sama. Nilai form TIDAK diubah sampai seller memilih.
  const selected = findCsSessionOption(selectable, csSessionId)
  // Id tersimpan yang tidak dikenali sama sekali: tampilkan apa adanya supaya
  // tidak terlihat seolah "ikuti nomor utama" padahal masih tersimpan.
  const unknownId = csSessionId && !selected ? csSessionId : null
  const value = selected?.id ?? unknownId ?? FOLLOW_DEFAULT

  // Seller belum punya nomor WA ber-nomor (dan produk ini tidak menyimpan
  // pilihan apa pun) → tidak ada yang bisa dipilih.
  if (selectable.length === 0 && !unknownId) return null

  return (
    <div className="space-y-2">
      <Label
        htmlFor="product-cs-session"
        className="text-warm-700 text-sm font-medium"
      >
        CS WhatsApp
      </Label>
      <Select
        value={value}
        onValueChange={(next) =>
          onChange(next === FOLLOW_DEFAULT ? null : next)
        }
      >
        <SelectTrigger id="product-cs-session" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FOLLOW_DEFAULT}>
            Ikuti nomor utama (default)
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
      <p className="text-warm-500 text-xs">
        Order produk ini: pesan otomatis dikirim dari nomor ini dan tombol
        WhatsApp di invoice mengarah ke nomor ini. Order berisi beberapa produk
        memakai CS produk pertama.
      </p>
      {selected?.isRemoved && (
        <p className={cn('text-xs', TONES.warning.text)}>
          Nomor ini sudah dihapus dari akun, jadi order produk ini memakai nomor
          utama. Pilih nomor lain atau kembalikan ke nomor utama.
        </p>
      )}
      {selected && !selected.isRemoved && !selected.isConnected && (
        <p className="text-warm-500 text-xs">
          Nomor ini sedang offline: pesan otomatis dikirim dari nomor lain yang
          terhubung sampai nomor ini tersambung lagi.
        </p>
      )}
    </div>
  )
}
