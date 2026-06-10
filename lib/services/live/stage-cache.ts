// Cache in-memory untuk snapshot /api/live/[slug]/stage — endpoint ini di-poll
// ~1.5dtk oleh SETIAP device penonton, jadi tanpa cache 500 viewer ≈ 660+
// query Postgres/detik untuk data yang identik. Snapshot di-cache per room
// dengan TTL pendek dan di-invalidate saat antrian/panggung berubah, sehingga
// jawaban baru tetap terasa instan (tidak menunggu TTL).
//
// Catatan: process-local — valid karena prod jalan 1 instance standalone dan
// semua mutasi panggung (enqueue via /chat, advance via cron tick) terjadi di
// proses yang sama. Kalau nanti scale ke multi-instance, pindahkan ke Redis;
// TTL pendek membatasi staleness antar instance ke ~1 detik.
import type { Performance } from './stage'

export interface StageSnapshot {
  roomId: string
  isActive: boolean
  performanceSeq: number
  performance: Performance | null
  pendingCount: number
}

const TTL_MS = 1200

// null = cached "room tidak ditemukan" (negative cache — slug acak dari
// attacker tidak tembus ke DB tiap request).
const bySlug = new Map<string, { snap: StageSnapshot | null; expiresAt: number }>()
// Index roomId → slug untuk invalidasi (stage.ts hanya tahu roomId).
const slugByRoomId = new Map<string, string>()

// Return: snapshot kalau hit, null kalau hit negative-cache (room tak ada),
// undefined kalau miss (caller harus query DB lalu setStageSnapshot).
export function getStageSnapshot(
  slug: string,
): StageSnapshot | null | undefined {
  const hit = bySlug.get(slug)
  if (!hit) return undefined
  if (hit.expiresAt <= Date.now()) {
    bySlug.delete(slug)
    return undefined
  }
  return hit.snap
}

export function setStageSnapshot(
  slug: string,
  snap: StageSnapshot | null,
): void {
  bySlug.set(slug, { snap, expiresAt: Date.now() + TTL_MS })
  if (snap) slugByRoomId.set(snap.roomId, slug)
}

// Dipanggil setiap state panggung/antrian room berubah (enqueue, advance)
// supaya poll berikutnya langsung membaca data segar.
export function invalidateStageCache(liveRoomId: string): void {
  const slug = slugByRoomId.get(liveRoomId)
  if (slug) bySlug.delete(slug)
}
