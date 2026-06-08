// Petakan modelName → penyedia (yang KITA bayar). Dipakai untuk dimensi
// "spend per provider" di monitoring biaya AI. Disimpan denormalisasi di
// AiGenerationLog.provider supaya groupBy cepat.
export type AiProviderName =
  | 'ANTHROPIC'
  | 'OPENAI'
  | 'GOOGLE'
  | 'KLING'
  | 'FAL'
  | 'ELEVENLABS'
  | 'OTHER'

export function providerFromModel(
  modelName: string | null | undefined,
): AiProviderName {
  const m = (modelName ?? '').toLowerCase().trim()
  if (!m) return 'OTHER'
  if (m.startsWith('claude') || m.includes('anthropic')) return 'ANTHROPIC'
  if (
    m.startsWith('gpt') ||
    m.startsWith('o1') ||
    m.startsWith('o3') ||
    m.startsWith('o4') ||
    m.includes('whisper') ||
    m.includes('text-embedding') ||
    m.includes('dall-e') ||
    m.includes('-tts')
  ) {
    return 'OPENAI'
  }
  if (m.startsWith('gemini') || m.includes('google') || m.startsWith('imagen')) {
    return 'GOOGLE'
  }
  // fal-ai/* di-bill via fal.ai (mis. fal-ai/kling-video/...). Cek SEBELUM
  // 'kling' karena string-nya mengandung keduanya.
  if (m.startsWith('fal-ai') || m.includes('fal.ai')) return 'FAL'
  if (m.includes('kling')) return 'KLING'
  if (m.startsWith('eleven') || m.includes('elevenlabs')) return 'ELEVENLABS'
  return 'OTHER'
}

// Label tampilan untuk UI.
export const PROVIDER_LABEL: Record<AiProviderName, string> = {
  ANTHROPIC: 'Anthropic (Claude)',
  OPENAI: 'OpenAI (GPT/Whisper/TTS)',
  GOOGLE: 'Google (Gemini)',
  KLING: 'Kling AI',
  FAL: 'fal.ai',
  ELEVENLABS: 'ElevenLabs',
  OTHER: 'Lainnya',
}
