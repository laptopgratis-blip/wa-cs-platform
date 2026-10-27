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
  /** false kalau savePending gagal — pesan tidak ada di CRM/history. */
  saved: boolean
}

interface LockEntry {
  running: boolean
  startedAt: number
  pending: PendingItem[]
}

const locks = new Map<string, LockEntry>()

export interface PipelineRunner {
  /** Jalankan pipeline untuk konten gabungan. skipSave true saat drain. */
  (
    content: string,
    opts: { skipSave: boolean; externalId: string | null },
  ): Promise<{
    shouldContinue: boolean
  }>
}

/** Simpan pesan antrian TANPA memicu AI (dipanggil saat kontak sedang busy). */
export interface PendingSaver {
  (content: string, externalId: string | null): Promise<void>
}

interface FirstRound {
  content: string
  skipSave: boolean
  externalId: string | null
}

export interface ContactLockInput {
  sessionId: string
  waId: string
  content: string
  externalId: string | null
  run: PipelineRunner
  savePending: PendingSaver
  /** Sumber waktu (ms) untuk watchdog — default Date.now; diinjeksi tes. */
  now?: () => number
}

/**
 * Jalankan pipeline di bawah lock per (sessionId, waId). Kalau kontak sedang
 * diproses: pesan disimpan (savePending) + diantre, lalu di-drain setelah
 * putaran aktif selesai — digabung '\n' per putaran, max 3 putaran.
 */
export async function withContactLock(input: ContactLockInput): Promise<void> {
  const key = `${input.sessionId}:${input.waId}`
  const now = input.now ?? Date.now
  const existing = locks.get(key)

  if (existing?.running) {
    // Watchdog: pipeline sebelumnya menggantung terlalu lama → rebut lock.
    if (now() - existing.startedAt < PIPELINE_TIMEOUT_MS) {
      // Simpan dulu (pesan tidak boleh hilang dari CRM), lalu antre.
      const saved = await input
        .savePending(input.content, input.externalId)
        .then(
          () => true,
          (err) => {
            console.error('[waba/pipeline-lock] savePending gagal:', err)
            return false
          },
        )
      // Baca ulang pemilik: selama savePending, lock bisa direbut watchdog
      // atau dilepas — antre ke pemilik yang berlaku SEKARANG.
      const owner = locks.get(key)
      if (owner?.running) {
        owner.pending.push({
          content: input.content,
          externalId: input.externalId,
          saved,
        })
        return
      }
      // Pemilik keburu selesai → tak ada yang men-drain pesan ini. Sudah
      // tersimpan, jadi jalankan putarannya sendiri tanpa simpan ulang.
      return runAsOwner(key, now, input, {
        content: input.content,
        skipSave: true,
        externalId: null,
      })
    }
    console.warn(
      `[waba/pipeline-lock] watchdog rebut lock ${key} (pipeline hang)`,
    )
  }

  return runAsOwner(
    key,
    now,
    input,
    {
      content: input.content,
      skipSave: false,
      externalId: input.externalId,
    },
    carryOverUnsaved(key, existing),
  )
}

/**
 * Antrian run basi saat watchdog merebut lock. Pesan yang sudah tersimpan
 * dibuang: ikut terbaca di history run baru, jadi mewarisinya = balasan ulang
 * yang telat. Yang gagal disimpan dibawa (salinan baru, tidak dipakai bersama
 * run basi) supaya tetap dibalas lewat drain.
 */
function carryOverUnsaved(
  key: string,
  stale: LockEntry | undefined,
): PendingItem[] {
  if (!stale) return []
  const unsaved = stale.pending.filter((p) => !p.saved)
  const dropped = stale.pending.length - unsaved.length
  if (dropped > 0) {
    console.warn(
      `[waba/pipeline-lock] ${dropped} pesan antrian run lama ${key} dibuang (sudah di CRM)`,
    )
  }
  return unsaved
}

/** Pegang lock kontak, jalankan putaran pertama lalu drain antriannya. */
async function runAsOwner(
  key: string,
  now: () => number,
  input: ContactLockInput,
  first: FirstRound,
  inherited: PendingItem[] = [],
): Promise<void> {
  const entry: LockEntry = {
    running: true,
    startedAt: now(),
    pending: inherited,
  }
  locks.set(key, entry)
  // Lock bisa direbut watchdog selagi run ini menggantung. Run basi tidak
  // boleh lagi men-drain atau menghapus entri milik pemilik baru.
  const owns = () => locks.get(key) === entry

  try {
    let result = await input.run(first.content, {
      skipSave: first.skipSave,
      externalId: first.externalId,
    })

    // Drain antrian yang menumpuk selama pipeline jalan — pesan-pesan sudah
    // tersimpan (savePending), gabungkan jadi satu konteks per putaran.
    let rounds = 0
    while (
      owns() &&
      result.shouldContinue &&
      entry.pending.length > 0 &&
      rounds < MAX_DRAIN_ROUNDS
    ) {
      rounds += 1
      const batch = entry.pending.splice(0, entry.pending.length)
      const merged = batch.map((p) => p.content).join('\n')
      entry.startedAt = now() // reset watchdog per putaran
      result = await input.run(merged, { skipSave: true, externalId: null })
    }
  } finally {
    entry.running = false
    if (owns()) {
      if (entry.pending.length > 0) {
        // Sisa antrian (budget drain habis / pipeline gagal) — pesan sudah
        // tersimpan di CRM, chat customer berikutnya memicu pipeline baru.
        console.warn(
          `[waba/pipeline-lock] ${entry.pending.length} pesan antrian ${key} tidak di-drain`,
        )
      }
      // Lepas lock; Map tidak tumbuh tanpa batas.
      locks.delete(key)
    } else {
      console.warn(
        `[waba/pipeline-lock] run basi ${key} selesai setelah lock direbut watchdog`,
      )
    }
  }
}
