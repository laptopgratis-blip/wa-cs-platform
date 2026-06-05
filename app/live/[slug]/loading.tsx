// Shell loading instan untuk /live/[slug] — layar hitam ber-spinner supaya
// reload/navigasi TIDAK pernah menampilkan layar putih/blank sebelum konten
// live siap. (Live = pengalaman full-screen gelap.)
export default function LiveLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
      <div
        className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-white/80"
        role="status"
        aria-label="Memuat live"
      />
    </div>
  )
}
