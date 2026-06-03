// Library template scene untuk variasi gerakan host. Tiap preset adalah
// motion prompt siap-pakai untuk Kling. Sudah include hard constraint:
//   - silent video, no audio, no lip-sync, no speech
//   - kamera STATIC
//   - return to starting pose untuk seamless loop
//   - gerakan sopan/modest
//
// User pilih di UI "Tambah scene" → klik preset → field name/desc/prompt
// auto-isi → klik Generate. Atau pilih "Custom" untuk prompt sendiri.

export interface SceneTemplate {
  id: string
  category: SceneCategory
  name: string
  description: string
  promptVideo: string
}

export type SceneCategory =
  | 'idle'
  | 'listening'
  | 'talking'
  | 'greeting'
  | 'excited'
  | 'thinking'
  | 'product'

export const SCENE_CATEGORY_LABEL: Record<SceneCategory, string> = {
  idle: 'Idle (diam aktif)',
  listening: 'Mendengar',
  talking: 'Bicara halus',
  greeting: 'Sapaan',
  excited: 'Antusias',
  thinking: 'Berpikir',
  product: 'Tunjuk produk',
}

// Shared safety boilerplate — semua scene WAJIB:
//   - kamera STATIC (no pan/zoom/cut)
//   - silent video (no audio — Kling memang gak generate audio, ini eksplisit
//     supaya prompt gak ngarah ke "speaking words" yang bikin lip-sync attempt)
//   - host stay centered
//   - return to starting pose for seamless loop
//
// DUA varian mouth behavior:
//
// SAFETY_QUIET — mouth subtle (idle/listening/thinking/greeting/excited/product):
//   mulut hampir tertutup atau senyum kecil. JANGAN buka-tutup seperti ngomong.
//
// SAFETY_TALKING — mouth ACTIVELY moving (untuk kategori talking saja):
//   mulut terus bergerak buka-tutup CEPAT dan KONTINYU dari frame 1 sampai
//   frame terakhir, tanpa jeda. Tidak coba bentuk kata spesifik — cuma
//   generic "talking motion" supaya saat TTS audio play, ilusi bicara muncul.
//   Mouth movement HARUS stabil sepanjang clip (gak jeda, gak diam).

const CAMERA_AND_LOOP = `Camera completely static (no pan, zoom, dolly, cut). Host stays centered in frame. Return to starting pose at end for seamless loop.`

const SAFETY_QUIET = `Silent video, no audio, no sound, no speech, no lip-sync. Mouth subtly closed or with gentle smile only, NOT attempting to form words, NO mouth movement to speech patterns. ${CAMERA_AND_LOOP}`

// CRITICAL: untuk talking scene — mouth aktif sepanjang clip dengan pattern
// phoneme yg STABIL. Trik: host seolah pelan-pelan baca/mengeja loop pattern:
//   "wa-wa-wa-ku wa-wa-wa-ku bo-ba bo-ba wa-wa-wa-ku wa-wa-wa-ku bo-ba-ku bo-ba-ku"
// Phoneme W-A-B-K-U menghasilkan visem (mouth shape) yang predictable +
// repetitif → Kling render mouth open-close yang stabil dan natural. Video
// tetap SILENT (tidak ada audio) — pattern hanya untuk guide motion mulut.
const SAFETY_TALKING = `Silent video, no audio output, no actual sound. The host appears to be quietly mouthing a repeating phoneme pattern: "wa-wa-wa-ku wa-wa-wa-ku bo-ba bo-ba wa-wa-wa-ku wa-wa-wa-ku bo-ba-ku bo-ba-ku" — lips form W shape (rounded), then A (open wide), then B (closed pressed), then K (slight open), then U (rounded pucker), looping continuously. CRITICAL MOUTH BEHAVIOR: mouth visibly forms these shapes one after another, RAPIDLY and CONTINUOUSLY from the first frame to the last frame of the clip. Movement is STABLE, RHYTHMIC, never pausing, never freezing, never closing for more than half a second. Pace: ~3-5 syllables per second. The visem cycle is the only thing that matters — host is NOT trying to say specific words, just looping the W-A-B-K-U mouth shapes silently. Lips are clearly visible and clearly moving throughout. ${CAMERA_AND_LOOP}`

function p(motion: string): string {
  return `${SAFETY_QUIET} ${motion}`
}

function pTalking(motion: string): string {
  return `${SAFETY_TALKING} ${motion}`
}

