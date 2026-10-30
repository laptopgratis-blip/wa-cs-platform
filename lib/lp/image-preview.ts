// Aturan preview grid inline ImageManager (panel Gambar di HP): saat dilipat,
// tampilkan tepat 2 baris di lebar panel berapa pun, sisanya lewat tombol
// "Tampilkan semua". Jumlah kolom ditentukan container query di ImageManager:
//   base 2 kolom · @md 3 · @xl 4 · @3xl 5
// Kelas WAJIB literal penuh (bukan dirakit dari string) supaya terdeteksi
// scanner Tailwind. Root ImageTile = flex kolom, jadi pemunculnya `@..:flex`.

// 2 baris × 5 kolom (container terlebar) — batas render saat dilipat.
export const INLINE_PREVIEW_MAX = 10

// Kelas per tile (index 0-based) saat dilipat: '' = selalu tampil.
export function previewTileClass(index: number): string {
  if (index < 4) return ''
  if (index < 6) return 'hidden @md:flex'
  if (index < 8) return 'hidden @xl:flex'
  return 'hidden @3xl:flex'
}

// Kelas tombol "Tampilkan semua" untuk total gambar: null = tidak perlu
// sama sekali; selain itu disembunyikan di container yang sudah memuat semua.
export function previewToggleClass(total: number): string | null {
  if (total <= 4) return null
  if (total <= 6) return '@md:hidden'
  if (total <= 8) return '@xl:hidden'
  if (total <= INLINE_PREVIEW_MAX) return '@3xl:hidden'
  return ''
}
