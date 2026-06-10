// Storage yang TIDAK PERNAH throw. Di iframe third-party (widget LP Live
// embed dipasang di situs eksternal), localStorage/sessionStorage bisa diblok
// browser (Safari, Chrome "block third-party cookies", private mode iOS) dan
// SEMUA akses — termasuk sekadar getItem — melempar SecurityError. Tanpa
// guard, efek mount crash → gate join macet spinner selamanya.
//
// Fallback: Map in-memory per page-load. Konsekuensinya identity tidak
// persist antar reload di lingkungan yang diblok — flow join tetap jalan.
const memLocal = new Map<string, string>()
const memSession = new Map<string, string>()

function wrap(getStore: () => Storage, mem: Map<string, string>) {
  return {
    get(key: string): string | null {
      try {
        const v = getStore().getItem(key)
        if (v !== null) return v
      } catch {
        /* storage diblok — pakai memori */
      }
      return mem.get(key) ?? null
    },
    set(key: string, value: string): void {
      mem.set(key, value)
      try {
        getStore().setItem(key, value)
      } catch {
        /* storage diblok / quota penuh — memori sudah ke-set di atas */
      }
    },
  }
}

export const safeLocal = wrap(() => window.localStorage, memLocal)
export const safeSession = wrap(() => window.sessionStorage, memSession)
