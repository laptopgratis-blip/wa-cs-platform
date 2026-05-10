// Library hook framework — data kurasi 30 pattern viral untuk Idea
// Generator metode HOOK. AI random-sample 5 framework per generate, fill
// dengan LP context.
//
// Sumber inspirasi: Alex Hormozi, Russell Brunson, AIDA, PAS, BAB,
// observasi viral content Indonesia. Fokus konten organik IG/TikTok/WA.
//
// Field framework:
// - id: unik
// - name: nama framework (admin display)
// - structure: outline 1-3 baris cara membangun hook
// - example: contoh hook konkret (untuk training AI)
// - bestFor: channel array yg paling fit
// - funnelFit: TOFU/MOFU/BOFU mana yg paling cocok

export interface HookFramework {
  id: string
  name: string
  structure: string
  example: string
  bestFor: string[]
  funnelFit: ('TOFU' | 'MOFU' | 'BOFU')[]
}

export const HOOK_FRAMEWORKS: HookFramework[] = [
  {
    id: 'open_loop',
    name: 'Open Loop',
    structure: 'Buka pertanyaan/misteri yg bikin viewer harus tonton sampai habis untuk tau jawabannya.',
    example: '"Gw rugi 50 juta sebelum nyadar 1 hal yg gak ada di buku marketing manapun..."',
    bestFor: ['IG_REELS', 'TIKTOK', 'IG_STORY'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'contrarian',
    name: 'Contrarian Take',
    structure: 'Sebut hal yg "umum dianggap benar" lalu sanggah dengan fakta/pengalaman kontra.',
    example: '"Semua bilang konten harus konsisten posting tiap hari. Itu jebakan. Ini yg works..."',
    bestFor: ['IG_REELS', 'TIKTOK', 'IG_POST'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'numbered_list',
    name: 'Numbered List',
    structure: 'Buka dengan angka spesifik (3 cara, 5 kesalahan, 7 hal). Bikin brain commit untuk tonton sampai habis.',
    example: '"3 kesalahan yg bikin LP kamu sepi pengunjung (gw juga pernah)"',
    bestFor: ['IG_CAROUSEL', 'IG_POST', 'IG_REELS'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'before_after',
    name: 'Before-After-Bridge (BAB)',
    structure: 'Tunjukkan kondisi sekarang (pain) → kondisi ideal (dream) → bridge (cara/produk).',
    example: '"Dulu gw closing 1 dari 50 chat. Sekarang 1 dari 5. Ini yg gw ubah..."',
    bestFor: ['IG_CAROUSEL', 'IG_REELS', 'TIKTOK'],
    funnelFit: ['MOFU', 'BOFU'],
  },
  {
    id: 'pas',
    name: 'Problem-Agitate-Solve',
    structure: 'Sebut masalah → perbesar implikasinya → kasih solusi (produk).',
    example: '"Audience kamu gak respon? Tiap hari makin parah. Mereka beli ke kompetitor. Ini fix-nya..."',
    bestFor: ['IG_CAROUSEL', 'IG_POST', 'WA_STATUS'],
    funnelFit: ['MOFU', 'BOFU'],
  },
  {
    id: 'aida',
    name: 'AIDA (Attention-Interest-Desire-Action)',
    structure: 'Hook attention → bangun interest dengan benefit → desire dengan proof → CTA action.',
    example: '"Stop scroll. Gw share template chat closing yg gw pake clear stok 30 menit. Comment \\"MINTA\\" gw kirim"',
    bestFor: ['IG_REELS', 'IG_POST', 'IG_STORY'],
    funnelFit: ['MOFU', 'BOFU'],
  },
  {
    id: 'storytime',
    name: 'Storytime / Personal Story',
    structure: 'Buka dengan "gw pernah..." atau "kemarin ada customer..." → narasi singkat → pelajaran.',
    example: '"Kemarin customer komplain produk gw. Gw kira mau refund. Ternyata dia mau order 10x lagi. Gini kejadiannya..."',
    bestFor: ['TIKTOK', 'IG_REELS', 'IG_POST'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'pov',
    name: 'POV Format',
    structure: 'Buka dengan "POV: kamu [situasi]". Audience auto-relate jadi karakter.',
    example: '"POV: kamu udah jualan 6 bulan tapi follower-mu masih 200an"',
    bestFor: ['TIKTOK', 'IG_REELS'],
    funnelFit: ['TOFU'],
  },
  {
    id: 'mistake_hook',
    name: 'Mistake Confession',
    structure: 'Akui kesalahan/blunder pribadi yg relatable. Bikin audience merasa bukan sendirian.',
    example: '"Kesalahan terbesar gw bikin LP: gw masukin 12 testimoni. Konversi turun 70%. Ini sebabnya..."',
    bestFor: ['IG_POST', 'IG_REELS', 'IG_CAROUSEL'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'contrast',
    name: 'Then vs Now',
    structure: 'Buka dengan kondisi "dulu" yg gelap → kondisi "sekarang" yg cerah. Ada lompatan jelas.',
    example: '"6 bulan lalu: tabungan 0, bingung mau bisnis apa. Sekarang: 8 produk laku tiap hari. Ini journeynya..."',
    bestFor: ['IG_CAROUSEL', 'IG_REELS'],
    funnelFit: ['MOFU', 'BOFU'],
  },
  {
    id: 'specific_number',
    name: 'Specific Number Hook',
    structure: 'Buka dengan angka aneh yg spesifik (Rp 287.000, 47 menit, dst.) — feels real, bukan estimasi.',
    example: '"Gw spend Rp 287.500 ad budget hari pertama. Hasilnya 8 closing. Ini breakdown-nya..."',
    bestFor: ['IG_CAROUSEL', 'IG_POST', 'IG_REELS'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'question_hook',
    name: 'Direct Question',
    structure: 'Tanya langsung yg bikin audience pause untuk jawab di kepala mereka.',
    example: '"Pernah gak kamu ngerasa LP udah bagus tapi gak ada yg beli?"',
    bestFor: ['IG_STORY', 'WA_STATUS', 'IG_REELS'],
    funnelFit: ['TOFU'],
  },
  {
    id: 'shock_stat',
    name: 'Shocking Stat',
    structure: 'Buka dengan statistik mengejutkan dari niche audience.',
    example: '"90% LP yg gw audit punya satu masalah yg sama, dan ini bikin mereka rugi 60% revenue"',
    bestFor: ['IG_CAROUSEL', 'IG_POST'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'forbidden_hook',
    name: 'Forbidden / Taboo',
    structure: 'Sebut sesuatu yg "biasanya gak diomongin" atau "rahasia industri" — curiosity gap maksimal.',
    example: '"Hal yg gak pernah diomongin di tutorial bisnis online: kenapa konten viral kamu gak balikin sales"',
    bestFor: ['TIKTOK', 'IG_REELS', 'IG_POST'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'social_proof_hook',
    name: 'Social Proof Opener',
    structure: 'Buka dengan testimoni real customer atau achievement angka.',
    example: '"Customer ke-127 yg lapor closing 3 jam setelah pasang strategi ini..."',
    bestFor: ['IG_STORY', 'WA_STATUS', 'IG_POST'],
    funnelFit: ['MOFU', 'BOFU'],
  },
  {
    id: 'urgent_warning',
    name: 'Urgent Warning',
    structure: 'Buka dengan "stop", "jangan", atau peringatan — urgency tinggi.',
    example: '"Stop bikin konten tiap hari. Ini yg sebenernya bikin akun kamu naik..."',
    bestFor: ['IG_REELS', 'TIKTOK'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'tutorial_promise',
    name: 'Tutorial Promise',
    structure: 'Janji concrete: "gw share cara X dalam Y menit" — value-first hook.',
    example: '"Gw share cara bikin LP dari nol dalam 7 menit, langsung bisa dipake"',
    bestFor: ['IG_REELS', 'TIKTOK', 'IG_POST'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'callout_audience',
    name: 'Callout Audience',
    structure: 'Sebut spesifik siapa yg lo target ("buat kamu yg..."). Filter audience + bikin yg cocok terikat.',
    example: '"Buat kamu yg jual produk handmade tapi LP-nya sepi: ini yg perlu kamu tahu"',
    bestFor: ['IG_POST', 'IG_REELS', 'WA_STATUS'],
    funnelFit: ['MOFU', 'BOFU'],
  },
  {
    id: 'price_anchor',
    name: 'Price Anchor',
    structure: 'Sebutin harga/biaya yg shocking — anchor curiosity atau positioning value.',
    example: '"Gw bayar Rp 5jt buat ikut workshop closing. Yg bener-bener works cuma 3 hal ini..."',
    bestFor: ['IG_CAROUSEL', 'IG_POST'],
    funnelFit: ['MOFU'],
  },
  {
    id: 'ai_takeover',
    name: 'AI / Tools Brag',
    structure: 'Tunjukin kapabilitas tools/automation yg bikin penonton kepo.',
    example: '"Gw test AI buat reply chat customer 24 jam. Hasilnya bikin gw kaget..."',
    bestFor: ['IG_REELS', 'TIKTOK'],
    funnelFit: ['TOFU'],
  },
  {
    id: 'myth_buster',
    name: 'Myth Buster',
    structure: '"Banyak yg bilang X. Sebenernya Y." — kontra mitos populer.',
    example: '"Banyak yg bilang harus jago design buat LP. Sebenernya design jelek lebih convert. Ini alasannya..."',
    bestFor: ['IG_POST', 'IG_REELS', 'IG_CAROUSEL'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'challenge_format',
    name: 'Challenge Format',
    structure: '"30 hari challenge", "1 minggu eksperimen", dst — narasi journey publik.',
    example: '"Day 7 dari 30: gw test pasang LP gratis Hulao. Sales naik 4x. Ini yg gw ubah..."',
    bestFor: ['IG_REELS', 'TIKTOK', 'IG_STORY'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'reveal_hook',
    name: 'Reveal Format',
    structure: '"Akhirnya gw kasih liat..." — promise yg lama ditahan, sekarang dibuka.',
    example: '"Akhirnya gw kasih liat template chat closing yg gw pake 6 bulan terakhir"',
    bestFor: ['IG_REELS', 'IG_POST', 'TIKTOK'],
    funnelFit: ['MOFU', 'BOFU'],
  },
  {
    id: 'fail_hook',
    name: 'Public Failure',
    structure: 'Tampilkan kegagalan publik — relatability tinggi, anti-perfect.',
    example: '"Konten gw flop 47 hari berturut-turut. Hari ke-48 viral. Ini yg gw ubah..."',
    bestFor: ['TIKTOK', 'IG_REELS', 'IG_POST'],
    funnelFit: ['TOFU'],
  },
  {
    id: 'urgent_time',
    name: 'Time Pressure',
    structure: 'Sebut urgensi waktu (deadline, momentum, season).',
    example: '"Sebelum lebaran tinggal 14 hari. Ini yg perlu kamu siapin di LP kamu..."',
    bestFor: ['WA_STATUS', 'IG_STORY'],
    funnelFit: ['BOFU'],
  },
  {
    id: 'comparison',
    name: 'Comparison Hook',
    structure: 'Bandingkan A vs B yg jelas pemenangnya — kontras tegas.',
    example: '"LP berbayar Rp 2jt vs LP gratis Hulao. Yg lebih convert mengejutkan..."',
    bestFor: ['IG_CAROUSEL', 'IG_REELS'],
    funnelFit: ['MOFU', 'BOFU'],
  },
  {
    id: 'curiosity_gap',
    name: 'Curiosity Gap',
    structure: 'Sebut hasil tanpa kasih cara — viewer harus tonton sampai habis.',
    example: '"Gw nemu satu trik bikin chat closing 10x. Trik-nya cuma 1 kalimat..."',
    bestFor: ['IG_REELS', 'TIKTOK'],
    funnelFit: ['TOFU', 'MOFU'],
  },
  {
    id: 'invitation',
    name: 'Direct Invitation',
    structure: 'Undang langsung ke action konkret — gabung, klik, daftar.',
    example: '"Buat 100 user pertama yg pasang LP Hulao bulan ini, gw kasih audit gratis. Klik link..."',
    bestFor: ['WA_STATUS', 'IG_STORY', 'IG_POST'],
    funnelFit: ['BOFU'],
  },
  {
    id: 'problem_observation',
    name: 'Industry Observation',
    structure: 'Pengamatan tajam tentang industri/niche — positioning sebagai yg paham.',
    example: '"Gw notice 80% seller di niche kamu masih pake pendekatan ini. Padahal udah outdated 3 tahun..."',
    bestFor: ['IG_POST', 'IG_CAROUSEL'],
    funnelFit: ['MOFU'],
  },
  {
    id: 'gift_hook',
    name: 'Free Gift / Lead Magnet',
    structure: 'Tawarkan resource gratis bernilai konkret — lead capture.',
    example: '"Gw bagi gratis template LP yg pernah closing 47 sales dalam 3 hari. Comment \\"MAU\\""',
    bestFor: ['WA_STATUS', 'IG_STORY', 'IG_POST'],
    funnelFit: ['MOFU', 'BOFU'],
  },
]

// Random sample N framework — ekslusif (tanpa duplikat). Caller pakai ID
// utk reference saat AI prompt construction.
export function sampleHookFrameworks(
  count: number,
  funnelFilter?: 'TOFU' | 'MOFU' | 'BOFU',
): HookFramework[] {
  const pool = funnelFilter
    ? HOOK_FRAMEWORKS.filter((f) => f.funnelFit.includes(funnelFilter))
    : HOOK_FRAMEWORKS
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, shuffled.length))
}
