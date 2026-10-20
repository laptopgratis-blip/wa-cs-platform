// Cache per-proses untuk baca data publik. JANGAN dipakai untuk validasi
// checkout. Pembaca bersamaan berbagi satu query; kegagalan tidak di-cache.
// Kedua map dibatasi keras supaya slug acak tidak membuat memori tumbuh
// tanpa batas.
export function createSnapshotCache<T>(
  load: (key: string) => Promise<T>,
  { ttlMs = 3000, maxEntries = 256, now = Date.now } = {},
) {
  const entries = new Map<string, { value: T; expiresAt: number }>()
  const pending = new Map<string, Promise<T>>()

  return function get(key: string): Promise<T> {
    const hit = entries.get(key)
    if (hit && hit.expiresAt > now()) return Promise.resolve(hit.value)
    entries.delete(key)
    const flight = pending.get(key)
    if (flight) return flight
    if (pending.size >= maxEntries) return load(key)

    const promise = Promise.resolve().then(() => load(key)).then((value) => {
      if (entries.size >= maxEntries) entries.delete(entries.keys().next().value!)
      entries.set(key, { value, expiresAt: now() + ttlMs })
      return value
    }).finally(() => pending.delete(key))
    pending.set(key, promise)
    return promise
  }
}