export const SCENE_TEMPLATES: SceneTemplate[] = [
  // ── IDLE — host diam aktif, gerakan kecil natural ──────────────────
  {
    id: 'idle-subtle',
    category: 'idle',
    name: 'Idle - Tenang',
    description: 'Berdiri tenang, sesekali kedip dan senyum kecil. Idle paling natural untuk default.',
    promptVideo: p('Host stands centered in neutral resting pose. Very subtle micro-movements: occasional natural blinks, soft gentle smile shifts, slight head tilt 1-2 degrees, breath rise-fall. Hands resting calmly in front or at sides. Whole loop feels like watching a calm patient person stand and listen.'),
  },
  {
    id: 'idle-joget-kecil',
    category: 'idle',
    name: 'Idle - Joget Kecil',
    description: 'Body sway lembut + bahu naik turun kecil, vibe friendly.',
    promptVideo: p('Host gently sways body left-right slightly (small graceful sway, max 5 degree shoulder rotation), shoulders rise and fall subtly with rhythm. Light bounce in knees almost imperceptible. Hands relaxed, occasionally lift to chest level palm-up in friendly open gesture. End on starting pose.'),
  },
  {
    id: 'idle-lambai',
    category: 'idle',
    name: 'Idle - Lambai Tangan',
    description: 'Lambai tangan ramah sekali, lalu kembali ke pose awal.',
    promptVideo: p('Host raises right hand to chest height and waves gently 2-3 times (small modest wave, not large arm swing), warm friendly smile. Hand returns to rest at side at the end. Slight head nod accompanies wave.'),
  },
  {
    id: 'idle-anggukan',
    category: 'idle',
    name: 'Idle - Anggukan Hangat',
    description: 'Anggukan ramah berulang seperti "iya iya" mendengar.',
    promptVideo: p('Host nods head gently in agreement 3-4 times (small natural nods, not dramatic). Soft warm smile throughout. Eyes maintain warm eye-contact with camera. Hands stay relaxed at sides or clasped lightly in front. End head returns to neutral.'),
  },
  {
    id: 'idle-lompat-kecil',
    category: 'excited',
    name: 'Idle - Lompat Kecil',
    description: 'Lompat kecil 1-2 kali ke posisi awal, ceria.',
    promptVideo: p('Host does one small joyful hop in place (very subtle, knees bend slightly then push up few inches), arms lifted slightly bent at elbows, expression brightens with smile. Returns smoothly to starting standing pose. Repeat once if duration allows. NOT exaggerated, stays modest and graceful.'),
  },
  {
    id: 'idle-kungfu',
    category: 'idle',
    name: 'Idle - Salam Silat',
    description: 'Pose salam silat tradisional Indonesia, kembali ke pose biasa.',
    promptVideo: p('Host transitions slowly into a respectful Indonesian silat greeting pose: right fist meets open left palm at chest level, slight bow of head. Holds briefly with calm focused expression. Slowly returns hands to neutral rest position and relaxes. Movement is graceful, traditional, dignified — NOT combat or aggressive.'),
  },
  {
    id: 'idle-tangan-dada',
    category: 'greeting',
    name: 'Salam - Tangan di Dada',
    description: 'Tangan rapat di dada (salam khas), senyum lembut.',
    promptVideo: p('Host slowly brings both hands together in front of chest in respectful Indonesian greeting (sembah / nuwun), slight bow of head, warm gentle smile. Holds pose briefly. Returns hands to relaxed sides at end.'),
  },
  {
    id: 'idle-tunjuk-samping',
    category: 'product',
    name: 'Tunjuk Produk - Kanan',
    description: 'Menunjuk produk imajiner di sisi kanan host (cocok saat host bahas produk).',
    promptVideo: p('Host turns head slightly to the right and raises right hand palm-up gesturing toward an imaginary product to the right side of the frame (off-camera). Warm engaging smile. Holds pose for 2-3 seconds with subtle hand emphasis. Returns to neutral facing camera at end.'),
  },
  {
    id: 'idle-tunjuk-kiri',
    category: 'product',
    name: 'Tunjuk Produk - Kiri',
    description: 'Menunjuk produk imajiner di sisi kiri host.',
    promptVideo: p('Host turns head slightly to the left and raises left hand palm-up gesturing toward an imaginary product to the left side of the frame (off-camera). Warm engaging smile. Holds pose for 2-3 seconds with subtle hand emphasis. Returns to neutral facing camera at end.'),
  },
  {
    id: 'listening-attentive',
    category: 'listening',
    name: 'Mendengar - Atentif',
    description: 'Kepala condong sedikit, mata fokus, hand di dagu thinking pose.',
    promptVideo: p('Host tilts head slightly to one side in attentive listening pose. Right hand slowly raises to chin/jaw line resting thoughtfully. Eyes focused warmly toward camera as if listening intently. Subtle nod once or twice. Hand returns to side at end and head returns to neutral.'),
  },
  {
    id: 'thinking-pose',
    category: 'thinking',
    name: 'Berpikir - Jari di Dagu',
    description: 'Pose berpikir dengan jari telunjuk di dagu, ekspresi serius.',
    promptVideo: p('Host raises right hand and places index finger gently on chin in classic thinking pose. Eyes look up and slightly to the right (thinking gaze). Slight focused expression. Hand lowers and gaze returns to camera at end.'),
  },
  {
    id: 'talking-gentle',
    category: 'talking',
    name: 'Bicara - Ramah',
    description: 'Mulut mengeja phoneme stabil (wa-wa-ku bo-ba) untuk sync dengan TTS. Tangan ramah explaining.',
    promptVideo: pTalking('Body language layered on top of the phoneme-mouthing motion: subtle conversational hand gestures with open palms up at chest level moving gently in small explanatory motions, occasional small emphatic nod. Eyes engage warmly with camera. Soft friendly expression. Hands return to neutral at end. (Mouth keeps doing the W-A-B-K-U cycle continuously throughout.)'),
  },
  {
    id: 'talking-enthusiastic',
    category: 'talking',
    name: 'Bicara - Antusias',
    description: 'Mulut mengeja phoneme stabil + ekspresi cerah + tangan lebih ekspresif.',
    promptVideo: pTalking('Body language layered on top of the phoneme-mouthing motion: bright cheerful expression, hands rise to shoulder height in open emphatic gestures then return down, head moves animatedly side-to-side slightly, body has small energetic forward lean. End on starting pose. (Mouth keeps doing the W-A-B-K-U cycle continuously throughout.)'),
  },
  {
    id: 'talking-explaining',
    category: 'talking',
    name: 'Bicara - Menjelaskan',
    description: 'Mulut mengeja phoneme stabil + tangan nunjuk imaginary object + ekspresi serius-ramah.',
    promptVideo: pTalking('Body language layered on top of the phoneme-mouthing motion: right hand points emphatically to an imaginary object in front (slightly off-center), then sweeps slowly to chest open-palm gesture, then back to point. Eyes focused engaging with camera. Expression is serious-but-warm, like a teacher explaining a key benefit. Returns to neutral pose at end. (Mouth keeps doing the W-A-B-K-U cycle continuously throughout.)'),
  },
  {
    id: 'greeting-warm-wave',
    category: 'greeting',
    name: 'Sapaan - Lambai Hangat',
    description: 'Sapaan awal saat customer masuk live: lambai lebar + senyum.',
    promptVideo: p('Host raises right hand to slightly above shoulder height and waves in a warm welcoming gesture (modest sized wave, gracious not exaggerated). Bright friendly smile. Brief slight bow of head as acknowledgment. Hand returns to side at end. Cheerful welcoming energy throughout.'),
  },
  {
    id: 'excited-claps',
    category: 'excited',
    name: 'Antusias - Tepuk Pelan',
    description: 'Tepuk tangan pelan 2-3 kali (apresiasi/excited), kembali rest.',
    promptVideo: p('Host claps hands together gently 2-3 times in front of chest (soft slow claps, not loud rapid clap), bright excited smile. Slight bounce or sway accompanies. Returns hands to relaxed position at sides at end.'),
  },
  {
    id: 'excited-tiktok-vibe',
    category: 'excited',
    name: 'Antusias - Vibe TikTok',
    description: 'Body sway + simple TikTok-style move ringan dan sopan.',
    promptVideo: p('Host does a gentle modest TikTok-style sway: body weight shifts side-to-side slowly with rhythm, shoulders rise alternately, one hand makes a small fluid gesture across chest. Bright cheerful smile. Movement stays sopan/modest — NO hip emphasis, NO suggestive moves. Returns to neutral standing pose at end.'),
  },
  {
    id: 'product-hold-up',
    category: 'product',
    name: 'Produk - Angkat ke Atas',
    description: 'Mengangkat produk imajiner ke atas seperti showing-off, smile.',
    promptVideo: p('Host raises both hands to chest height as if holding an invisible product up for the camera to see, displays it with proud excited smile. Slight rotation of hands to show different angles. Returns hands to sides at end.'),
  },
  {
    id: 'thinking-look-up',
    category: 'thinking',
    name: 'Berpikir - Lihat Atas',
    description: 'Mata lihat ke atas-samping (recalling), tangan di pinggang.',
    promptVideo: p('Host shifts eyes up and to one side (classic recall/thinking gaze), brings one hand to hip casually, slight neutral-curious expression. Holds 2-3 seconds. Returns gaze to camera and hand to side at end.'),
  },
]

export function getSceneTemplate(id: string): SceneTemplate | null {
  return SCENE_TEMPLATES.find((t) => t.id === id) ?? null
}

export function scenesByCategory(): Record<SceneCategory, SceneTemplate[]> {
  const out = {
    idle: [],
    listening: [],
    talking: [],
    greeting: [],
    excited: [],
    thinking: [],
    product: [],
  } as Record<SceneCategory, SceneTemplate[]>
  for (const t of SCENE_TEMPLATES) {
    out[t.category].push(t)
  }
  return out
}
