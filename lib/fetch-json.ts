// fetchJson — pembungkus fetch yang TIDAK PERNAH throw.
//
// Pola lama di UI: `try { const json = await res.json() } finally { ... }`
// tanpa `catch`. Kalau fetch ditolak (jaringan putus, tab di-suspend) atau
// respons bukan JSON (halaman 502 proxy, 500 berbadan kosong), error-nya lolos
// sebagai unhandled rejection: tidak ada toast, tidak ada perubahan apa pun —
// user cuma melihat spinner berhenti dan mengira tombolnya rusak.
//
// Di sini setiap kegagalan diturunkan jadi hasil biasa dengan pesan Bahasa
// Indonesia yang bisa langsung ditampilkan.

export interface JsonResult<T> {
  /** true hanya kalau HTTP ok DAN body-nya JSON valid. */
  ok: boolean
  /** 0 = request tidak pernah sampai (gagal di level jaringan). */
  status: number
  data: T | null
  /** Siap tampil ke user. null saat ok. */
  error: string | null
}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return 'Sesi kamu berakhir — muat ulang halaman lalu masuk lagi.'
  if (status === 404) return 'Data tidak ditemukan.'
  if (status === 429) return 'Terlalu banyak permintaan — tunggu sebentar lalu coba lagi.'
  if (status >= 500) return 'Server sedang bermasalah — coba lagi sebentar lagi.'
  return 'Permintaan gagal diproses.'
}

/**
 * Ambil JSON dengan aman.
 *
 * `fallbackError` dipakai kalau server tidak mengirim pesan sendiri — isi
 * dengan kalimat yang menyebut aksinya, mis. 'Gagal mengirim template'.
 */
export async function fetchJson<T = unknown>(
  input: string,
  init?: RequestInit,
  fallbackError = 'Permintaan gagal diproses.',
): Promise<JsonResult<T>> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch (err) {
    console.error(`[fetchJson] ${input} gagal:`, err)
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Tidak bisa terhubung ke server — cek koneksi internet lalu coba lagi.',
    }
  }

  // Body dibaca sekali lewat text() lalu di-parse manual: kalau respons bukan
  // JSON kita tetap bisa mencatat isinya ke console untuk debugging.
  const raw = await res.text().catch(() => '')
  let parsed: unknown = null
  if (raw) {
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.error(`[fetchJson] ${input} membalas non-JSON (${res.status}):`, raw.slice(0, 200))
    }
  }

  const envelope = parsed as { success?: boolean; error?: string; data?: T } | null
  if (!res.ok || envelope?.success === false) {
    return {
      ok: false,
      status: res.status,
      data: null,
      error: envelope?.error || (res.ok ? fallbackError : messageForStatus(res.status)),
    }
  }
  if (parsed === null) {
    return { ok: false, status: res.status, data: null, error: fallbackError }
  }
  return { ok: true, status: res.status, data: parsed as T, error: null }
}
