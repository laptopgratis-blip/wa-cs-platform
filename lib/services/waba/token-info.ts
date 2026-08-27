// Inspeksi access token Meta lewat /debug_token.
//
// Dipakai untuk membedakan token hasil Embedded Signup (type USER) dari token
// System User yang ditempel manual. Bedanya penting: sinkronisasi coexistence
// (smb_app_data) adalah aksi berbasis PERSETUJUAN pemilik WhatsApp Business
// App, dan Meta hanya menghormatinya untuk token yang benar-benar melewati
// alur persetujuan ES. Token System User ditolak — dengan error paling tidak
// informatif yang Meta punya: 135000 "Generic user error".

import { getMetaConfig } from './config'
import { graphRequest } from './graph'

/** Tipe token menurut Meta. Sengaja longgar — Meta bisa menambah nilai baru. */
export type MetaTokenType = 'USER' | 'SYSTEM_USER' | 'PAGE' | 'APP' | (string & {})

export interface MetaTokenInfo {
  type?: MetaTokenType
  isValid: boolean
  scopes: string[]
  /** epoch detik; 0 = tidak pernah kedaluwarsa. undefined = tidak diketahui. */
  expiresAt?: number
}

/**
 * Baca metadata token. NEVER throw — kegagalan apa pun jadi null, dan caller
 * WAJIB memperlakukan null sebagai "tidak diketahui", bukan "bermasalah".
 * Memblokir alur karena pemeriksaan opsional yang gagal justru lebih buruk
 * daripada membiarkan Meta yang menolak.
 */
export async function inspectToken(token: string): Promise<MetaTokenInfo | null> {
  let appToken: string
  try {
    const cfg = getMetaConfig()
    appToken = `${cfg.appId}|${cfg.appSecret}`
  } catch {
    return null
  }

  const res = await graphRequest<{
    data?: {
      type?: string
      is_valid?: boolean
      scopes?: string[]
      expires_at?: number
    }
  }>(`/debug_token?input_token=${encodeURIComponent(token)}`, { token: appToken })

  if (!res.ok || !res.data.data) return null
  const d = res.data.data
  return {
    type: d.type,
    isValid: d.is_valid === true,
    scopes: d.scopes ?? [],
    expiresAt: d.expires_at,
  }
}

/**
 * Apakah sinkronisasi coexistence bisa dijalankan dengan token bertipe ini?
 *
 * Dipisah dari pemanggilan jaringan supaya bisa diuji langsung. `undefined`
 * (tipe tidak diketahui / debug_token gagal) sengaja dianggap BOLEH: lebih baik
 * mencoba dan ditolak Meta daripada memblokir sesi yang sebenarnya sah hanya
 * karena pemeriksaan tambahan tidak bisa dilakukan.
 */
export function coexSyncBlockedReason(
  tokenType: MetaTokenType | undefined,
): string | null {
  if (tokenType !== 'SYSTEM_USER') return null
  return (
    'Nomor ini terhubung memakai token System User (Token Manual). ' +
    'Sinkronisasi kontak & riwayat dari HP butuh koneksi lewat Embedded Signup, ' +
    'karena Meta hanya mengizinkannya untuk token yang melewati persetujuan pemilik ' +
    'WhatsApp Business App. Putuskan koneksi lalu hubungkan ulang lewat Embedded Signup ' +
    'kalau ingin menarik kontak & riwayat.'
  )
}
