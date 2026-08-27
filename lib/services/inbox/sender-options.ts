// Opsi filter "nomor kita yang mana" untuk daftar percakapan Inbox.
//
// Satu nomor WhatsApp yang di-pair ulang menghasilkan BANYAK baris
// WhatsappSession. Di staging: 13 sesi DISCONNECTED untuk 3 nomor. Menampilkan
// semuanya membuat dropdown penuh nama yang terlihat kembar, jadi opsi
// dikelompokkan per NOMOR — satuan yang memang dipakai user saat berpikir.

import type { SenderOption, WaProvider } from '@/components/inbox/types'

export interface SessionRow {
  displayName: string | null
  phoneNumber: string | null
  provider: string
  status: string
  contactCount: number
}

/**
 * Ringkas daftar sesi jadi opsi filter unik per nomor.
 *
 * Aturan:
 * - Sesi tanpa nomor (belum pernah pair) DIBUANG — tidak pernah punya kontak.
 * - Sesi DISCONNECTED TETAP masuk selama masih memegang kontak. Menyaring ke
 *   CONNECTED saja akan menyembunyikan percakapan lama: di staging satu sesi
 *   Cleanoz yang sudah disconnect menyimpan 914 kontak.
 * - Untuk nomor yang sama, nama dari sesi CONNECTED lebih dipercaya daripada
 *   nama lama yang sudah basi.
 */
export function buildSenderOptions(sessions: SessionRow[]): SenderOption[] {
  const byPhone = new Map<string, SenderOption>()
  for (const s of sessions) {
    if (!s.phoneNumber) continue
    const isConnected = s.status === 'CONNECTED'
    if (!isConnected && s.contactCount === 0) continue
    const prev = byPhone.get(s.phoneNumber)
    if (prev && !(isConnected && !prev.isConnected)) continue
    byPhone.set(s.phoneNumber, {
      phoneNumber: s.phoneNumber,
      displayName: s.displayName,
      provider: s.provider as WaProvider,
      isConnected,
    })
  }
  return [...byPhone.values()]
}
