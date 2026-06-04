// Adaptive Kling motion prompt builder.
//
// Input:
//   - ImageVisionAnalysis (hasil analyzeHostImage)
//   - ClipScenario (category + script + targetDurationMs)
//
// Output: 1 motion prompt string yang siap dikirim ke Kling lip-sync endpoint.
//
// Strategy:
//   1. Header: scenario context ("Host is greeting customer" / "Host is explaining product price")
//   2. Mouth: dari mouthState analysis → describe transition ke lipsync target
//      - Untuk IDLE category: TIDAK ada lipsync (mouth subtle natural breathing).
//      - Untuk kategori bicara: mouth animates per audio, returns to base state at end.
//   3. Visual hook stability constraints — copy persis dari analysis
//   4. Background motion — dari analysis.background.motionElements, ekspresikan
//      sebagai instruction continuous loop seamless
//   5. Static elements lock — analysis.background.staticElements + product positions
//   6. Body pose lock — hostPose facing/symmetry tetap dipertahankan
//   7. Loop seamless requirement — final frame == first frame
//
// Adaptive bukan template — content variabel sesuai apa yg sebenarnya terdeteksi
// di image. Contoh: kalau gak ada visual hook, skip section visualHook constraints.

import type { ClipScenario, ImageVisionAnalysis } from './clip-types'

// Per-scenario context — ENERGETIC TikTok/Shopee Live host style.
// MUST include explicit hand gestures + body language sebagai instruksi wajib,
// bukan saran. Kling baseline cenderung kaku — perlu push kuat.
const SCENARIO_CONTEXT: Record<ClipScenario['category'], string> = {
  GREETING:
    'The host EXCITEDLY greets viewers with HIGH energy like a viral TikTok live shopping host. ACTIVE BODY LANGUAGE: hands gesture warmly outward in welcome (palm-up wave or open arms), head tilts side-to-side with enthusiasm, big bright smile, animated eyebrow raises, slight forward bouncy lean toward camera, eyes wide with friendliness. NEVER stand still — constant subtle hand motion, expressive shoulders. Channel "Halo kakak sayaaang!" Indonesian live host vibe.',
  PRODUCT_DEMO:
    'The host PASSIONATELY demonstrates the product with HIGH energy. MANDATORY HAND MOVEMENTS: one or both hands actively gesture (pointing toward product, counting fingers for features, palm-open emphasis, hand sweep across body). Bounces slightly on emphasis points. Eyes WIDE with excitement, animated eyebrows, big nodding for "iyaa kak!" affirmations. Like a Shopee Live demo seller — never still, hands always moving to underline points.',
  PRICE:
    'The host announces price with EXCITED salesperson energy. HANDS GESTURE STRONGLY: number-counting fingers when stating "49 ribu!", palm-slap-emphasis when stating value, hands raise up for "WOW murah banget!" energy. Eyebrows up high, big eyes, head nods rapidly with enthusiasm. Channel "Buruan kak, harga gini doang!" Indonesian discount-pusher vibe.',
  OBJECTION:
    'The host empathetically addresses concerns with SOFTER but still ACTIVE energy. Hands gesture reassuringly (palm-up open, small back-and-forth wave to calm), gentle nodding shows understanding, slight head tilts with empathy, soft eyebrow raise. Body leans forward showing engagement. Still moves naturally — not stiff sympathy, but active listening posture.',
  CLOSING:
    'The host AGGRESSIVELY pushes for sale with PEAK energy. HANDS GESTURE WILDLY: pointing toward camera ("yes, KAMU!"), countdown fingers, fist-pump or two-hand emphasis sweeps, shake head with disbelief "stok habis nih!". Big body lean forward, bouncy shoulder movement, raised eyebrows, broad open-mouth smile. Maximum hype mode like CR7-Shopee level energy.',
  IDLE:
    'The host idles between interactions in a calm RESTING state — NOT speaking. Subtle natural micro-movements ONLY: gentle chest breathing, very small head shifts, soft natural blinks, subtle weight shift. Mouth stays closed or soft smile. NO speech mouth motion. NO big gestures. Hands stay in starting position with minimal sway.',
  GENERAL:
    'The host responds with NATURAL conversational live shopping host energy. Hands actively gesture with speech rhythm, head moves with emphasis, animated facial expressions, slight body bounce, warm eye contact. Like an Indonesian street vendor explaining their product — vibrant, alive, engaging.',
}

