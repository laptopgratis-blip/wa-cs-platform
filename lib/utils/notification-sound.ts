// Browser-side notification sounds untuk popup social proof + dashboard.
// Pakai Web Audio API supaya tidak butuh hosting file audio + bebas dari
// concern royalty/license. Quality cukup untuk notif ringan.
//
// Browser autoplay policy: AudioContext butuh user gesture untuk start.
// Caller harus handle promise reject silently — popup tetap berfungsi
// tanpa sound kalau browser block.

export type NotificationSound = 'bell' | 'ding' | 'chime' | 'pop'

export const SOUND_PRESETS: { value: NotificationSound; label: string; description: string }[] = [
  { value: 'bell', label: 'Bell', description: 'Lonceng lembut — netral & profesional' },
  { value: 'ding', label: 'Ding', description: 'Singkat & tegas — perhatian langsung' },
  { value: 'chime', label: 'Chime', description: 'Tiga nada naik — vibe semangat' },
  { value: 'pop', label: 'Pop', description: 'Pop ringan — minimalis' },
]

// Singleton AudioContext supaya tidak bikin new context tiap call (browser
// limit ~30 active contexts). Lazy init pada first play attempt.
let ctxInstance: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctxInstance) {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctxInstance = new AC()
    } catch {
      return null
    }
  }
  return ctxInstance
}

// Helper: play satu sine wave dengan envelope ADSR sederhana (attack
// cepat, exponential decay). Volume default 0.15 — popup tidak boleh
// terasa intrusif.
function playTone(
  ctx: AudioContext,
  freq: number,
  startOffsetSec: number,
  durationSec: number,
  volume = 0.15,
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  const t0 = ctx.currentTime + startOffsetSec
  // Attack 5ms, exponential decay to silent over durationSec.
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec)
  osc.connect(gain).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + durationSec + 0.02)
}

export function playNotificationSound(preset: NotificationSound = 'bell'): void {
  const ctx = getCtx()
  if (!ctx) return
  // Resume context kalau di-suspend (auto-suspend setelah idle di Chrome).
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {
      // Browser block — abaikan, sound bukan kritis.
    })
  }
  try {
    switch (preset) {
      case 'bell':
        // 2 nada descending mirip lonceng concierge.
        playTone(ctx, 880, 0, 0.35, 0.18)
        playTone(ctx, 660, 0.15, 0.4, 0.14)
        break
      case 'ding':
        // Single tone tinggi, sharp.
        playTone(ctx, 1200, 0, 0.18, 0.2)
        break
      case 'chime':
        // 3 nada ascending C5-E5-G5 (major triad) — feeling positif.
        playTone(ctx, 523.25, 0, 0.4, 0.15) // C5
        playTone(ctx, 659.25, 0.12, 0.4, 0.15) // E5
        playTone(ctx, 783.99, 0.24, 0.5, 0.17) // G5
        break
      case 'pop':
        // Quick percussive — frekuensi rendah, durasi pendek.
        playTone(ctx, 350, 0, 0.08, 0.25)
        break
    }
  } catch {
    // Apapun yang gagal — silent. Sound bukan kritis untuk popup berfungsi.
  }
}
