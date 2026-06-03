// Foundation TypeScript types untuk Klip Live mode (Sprint 1.5+).
// File ini DEFINES contract antara wizard UI, vision analyzer (Sprint 1.5),
// adaptive Kling prompt builder (Sprint 1.5), dan clip generate pipeline (Sprint 2).

// ─────────────────────────────────────────
// Vision analysis hasil Claude 4 Vision atas sourceImageUrl.
// Disimpan di HostTemplate.visionAnalysis (JSONB) untuk dipakai berkali-kali
// saat generate clips. Re-analyze kalau owner regenerate image.
// ─────────────────────────────────────────

export type HostFacing = 'frontal' | 'three-quarter' | 'side'
export type HostPosture = 'symmetric' | 'slight-lean' | 'asymmetric'
export type ArmsPosition = 'sides' | 'crossed' | 'holding-product' | 'gesture' | 'on-hips' | 'one-up'
export type MotionIntensity = 'subtle' | 'moderate' | 'strong'
export type MouthBaseState = 'closed-smile' | 'slight-open' | 'neutral' | 'wide-smile'

export interface MotionElement {
  element: string // "konveyor belt" | "plant leaves" | "assistant packing motion"
  motionDirection: string // "left-to-right continuous" | "gentle upward drift"
  intensity: MotionIntensity
}

export interface ProductInScene {
  guessedName: string // "produk kotak putih kecil" — vision tidak harus tahu nama exact
  placement: string // "meja kayu di sebelah kanan host" | "di tangan kanan"
  visibility: 'fully' | 'partial' | 'background-blur'
}

export interface ImageVisionAnalysis {
  hostPose: {
    facing: HostFacing
    posture: HostPosture
    shouldersLevel: boolean
    armsPosition: ArmsPosition
    handsCount: number // 0-2 visible
  }
  visualHook: {
    detected: string[] // ["topi koboy coklat", "rompi kulit"]
    stabilityConstraints: string[] // ["topi koboy brim must not shift", ...]
  }
  background: {
    type: string // "gudang stok kardus tinggi" | "studio hitam"
    motionElements: MotionElement[]
    staticElements: string[] // ["rak baja stable", "lampu industrial fixed"]
  }
  products: ProductInScene[]
  mouthState: MouthBaseState
  composition: {
    headPercentOfFrame: number // 12-18 ideal
    centered: boolean
    negativeSpaceOK: boolean
  }
  qualityFlags: string[] // ["bahu sedikit tilt 5deg", "kaki tidak terlihat"] — owner review hints
  // Raw analyzer notes (Claude's free-form description) — debug + audit
  rawDescription?: string
}

// ─────────────────────────────────────────
// Klip scenario (Sprint 2 — wizard step 5)
// ─────────────────────────────────────────

export type ClipCategoryStr =
  | 'GREETING'
  | 'PRODUCT_DEMO'
  | 'PRICE'
  | 'OBJECTION'
  | 'CLOSING'
  | 'IDLE'
  | 'GENERAL'

export interface ClipScenario {
  category: ClipCategoryStr
  script: string // Bahasa Indonesia, satu kalimat atau singkat (≤ 200 char)
  productId?: string | null // wajib kalau category=PRODUCT_DEMO
  tags?: string[]
  // Targeted audio duration milliseconds (estimate, untuk Kling clip length).
  // Auto-calculated dari script length × ~80ms/char (Indo TTS pace).
  targetDurationMs?: number
}

// ─────────────────────────────────────────
// Audio gen (ElevenLabs) — Sprint 2
// ─────────────────────────────────────────

export interface AudioGenRequest {
  text: string
  voiceId: string // ElevenLabs voice ID
  modelId?: string // default 'eleven_multilingual_v2'
}

export interface AudioGenResult {
  audioUrl: string // path lokal /uploads/clips-audio/<clip-id>.mp3
  durationMs: number
  characterCount: number // untuk billing
}

// ─────────────────────────────────────────
// Lipsync (Kling) — Sprint 2
// ─────────────────────────────────────────

export interface LipsyncRequest {
  sourceImageUrl: string // absolute URL
  audioUrl: string // absolute URL
  motionPrompt: string // adaptive Kling prompt (Sprint 1.5 builder output)
}

export interface LipsyncResult {
  videoUrl: string // path lokal final MP4 dengan audio bonded
  durationMs: number
  klingJobId: string
}
