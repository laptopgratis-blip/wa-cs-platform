// Daftar preset AI model yang umum dipakai. UI di /admin/models pakai ini
// untuk dropdown ModelId + auto-fill harga. Admin tetap bisa override harga
// secara manual setelah pilih (mis. provider naikin harga sebelum kita
// update list ini).
//
// Harga dalam USD per 1 juta token (sesuai schema AiModel.inputPricePer1M /
// outputPricePer1M setelah migration `aimodel_pricing_to_usd`).
export type AiProviderId = 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'

export interface AiModelPreset {
  id: string // model id yang dipakai SDK
  name: string // label di UI
  inputPricePer1M: number // USD
  outputPricePer1M: number // USD
}

export const AI_MODELS_BY_PROVIDER: Record<AiProviderId, AiModelPreset[]> = {
  ANTHROPIC: [
    { id: 'claude-opus-4-5', name: 'Claude Opus 4.5 (Paling Pintar)', inputPricePer1M: 15, outputPricePer1M: 75 },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5 (Pintar)', inputPricePer1M: 3, outputPricePer1M: 15 },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (Cepat & Hemat)', inputPricePer1M: 1, outputPricePer1M: 5 },
  ],
  OPENAI: [
    { id: 'gpt-5', name: 'GPT-5 (Premium)', inputPricePer1M: 1.25, outputPricePer1M: 10 },
    { id: 'gpt-5-mini', name: 'GPT-5 Mini (Hemat)', inputPricePer1M: 0.15, outputPricePer1M: 0.60 },
    { id: 'gpt-4.1', name: 'GPT-4.1', inputPricePer1M: 2.50, outputPricePer1M: 10 },
    { id: 'gpt-4o', name: 'GPT-4o', inputPricePer1M: 2.50, outputPricePer1M: 10 },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', inputPricePer1M: 0.15, outputPricePer1M: 0.60 },
  ],
  GOOGLE: [
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Pintar)', inputPricePer1M: 1.25, outputPricePer1M: 10 },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Hemat)', inputPricePer1M: 0.30, outputPricePer1M: 2.50 },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (Termurah)', inputPricePer1M: 0.10, outputPricePer1M: 0.40 },
  ],
}

export function findPreset(
  provider: AiProviderId,
  modelId: string,
): AiModelPreset | undefined {
  return AI_MODELS_BY_PROVIDER[provider]?.find((m) => m.id === modelId)
}
