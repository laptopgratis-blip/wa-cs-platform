// Ke mana user mendarat setelah login, berdasarkan role.
//
// Sebelumnya semua jalur login hardcode '/dashboard', sehingga ADMIN yang baru
// login selalu mendarat di dashboard user biasa dan harus menavigasi manual ke
// /admin. Aturan di sini SENGAJA dicocokkan dengan middleware.ts:
//   ADMIN   → seluruh /admin/*
//   FINANCE → hanya /admin/finance/* (verifikasi transfer manual)
//   USER    → /dashboard
// Kalau tidak cocok, user akan mendarat di halaman yang langsung ditendang
// balik oleh middleware (redirect loop yang membingungkan).

export type LandingRole = 'ADMIN' | 'FINANCE' | 'USER' | (string & {})

export const USER_LANDING = '/dashboard'
export const ADMIN_LANDING = '/admin/dashboard'
export const FINANCE_LANDING = '/admin/finance'

/** Halaman default sesuai role. Role tak dikenal/kosong → dashboard user. */
export function landingPathForRole(role: LandingRole | null | undefined): string {
  if (role === 'ADMIN') return ADMIN_LANDING
  if (role === 'FINANCE') return FINANCE_LANDING
  return USER_LANDING
}

/**
 * Tujuan akhir setelah login.
 *
 * `callbackUrl` (mis. saat user diarahkan ke /login dari halaman terproteksi)
 * DIHORMATI supaya user kembali ke tempat yang tadi dia tuju — kecuali kalau
 * nilainya cuma default generik '/dashboard'. Tanpa pengecualian itu, tombol
 * login yang menyisipkan callbackUrl='/dashboard' akan tetap memaksa admin ke
 * dashboard user, yaitu bug yang sedang diperbaiki.
 *
 * Hanya path relatif yang diterima — URL absolut ditolak agar tidak bisa
 * dipakai sebagai open redirect ke domain luar.
 */
export function resolveLoginRedirect(
  callbackUrl: string | null | undefined,
  role: LandingRole | null | undefined,
): string {
  const fallback = landingPathForRole(role)
  if (!callbackUrl) return fallback
  const trimmed = callbackUrl.trim()
  // Wajib path relatif satu garis miring; '//evil.com' & 'https://…' ditolak.
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback
  if (trimmed === USER_LANDING) return fallback
  return trimmed
}
