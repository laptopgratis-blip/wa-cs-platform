// External signals — fetch trending search queries dari Google Suggest
// (autocomplete API). Free, no auth, Indonesia locale.
//
// Pattern: setiap keyword punya "longtail" suggestion dari real user search.
// Itu signal demand nyata yg bisa dipakai AI untuk generate konten yg
// match search intent.
//
// Hindari pakai Google Trends RSS karena lebih fragile & sering rate-limit
// di lingkungan server. Suggest API stable & ringan.

const SUGGEST_ENDPOINT = 'https://suggestqueries.google.com/complete/search'
const FETCH_TIMEOUT_MS = 8_000

export interface SuggestSignal {
  seed: string // keyword input
  suggestions: string[] // dari Google
}

// Fetch dengan timeout abort. Return [] kalau gagal — caller harus tetap
// jalan tanpa signal (graceful degradation).
async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; HulaoBot/1.0; +https://hulao.id)',
        Accept: 'application/json,*/*',
      },
    })
    return res
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchGoogleSuggestions(
  seedKeyword: string,
): Promise<SuggestSignal> {
  const seed = seedKeyword.trim().slice(0, 80)
  if (!seed) return { seed, suggestions: [] }
  const url = `${SUGGEST_ENDPOINT}?client=firefox&hl=id&gl=ID&q=${encodeURIComponent(seed)}`
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)
  if (!res || !res.ok) return { seed, suggestions: [] }
  try {
    const json = (await res.json()) as unknown
    // Format: ["query", ["s1","s2",...]]
    if (Array.isArray(json) && Array.isArray(json[1])) {
      const suggestions = (json[1] as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length < 200)
        .slice(0, 10) // top 10 saja
      return { seed, suggestions }
    }
  } catch {
    /* ignore */
  }
  return { seed, suggestions: [] }
}

// Fetch multi-seed paralel. Dedup suggestions across seeds.
export async function fetchSuggestionsBatch(
  seeds: string[],
): Promise<SuggestSignal[]> {
  const unique = Array.from(new Set(seeds.map((s) => s.trim()).filter(Boolean)))
    .slice(0, 5) // max 5 seed supaya tidak abuse
  if (unique.length === 0) return []
  const results = await Promise.all(unique.map(fetchGoogleSuggestions))
  return results
}

// Extract seed keyword dari LP/brief context — heuristic sederhana:
// ambil 2-4 noun-phrase paling sering muncul. Untuk MVP, pakai title/topic
// saja sebagai seed primer.
export function extractSeeds(input: {
  lpTitle?: string
  manualTitle?: string
  manualAudience?: string
  manualOffer?: string
  contentSnippet?: string
}): string[] {
  const seeds: string[] = []
  const primary = input.lpTitle ?? input.manualTitle
  if (primary) {
    seeds.push(primary)
    // Ambil bigram dari title — mis. "Kelas Closing WA" → ["closing wa", "kelas closing"]
    const words = primary.toLowerCase().split(/\s+/).filter((w) => w.length > 2)
    if (words.length >= 2) {
      for (let i = 0; i < words.length - 1; i++) {
        const bigram = `${words[i]} ${words[i + 1]}`
        if (bigram.length > 6) seeds.push(bigram)
      }
    }
  }
  if (input.manualOffer && input.manualOffer.length < 100) {
    seeds.push(input.manualOffer)
  }
  if (input.manualAudience && input.manualAudience.length < 100) {
    seeds.push(input.manualAudience)
  }
  return seeds.slice(0, 5)
}
