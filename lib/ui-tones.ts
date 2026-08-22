// Registry tone status — SATU-SATUNYA file yang boleh memakai palet Tailwind
// mentah untuk semantik status. Semua warna status di aplikasi (badge, panel
// callout, ikon status) HARUS lewat registry ini, bukan hand-roll per file.
//
// Pemetaan hue (lihat CLAUDE.md § Design System UI):
//   success = emerald  · warning = amber · danger = red
//   info    = sky      · neutral = warm  · brand  = primary (orange)
//   whatsapp = emerald (aksen kanal, BUKAN status — lihat catatan di entri)
//
// Formula pill: bg-{hue}-50 + text-{hue}-700 + dot bg-{hue}-500.
// Catatan: `info` sengaja sky (bukan orange) — karena semua aksen dekoratif
// sudah orange, badge info orange tidak lagi terbaca sebagai "status".

export type Tone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'brand'
  | 'whatsapp'

export interface ToneClasses {
  /** Latar lembut untuk pill/panel. */
  bg: string
  /** Warna teks di atas latar lembut. */
  text: string
  /** Warna dot indikator. */
  dot: string
  /** Border senada untuk panel/callout. */
  border: string
  /** Varian solid (tombol kecil/badge tegas). */
  solid: string
}

export const TONES: Record<Tone, ToneClasses> = {
  success: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    border: 'border-emerald-200',
    solid: 'bg-emerald-600 text-white',
  },
  warning: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    border: 'border-amber-200',
    solid: 'bg-amber-500 text-white',
  },
  danger: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500',
    border: 'border-red-200',
    solid: 'bg-red-600 text-white',
  },
  info: {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    dot: 'bg-sky-500',
    border: 'border-sky-200',
    solid: 'bg-sky-600 text-white',
  },
  neutral: {
    bg: 'bg-warm-100',
    text: 'text-warm-600',
    dot: 'bg-warm-400',
    border: 'border-warm-200',
    solid: 'bg-warm-600 text-white',
  },
  brand: {
    bg: 'bg-primary-50',
    text: 'text-primary-700',
    dot: 'bg-primary-500',
    border: 'border-primary-200',
    solid: 'bg-primary-500 text-white',
  },
  // Aksen KANAL WhatsApp (kartu/CTA "hubungi via WA"), bukan status.
  // Sengaja sehue dengan `success` — keduanya emerald. Konsekuensinya: jangan
  // pakai `whatsapp` untuk hal yang punya arti "berhasil", dan jangan taruh
  // badge success tepat di sebelah CTA WhatsApp dalam satu blok, karena
  // pembaca tidak bisa membedakan keduanya dari warna saja.
  whatsapp: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    border: 'border-emerald-200',
    solid: 'bg-emerald-600 text-white',
  },
}
