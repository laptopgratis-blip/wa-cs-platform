// Panggilan apply hasil optimasi AI — dipakai OptimizeFlow & Riwayat Saran AI.
//
// Server membalas 409 kalau LP sudah diedit sejak saran dibuat (anti-stale).
// Caller menampilkan konfirmasi lalu memanggil ulang dengan `force: true`.
import { fetchJson, type JsonResult } from '@/lib/fetch-json'

export const STALE_APPLY_TITLE = 'LP sudah diedit sejak saran ini dibuat'
export const STALE_APPLY_DESCRIPTION =
  'Apply akan menimpa editan terbaru di LP. Versi saat ini tetap tersimpan di Riwayat Versi dan bisa dipulihkan kapan saja.'

export function postApplyOptimization(
  lpId: string,
  optimizationId: string,
  force = false,
): Promise<JsonResult<unknown>> {
  return fetchJson(
    `/api/lp/${encodeURIComponent(lpId)}/optimize/apply`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ optimizationId, force }),
    },
    'Gagal apply',
  )
}

export function isStaleApplyConflict(r: JsonResult<unknown>): boolean {
  return r.status === 409
}
