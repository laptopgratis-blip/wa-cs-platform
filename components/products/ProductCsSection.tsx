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
  csSessionOptionLabel,
  findCsSessionOption,
  formatCsNumber,
} from '@/lib/services/products/cs-session-options'

// Radix Select menolak value string kosong → sentinel untuk "tanpa CS".
const FOLLOW_DEFAULT = '__none__'

interface ProductCsSectionProps {
  /** Nomor WA seller, sudah dikelompokkan per nomor (server page). */
  options: CsSessionOption[]
  /** Product.csSessionId di form; null = ikuti nomor utama. */
  csSessionId: string | null
  onChange: (csSessionId: string | null) => void
}

/** Meta kecil di kartu daftar produk: "CS: +62…" bila produk punya CS. */
export function ProductCsMeta({
  options,
  csSessionId,
}: Pick<ProductCsSectionProps, 'options' | 'csSessionId'>) {
  const option = findCsSessionOption(options, csSessionId)
  if (!option) return null
  return (
    <p className="text-warm-500 text-xs">
      CS: {formatCsNumber(option.phoneNumber)}
    </p>
  )
}

export function ProductCsSection({
  options,
  csSessionId,
  onChange,
}: ProductCsSectionProps) {
  // Seller belum punya nomor WA tersambung → tidak ada yang bisa dipilih.
  if (options.length === 0) return null

  // Produk bisa menunjuk id sesi basi (nomor di-scan ulang) — tetap tampil
  // sebagai nomor yang sama. Nilai form TIDAK diubah sampai seller memilih.
  const selected = findCsSessionOption(options, csSessionId)
  // Id tersimpan yang tidak dikenali sama sekali: tampilkan apa adanya supaya
  // tidak terlihat seolah "ikuti nomor utama" padahal masih tersimpan.
  const unknownId = csSessionId && !selected ? csSessionId : null
  const value = selected?.id ?? unknownId ?? FOLLOW_DEFAULT

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
          {options.map((option) => (
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
    </div>
  )
}
