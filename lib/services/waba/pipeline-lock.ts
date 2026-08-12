// Anti double-reply untuk webhook Cloud API — ekuivalen lock inFlight +
// pendingByContact + drain di wa-service/src/wa-manager.ts:796-877.
//
// Dua lapis perlindungan:
//   1. Dedup wamid di DB (Message.externalMsgId) — dilakukan caller
//      (inbound.ts) SEBELUM masuk ke sini; tahan webhook retry lintas proses.
//   2. Lock in-memory per kontak + antrian + drain — tahan burst pesan
//      beruntun dalam satu proses (customer chat 3x cepat → balasan digabung,
//      bukan 3 balasan paralel).
//
// CATATAN: lock in-memory hanya melindungi satu instance Next. Kalau nanti
// multi-instance, tambahkan pg_advisory_xact_lock di lapisan DB.

const MAX_DRAIN_ROUNDS = 3
// Watchdog: lepas lock kalau pipeline menggantung (LLM timeout dsb.).
const PIPELINE_TIMEOUT_MS = 120_000

interface PendingItem {
  content: string
  externalId: string | null
}

interface LockEntry {
  running: boolean
  startedAt: number
  pending: PendingItem[]
}

const locks = new Map<string, LockEntry>()

export interface PipelineRunner {
  /** Jalankan pipeline untuk konten gabungan. skipSave true saat drain. */
  (content: string, opts: { skipSave: boolean; externalId: string | null }): Promise<{
    shouldContinue: boolean
  }>
}

/** Simpan pesan antrian TANPA memicu AI (dipanggil saat kontak sedang busy). */
export interface PendingSaver {
  (content: string, externalId: string | null): Promise<void>
}

/**
 * Jalankan pipeline di bawah lock per (sessionId, waId). Kalau kontak sedang
 * diproses: pesan disimpan (savePending) + diantre, lalu di-drain setelah
 * putaran aktif selesai — digabung '\n' per putaran, max 3 putaran.
 */
export async function withContactLock(input: {
  sessionId: string
  waId: string
  content: string
  externalId: string | null
  run: PipelineRunner
  savePending: PendingSaver
}): Promise<void> {
  const key = `${input.sessionId}:${input.waId}`
  const existing = locks.get(key)

  if (existing?.running) {
    // Watchdog: pipeline sebelumnya menggantung terlalu lama → rebut lock.
    if (Date.now() - existing.startedAt < PIPELINE_TIMEOUT_MS) {
      // Simpan dulu (pesan tidak boleh hilang dari CRM), lalu antre.
      await input.savePending(input.content, input.externalId).catch((err) => {
        console.error('[waba/pipeline-lock] savePending gagal:', err)
      })
      existing.pending.push({ content: input.content, externalId: input.externalId })
      return
    }
    console.warn(`[waba/pipeline-lock] watchdog rebut lock ${key} (pipeline hang)`)
  }

  const entry: LockEntry = {
    running: true,
    startedAt: Date.now(),
    pending: existing?.pending ?? [],
  }
  locks.set(key, entry)

  try {
    let result = await input.run(input.content, {
      skipSave: false,
      externalId: input.externalId,
    })

    // Drain antrian yang menumpuk selama pipeline jalan — pesan-pesan sudah
    // tersimpan (savePending), gabungkan jadi satu konteks per putaran.
    let rounds = 0
    while (result.shouldContinue && entry.pending.length > 0 && rounds < MAX_DRAIN_ROUNDS) {
      rounds += 1
      const batch = entry.pending.splice(0, entry.pending.length)
      const merged = batch.map((p) => p.content).join('\n')
      entry.startedAt = Date.now() // reset watchdog per putaran
      result = await input.run(merged, { skipSave: true, externalId: null })
    }
    if (entry.pending.length > 0) {
      // Sisa antrian di luar budget drain — biarkan; pesan sudah tersimpan di
      // CRM, customer berikutnya chat akan memicu pipeline baru.
      console.warn(
        `[waba/pipeline-lock] ${entry.pending.length} pesan antrian ${key} tidak di-drain (budget habis)`,
      )
      entry.pending.length = 0
    }
  } finally {
    entry.running = false
    // Bersihkan entri kosong supaya Map tidak tumbuh tanpa batas.
    if (entry.pending.length === 0) locks.delete(key)
  }
}
