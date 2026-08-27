// Penanda "percakapan ini lewat nomor KITA yang mana".
//
// Wajib ada begitu satu akun punya >1 nomor: satu nomor pelanggan yang chat ke
// dua nomor kita menghasilkan DUA Contact terpisah. Tanpa penanda ini keduanya
// tampak seperti baris duplikat yang misterius.
import { Bot, Smartphone } from 'lucide-react'

import { cn } from '@/lib/utils'

import type { WaProvider } from './types'

export interface SenderInfo {
  displayName: string | null
  phoneNumber: string | null
  provider: WaProvider
}

/**
 * Nama nomor yang layak tampil. Urutan: nama sesi → nomor → teks netral.
 *
 * Fallback ke nomor itu penting: sesi Cloud yang baru terhubung sering belum
 * punya displayName dari Meta, dan sebelumnya penanda "via …" HILANG total
 * dalam kondisi itu — persis saat user paling butuh tahu nomornya.
 */
export function senderName(s: SenderInfo | null | undefined): string {
  if (!s) return 'Nomor tidak diketahui'
  const name = s.displayName?.trim()
  if (name) return name
  if (s.phoneNumber) return `+${s.phoneNumber}`
  return 'Nomor tidak diketahui'
}

/** Label ringkas untuk baris daftar percakapan. */
export function SenderLabel({
  sender,
  className,
  withIcon = true,
}: {
  sender: SenderInfo | null | undefined
  className?: string
  withIcon?: boolean
}) {
  if (!sender) return null
  const Icon = sender.provider === 'CLOUD_API' ? Bot : Smartphone
  return (
    <span
      className={cn(
        'text-warm-500 inline-flex min-w-0 items-center gap-1 text-xs',
        className,
      )}
      // Provider disebut lengkap di title supaya tidak perlu badge warna
      // tambahan yang meramaikan baris list.
      title={
        sender.provider === 'CLOUD_API'
          ? `Lewat ${senderName(sender)} — WhatsApp Business resmi (Cloud API)`
          : `Lewat ${senderName(sender)} — WhatsApp QR (Baileys)`
      }
    >
      {withIcon && <Icon className="size-3 shrink-0" aria-hidden />}
      <span className="truncate">{senderName(sender)}</span>
    </span>
  )
}
