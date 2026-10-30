// Salin teks ke clipboard dengan fallback.
// Clipboard API butuh secure context + izin; browser in-app HP (WebView
// WA/IG/FB), iframe tanpa izin clipboard-write, atau staging/LAN via http
// sering menolaknya. Fallback execCommand lewat textarea tersembunyi masih
// jalan di banyak WebView. Return false kalau dua-duanya gagal — pemanggil
// wajib kasih tahu user, jangan tampilkan "disalin" palsu.
export async function copyText(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText &&
      typeof window !== 'undefined' &&
      window.isSecureContext
    ) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Ditolak (izin/WebView) → lanjut ke fallback di bawah.
  }
  return copyViaTextarea(text)
}

function copyViaTextarea(text: string): boolean {
  if (typeof document === 'undefined' || !document) return false
  // select() memindah fokus ke textarea; simpan fokus lama (mis. tombol
  // "URL") supaya user keyboard/screen reader tidak terlempar ke awal halaman.
  const prevFocused = document.activeElement as HTMLElement | null
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  // font-size 16px mencegah iOS auto-zoom saat textarea ter-select.
  el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px'
  document.body.appendChild(el)
  try {
    el.select()
    // iOS Safari mengabaikan select() pada textarea readonly.
    el.setSelectionRange(0, text.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(el)
    prevFocused?.focus?.({ preventScroll: true })
  }
}
