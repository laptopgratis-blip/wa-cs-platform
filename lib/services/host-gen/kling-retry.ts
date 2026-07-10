// Klasifikasi error task Kling: transient (layak auto-retry) vs permanen.
//
// Kling kadang menggagalkan task dengan pesan transient dari sisi server
// mereka — paling sering "generation time out". Task seperti ini hampir
// selalu sukses saat di-submit ulang, jadi poller/orchestrator kita
// resubmit otomatis (bounded) sebelum benar-benar menandai FAILED ke user.
//
// PENTING: error TRANSPORT saat poll (HTTP non-2xx, body bukan JSON,
// envelope code!=0) TIDAK boleh di-retry — task aslinya mungkin masih
// hidup di server Kling; resubmit berarti dobel task + dobel biaya.
// Prefix error transport dihasilkan pollKlingStatus/pollKlingLipsync di
// kling.ts: "HTTP <status>: …", "Non-JSON: …", "code=<n> …".

const TRANSIENT_RE =
  /time ?-?out|internal error|server error|service (busy|unavailable)|system error|try again/i

const TRANSPORT_PREFIX_RE = /^(HTTP \d|Non-JSON:|code=)/

// Maks resubmit otomatis per job (di luar submit pertama).
export const MAX_KLING_AUTO_RETRIES = 2

export function isTransientKlingTaskFailure(
  rawError: string | null | undefined,
): boolean {
  if (!rawError) return false
  if (TRANSPORT_PREFIX_RE.test(rawError)) return false
  return TRANSIENT_RE.test(rawError)
}
