// Guard event socket basi (stale) untuk WaManager.
//
// Socket Baileys yang sudah digantikan MASIH bisa memancarkan event lama:
// `logout()` memanggil `end()` tanpa di-await, jadi event 'close'-nya sering
// baru tiba setelah sesi pengganti dibuat. Kalau event basi itu diproses
// seolah milik sesi aktif, akibatnya fatal — mulai dari status palsu di UI/DB
// sampai folder auth sesi baru ikut terhapus.
//
// Sengaja generic (tanpa impor Baileys) supaya bisa diuji tanpa socket asli.

/** Bentuk minimal yang dibutuhkan guard: pemegang referensi socket aktif. */
export interface SocketOwner<TSocket> {
  socket: TSocket | null
}

/**
 * `true` kalau event berasal dari socket yang sudah tidak berlaku.
 *
 * Dua syarat harus terpenuhi agar event dianggap SAH:
 * 1. `entry` masih objek yang terdaftar di map sesi — kalau sesi sudah
 *    dihapus/diganti objek lain, closure lama sedang memegang entry yatim.
 * 2. `sock` masih socket aktif milik entry itu — setelah reconnect,
 *    `entry.socket` sudah menunjuk socket baru (atau null sesudah close).
 */
export function isStaleSocketEvent<TSocket, TEntry extends SocketOwner<TSocket>>(
  registered: TEntry | undefined,
  entry: TEntry,
  sock: TSocket,
): boolean {
  return registered !== entry || entry.socket !== sock
}
