// Pemilihan sesi pengirim untuk API publik seller.
//
// `session_id` secara default hanya PREFERENSI: listSenderCandidates menaruh
// sesi itu paling depan, tapi kandidat lain tetap ikut sebagai failover kalau
// sesi pilihan gagal kirim. Untuk seller yang nomornya penting secara bisnis
// (brand/cabang berbeda per nomor), failover diam-diam itu justru berbahaya —
// pesan keluar dari nomor yang salah dan pelanggan membalas ke sana.
//
// `strict_session: true` mengunci: kandidat dipangkas jadi sesi itu saja.
// Fungsi ini sengaja murni (tanpa Prisma) supaya bisa diuji langsung.

/** Bentuk minimal kandidat yang dibutuhkan — cocok dengan SenderCandidate. */
export interface PinnableCandidate {
  sessionId: string
}

/**
 * Terapkan penguncian sesi.
 *
 * - Tanpa `sessionId` → tidak ada yang dikunci, daftar utuh.
 * - `strict` false → `sessionId` tetap sekadar preferensi (urutan sudah diatur
 *   listSenderCandidates), daftar utuh sebagai failover.
 * - `strict` true → hanya sesi itu. Hasil KOSONG berarti sesi yang dipilih
 *   tidak memenuhi syarat kirim (mis. belum CONNECTED) — pemanggil wajib
 *   membedakannya dari "tidak punya nomor sama sekali".
 */
export function applySessionPin<T extends PinnableCandidate>(
  candidates: T[],
  sessionId: string | undefined,
  strict: boolean,
): T[] {
  if (!sessionId || !strict) return candidates
  return candidates.filter((c) => c.sessionId === sessionId)
}

/**
 * Tulis `session_id` / `strict_session` ke body JSON request (dipakai pemilih
 * "Kirim dari" di API Playground).
 *
 * Body editor tetap SATU sumber kebenaran: dropdown hanya menyuntik field,
 * sehingga preview cURL dan request yang benar-benar dikirim ikut berubah
 * tanpa jalur terpisah. `sessionId` null = biarkan platform yang memilih.
 * `strict_session` hanya ditulis kalau ada sesi yang dipilih — kalau tidak,
 * field itu dibuang supaya body tidak menyimpan flag yatim.
 *
 * Kalau body sedang bukan JSON valid (user di tengah mengetik), body
 * dikembalikan apa adanya — jangan pernah membuang ketikan orang.
 */
export function writeSenderIntoBody(
  bodyText: string,
  sessionId: string | null,
  strict: boolean,
): string {
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(bodyText || '{}') as Record<string, unknown>
  } catch {
    return bodyText
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return bodyText
  }
  const next: Record<string, unknown> = { ...parsed, session_id: sessionId }
  if (sessionId && strict) next.strict_session = true
  else delete next.strict_session
  return JSON.stringify(next, null, 2)
}
