// Label ramah-user untuk keterangan TokenTransaction di halaman billing.
// Deskripsi asli ditulis teknis saat deduct (nama model, session id, satuan
// internal) — di sini diterjemahkan via pattern matching supaya user paham
// token kepotong karena apa. Diterapkan di lapisan tampilan supaya riwayat
// lama (ribuan baris) ikut rapi tanpa migrasi data; deskripsi asli tetap
// tersimpan utuh di DB untuk audit.

interface LabelRule {
  pattern: RegExp
  // Replacer menerima hasil match regex — return label ramah user.
  label: (m: RegExpMatchArray) => string
}

const CONTENT_TYPE_LABEL: Record<string, string> = {
  WA_STATUS: 'WA Status',
  IG_REELS: 'Instagram Reels',
  IG_CAROUSEL: 'Instagram Carousel',
  IG_FEED: 'Instagram Feed',
  TIKTOK: 'TikTok',
  YT_SHORT: 'YouTube Short',
}

const ADS_PLATFORM_LABEL: Record<string, string> = {
  META_ADS: 'Meta Ads',
  GOOGLE_ADS: 'Google Ads',
  TIKTOK_ADS: 'TikTok Ads',
}

// "claude-haiku-4-5-20251001" → "claude-haiku-4-5" (buang tanggal snapshot).
function shortModelName(model: string): string {
  return model.replace(/-\d{8}$/, '')
}

// Slug room bisa berupa cuid (tidak bermakna buat user) — sembunyikan.
function isOpaqueId(s: string): boolean {
  return /^c[a-z0-9]{20,}$/.test(s)
}

// Urutan penting: rule pertama yang cocok dipakai.
const RULES: LabelRule[] = [
  // ── WhatsApp CS ──
  {
    pattern: /^(?:CS )?Reply via (.+)$/,
    label: (m) => `Balas chat WA pakai AI (${shortModelName(m[1] ?? '')})`,
  },
  // ── Live Room ──
  {
    pattern: /^Live chat — room (.+)$/,
    label: (m) =>
      isOpaqueId(m[1] ?? '')
        ? 'Jawaban AI untuk chat penonton (Live Room)'
        : `Jawaban AI untuk chat penonton (Live Room "${m[1]}")`,
  },
  {
    pattern: /^TTS realtime (\d+) char$/,
    label: (m) => `Suara host live (TTS) — ${m[1]} karakter`,
  },
  {
    pattern: /^Objection analyze — session .+$/,
    label: () => 'Analisis keberatan penonton live (AI)',
  },
  {
    pattern: /^Embedding \d+ tok$/,
    label: () => 'Pencocokan chat penonton dengan klip (AI)',
  },
  // ── Klip Live ──
  {
    pattern: /^Klip Live TTS — (\d+) char$/,
    label: (m) => `Suara klip host AI — ${m[1]} karakter`,
  },
  {
    pattern: /^Klip Live Kling lipsync — (\d+)dtk$/,
    label: (m) => `Video lip-sync klip host — ${m[1]} detik`,
  },
  {
    pattern: /^Klip Live embed transcript$/,
    label: () => 'Indexing klip untuk pencocokan chat',
  },
  {
    pattern: /^Klip Live Vision Analyzer$/,
    label: () => 'Analisis foto host (AI vision)',
  },
  {
    pattern: /^Klip Live script suggester — (\d+) scripts?$/,
    label: (m) => `Saran script klip AI (${m[1]} script)`,
  },
  {
    pattern: /^Optimasi Trigger Klip \((.+)\)$/,
    label: (m) => `Optimasi trigger klip — kategori ${m[1]}`,
  },
  {
    pattern: /^Tes suara host — (\d+) char$/,
    label: (m) => `Tes suara host — ${m[1]} karakter`,
  },
  // ── Host AI (avatar) ──
  {
    pattern: /^Host prompt orchestrate — .+$/,
    label: () => 'Racik prompt host AI',
  },
  {
    pattern: /^Host image variant — .+$/,
    label: () => 'Variasi gambar host AI',
  },
  {
    pattern: /^Host image — (.+)$/,
    label: (m) =>
      isOpaqueId(m[1] ?? '') ? 'Gambar host AI' : `Gambar host AI — ${m[1]}`,
  },
  {
    pattern: /^Host scene video — (.+?) \((\d+)s\)$/,
    label: (m) => `Video scene host AI "${m[1]}" — ${m[2]} detik`,
  },
  // ── Konten, iklan & LP ──
  {
    pattern: /^Post-Publish WA Status #(\d+)$/,
    label: (m) => `Konten WA Status otomatis #${m[1]}`,
  },
  {
    pattern: /^Content Generation \((.+)\)$/,
    label: (m) => `Generate konten ${CONTENT_TYPE_LABEL[m[1] ?? ''] ?? m[1]}`,
  },
  {
    pattern: /^Ads Generation \((.+?)\/(.+)\)$/,
    label: (m) =>
      `Generate materi iklan ${ADS_PLATFORM_LABEL[m[1] ?? ''] ?? (m[1] ?? '').replace(/_/g, ' ')} (${(m[2] ?? '').toLowerCase()})`,
  },
  {
    pattern: /^Idea Generator \((\d+) ide\)$/,
    label: (m) => `Generator ide konten (${m[1]} ide)`,
  },
  {
    pattern: /^Generate LP AI$/,
    label: () => 'Generate Landing Page pakai AI',
  },
  {
    pattern: /^LP AI Optimization$/,
    label: () => 'Optimasi Landing Page pakai AI',
  },
  {
    pattern: /^Optimasi Keyword Knowledge$/,
    label: () => 'Optimasi keyword knowledge base',
  },
]

// Terjemahkan deskripsi transaksi ke label ramah user. Pola yang tidak
// dikenal dikembalikan apa adanya (deskripsi baru yang sudah jelas, top-up
// Midtrans, subscription, dst).
export function friendlyTokenDescription(description: string | null): string {
  if (!description) return '—'
  for (const rule of RULES) {
    const m = description.match(rule.pattern)
    if (m) return rule.label(m)
  }
  return description
}
