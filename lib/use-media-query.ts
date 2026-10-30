// useMediaQuery — baca media query CSS secara reaktif, aman untuk SSR.
// Dipakai saat sesuatu tidak cukup disembunyikan via CSS (`hidden lg:flex`)
// karena komponennya tetap ter-mount & punya state/fetch sendiri — mis.
// ImageManager di editor LP: cuma satu instance yang boleh hidup supaya
// daftar gambar tidak basi saat layar melewati breakpoint.
import { useMemo, useSyncExternalStore } from 'react'

// Breakpoint `lg` Tailwind v4 (default, tidak di-override di globals.css).
export const LG_UP_QUERY = '(min-width: 64rem)'

interface MediaQueryStore {
  subscribe: (onChange: () => void) => () => void
  getSnapshot: () => boolean
  getServerSnapshot: () => boolean
}

// Dipisah dari hook supaya bisa diuji tanpa React/DOM.
export function createMediaQueryStore(query: string): MediaQueryStore {
  return {
    subscribe(onChange) {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    getSnapshot: () => window.matchMedia(query).matches,
    // Server tak tahu lebar layar → false. Pemanggil wajib tetap
    // menyembunyikan elemen via CSS supaya tidak ada kedip saat hidrasi.
    getServerSnapshot: () => false,
  }
}

export function useMediaQuery(query: string): boolean {
  const store = useMemo(() => createMediaQueryStore(query), [query])
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  )
}