function buildMouthInstructions(
  analysis: ImageVisionAnalysis,
  category: ClipScenario['category'],
): string {
  const baseState = analysis.mouthState
  if (category === 'IDLE') {
    return `Mouth: stays in base state (${baseState}) throughout the clip. Very subtle natural breathing motion only — NO speech-pattern mouth movement, NO opening for words. Static-like with micro-life.`
  }
  return `Mouth: animates from base state (${baseState}) to speech motion matching the audio track. Lip-sync the audio precisely. At the final frame, mouth returns to ${baseState} matching the first frame for seamless loop.`
}

function buildVisualHookSection(analysis: ImageVisionAnalysis): string {
  const hook = analysis.visualHook
  if (!hook.detected || hook.detected.length === 0) {
    return '' // no hook → skip section
  }
  // Soft framing: aksesori tetap menempel di tubuh, boleh ikut bergerak natural
  // dengan host. JANGAN bilang "must not move" — bikin patung.
  return `ACCESSORIES & OUTFIT (visible: ${hook.detected.join(', ')}):
- All accessories remain attached and visible throughout — they move naturally WITH the host's body movements (e.g. necklaces sway gently as head moves, hat stays on, hijab drapes naturally with head movement, bag stays slung).
- No accessory falls off, disappears, or teleports. Keep them stable in their attachment points but allow natural physics motion.`
}

function buildBackgroundSection(analysis: ImageVisionAnalysis): string {
  const bg = analysis.background
  const lines: string[] = [`BACKGROUND (${bg.type}):`]
  if (bg.motionElements && bg.motionElements.length > 0) {
    lines.push('Motion elements (must move continuously, loop seamlessly):')
    for (const m of bg.motionElements) {
      lines.push(
        `- ${m.element}: ${m.motionDirection}, ${m.intensity} intensity. Motion is continuous, never pauses, never freezes mid-clip. Final frame must match first frame's phase.`,
      )
    }
  }
  if (bg.staticElements && bg.staticElements.length > 0) {
    lines.push('Static elements (must NOT move):')
    for (const s of bg.staticElements) {
      lines.push(`- ${s}`)
    }
  }
  return lines.join('\n')
}

function buildProductsSection(analysis: ImageVisionAnalysis): string {
  if (!analysis.products || analysis.products.length === 0) return ''
  const lines = ['PRODUCTS IN SCENE:']
  for (const p of analysis.products) {
    lines.push(`- ${p.guessedName} at ${p.placement} (${p.visibility}). Remains in its position throughout the clip — host does not pick it up or move it (host gestures around or toward it instead).`)
  }
  return lines.join('\n')
}

function buildPoseSection(analysis: ImageVisionAnalysis): string {
  const pose = analysis.hostPose
  // HIGH ENERGY motion. Live shopping = banyak gerakan, bukan patung.
  const lines = ['HOST POSE & MANDATORY ACTIVE MOTION:']
  lines.push(`- Starting orientation: ${pose.facing} to camera, ${pose.posture} posture`)
  lines.push('- HEAD & FACE: continuous expressive motion throughout — head bobs/nods with speech rhythm, occasional tilts side-to-side, animated eyebrow movements (raised on key words), eyes go WIDE on emphasis, natural blinks, mouth animates fully with lip-sync. Face never frozen.')
  lines.push('- TORSO & SHOULDERS: visible breathing motion, shoulders shift slightly with emphasis, slight bouncy lean toward camera on energetic moments. Body language is ALIVE.')
  if (pose.handsCount > 0) {
    lines.push(`- HANDS (${pose.handsCount} visible) — MANDATORY ACTIVE GESTURES. Starting position: ${pose.armsPosition}. Hands MUST move throughout the clip with conversational gestures matching speech: open-palm welcomes, finger-counting, pointing toward camera, palm-up emphasis, sweeping gestures across body, two-handed open-arms enthusiasm. Hands return roughly near start position by end. Hands MUST NOT stay still — that looks robotic. Channel Indonesian live shopping host hand energy.`)
  } else {
    lines.push('- Hands not visible — concentrate ALL motion energy on head, face, shoulders, upper torso. Head bobs more, expressions more animated to compensate.')
  }
  lines.push('- Lower body anchored (host stays standing in spot, no walking) — all motion above the waist.')
  return lines.join('\n')
}

