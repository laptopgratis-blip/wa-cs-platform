// Library direct response framework — data kurasi 5 pattern paid ads untuk
// Idea Generator metode ADS_FRAMEWORK. Tiap framework di-fill AI dengan
// LP/produk context → 1 ide ad creative.
//
// Sumber: Hormozi $100M Offers, Russell Brunson DotCom Secrets, AIDA dari
// direct response copywriter classic, observasi top-spender Meta Ads
// Library Indonesia.
//
// Field framework:
// - id: unik
// - name: nama framework (admin display)
// - structure: outline cara bangun ad copy
// - example: contoh hook konkret
// - bestFor: format ad yg paling fit (ADS_VIDEO | ADS_IMAGE | ADS_CAROUSEL)
// - funnelFit: TOFU/MOFU/BOFU mana yg paling cocok (paid ads umumnya MOFU/BOFU)
// - platformFit: META_ADS / TIKTOK_ADS

export interface AdsFramework {
  id: string
  name: string
  structure: string
  example: string
  bestFor: ('ADS_VIDEO' | 'ADS_IMAGE' | 'ADS_CAROUSEL')[]
  funnelFit: ('TOFU' | 'MOFU' | 'BOFU')[]
  platformFit: ('META_ADS' | 'TIKTOK_ADS')[]
}

export const ADS_FRAMEWORKS: AdsFramework[] = [
  {
    id: 'hormozi_grand_slam',
    name: 'Hormozi Grand Slam Offer',
    structure:
      'Kombinasi dream outcome + perceived likelihood + time delay (cepat) + effort (rendah). Ad copy stack value sampai "harga jadi gak masuk akal kalau gak ambil".',
    example:
      '"Mau LP convert dalam 24 jam tanpa bayar designer? Kasih AI bikin LP-nya, 2 menit jadi, gratis dipake forever. Kalau gak naik DM, gw refund 100%."',
    bestFor: ['ADS_VIDEO', 'ADS_IMAGE'],
    funnelFit: ['BOFU'],
    platformFit: ['META_ADS', 'TIKTOK_ADS'],
  },
  {
    id: 'pas',
    name: 'Problem-Agitate-Solve (PAS)',
    structure:
      'Sebut masalah audience yg specific → agitasi (kenapa dibiarin makin fatal) → solve (produk-mu sebagai jawaban). Pacing 3 beat: problem 20%, agitate 40%, solve 40%.',
    example:
      '"LP-mu sepi DM? Tiap hari tanpa LP yg convert = budget ads kebakar buat orang yg gak ngapa-ngapain. Hulao bikin LP yg langsung convert dalam 2 menit — gratis."',
    bestFor: ['ADS_VIDEO', 'ADS_CAROUSEL'],
    funnelFit: ['MOFU', 'BOFU'],
    platformFit: ['META_ADS', 'TIKTOK_ADS'],
  },
  {
    id: 'bab',
    name: 'Before-After-Bridge (BAB)',
    structure:
      'Lukis hidup audience SEBELUM (pain), SETELAH pakai produk (dream state), lalu produk-mu sebagai BRIDGE-nya. Visual ad: split-screen before/after.',
    example:
      '"DULU: posting 30 hari, 2 DM. SEKARANG: ganti LP, 47 DM dalam 1 minggu. Beda-nya cuma 1 hal — Hulao kasih AI bikin LP yang clear, gak overthinking."',
    bestFor: ['ADS_VIDEO', 'ADS_CAROUSEL'],
    funnelFit: ['MOFU', 'BOFU'],
    platformFit: ['META_ADS', 'TIKTOK_ADS'],
  },
  {
    id: 'social_proof_flex',
    name: 'Social Proof Flex',
    structure:
      'Buka dengan angka konkret + testimonial bertubi-tubi. Stack proof — 3-5 user real yg sudah dapat result. Hook nyatakan transformasi sebagai angka spesifik.',
    example:
      '"850+ seller online udah pakai Hulao bikin LP. Ronald: dari 0 DM jadi 47/minggu. Sari: ROAS naik dari 1.2 ke 4.7. LP gratis, hasilnya beda level."',
    bestFor: ['ADS_CAROUSEL', 'ADS_VIDEO'],
    funnelFit: ['MOFU', 'BOFU'],
    platformFit: ['META_ADS', 'TIKTOK_ADS'],
  },
  {
    id: 'scarcity_hook',
    name: 'Scarcity / Urgency Hook',
    structure:
      'Sebut alasan urgent yg KONKRET (bukan generic "limited offer"). Bisa: penutupan slot, harga akan naik tanggal X, bonus expire, batch terbatas. Wajib alasan logis kenapa harus sekarang.',
    example:
      '"Slot setup gratis Hulao tutup 31 Mei. Setelah itu, biaya onboarding Rp 99rb. Sebelum tutup, signup di link bio — bonus template LP industri kamu."',
    bestFor: ['ADS_IMAGE', 'ADS_VIDEO'],
    funnelFit: ['BOFU'],
    platformFit: ['META_ADS', 'TIKTOK_ADS'],
  },
]

// Default expose semua 5 framework — beda dengan HOOK_FRAMEWORKS yg sample
// 5 dari 30. Karena ADS jumlahnya kecil dan tiap framework punya angle
// distinct, AI dapat semua 5 lalu fill 1 ide per framework.
export function getAllAdsFrameworks(): AdsFramework[] {
  return ADS_FRAMEWORKS
}