export interface AdaptivePromptInput {
  analysis: ImageVisionAnalysis
  scenario: Pick<ClipScenario, 'category' | 'targetDurationMs'>
  // Optional extra hint dari owner (free-form).
  ownerExtra?: string
}

export function buildAdaptiveKlingMotionPrompt(input: AdaptivePromptInput): string {
  const { analysis, scenario } = input
  const sections: string[] = [
    `SCENARIO: ${SCENARIO_CONTEXT[scenario.category]}.`,
    '',
    'CAMERA: completely static, no pan/zoom/dolly/cut. Frame composition matches the source image exactly.',
    '',
    buildMouthInstructions(analysis, scenario.category),
    '',
    buildPoseSection(analysis),
  ]

  const hookSection = buildVisualHookSection(analysis)
  if (hookSection) {
    sections.push('', hookSection)
  }

  sections.push('', buildBackgroundSection(analysis))

  const productSection = buildProductsSection(analysis)
  if (productSection) {
    sections.push('', productSection)
  }

  sections.push(
    '',
    'LOOP-FRIENDLY ENDING: by the FINAL frame, host returns to roughly the starting pose (similar head angle, mouth back to base state, hands roughly back to start position) so the clip can transition back to idle loop smoothly. Mid-clip motion can be expressive — only the endpoints need to match approximately.',
  )

  if (input.ownerExtra) {
    sections.push('', `ADDITIONAL OWNER NOTE: ${input.ownerExtra}`)
  }

  if (scenario.targetDurationMs) {
    sections.push(
      '',
      `TARGET DURATION: approximately ${(scenario.targetDurationMs / 1000).toFixed(1)} seconds, matching the audio track.`,
    )
  }

  sections.push(
    '',
    'QUALITY & ENERGY (CRITICAL): Photorealistic with HIGH-ENERGY natural motion (or match source art style if stylized). Host MUST move like a VIRAL Indonesian TikTok/Shopee live shopping seller — animated hands gesturing constantly, expressive face, bouncy enthusiasm, never still. ABSOLUTELY AVOID: stiff body, robotic motion, statue-like poses, hands frozen at sides, blank face, minimal head movement. The clip should feel like watching a real energetic Indonesian live shop host who genuinely wants the viewer to buy. Mouth lip-sync TIGHT to audio. No face/hand warping artifacts.',
  )

  return sections.filter(Boolean).join('\n')
}

// Convenience: load vision analysis dari DB + build prompt dalam 1 call.
// Dipakai Sprint 2 clip generate pipeline — caller cuma kasih hostTemplateId +
// scenario, dapat string siap kirim ke Kling.
// Throw kalau host belum di-analyze (Sprint 2 harus call analyzeHostImage dulu).
export async function getAdaptivePromptForHost(
  hostTemplateId: string,
  scenario: Pick<ClipScenario, 'category' | 'targetDurationMs'>,
  ownerExtra?: string,
): Promise<string> {
  const { prisma } = await import('@/lib/prisma')
  const host = await prisma.hostTemplate.findUnique({
    where: { id: hostTemplateId },
    select: { visionAnalysis: true, visionAnalyzedAt: true },
  })
  if (!host) throw new Error('Host template tidak ditemukan')
  if (!host.visionAnalysis || !host.visionAnalyzedAt) {
    throw new Error(
      'Host belum di-analyze. Trigger POST /api/host-templates/[id]/analyze-image dulu.',
    )
  }
  return buildAdaptiveKlingMotionPrompt({
    analysis: host.visionAnalysis as unknown as ImageVisionAnalysis,
    scenario,
    ownerExtra,
  })
}
