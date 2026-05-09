// Lightweight User-Agent parser — extract device type, browser, OS.
// Sengaja regex-based bukan library (ua-parser-js ~30KB) supaya bundle kecil
// dan request handler ringan. Trade-off: tidak detect semua edge case browser
// minor; tapi cukup untuk analytics digital marketing.
//
// Output format konsisten — UPPERCASE untuk deviceType (matching Prisma
// convention enum-string), TitleCase untuk browser/os.

export type DeviceType = 'MOBILE' | 'TABLET' | 'DESKTOP' | 'BOT' | null

export interface ParsedUa {
  deviceType: DeviceType
  browser: string | null
  os: string | null
}

// Bot detection (subset umum + generic). Bot sengaja diberi deviceType=BOT
// supaya bisa di-filter di analytics.
const BOT_PATTERNS =
  /bot|crawl|spider|slurp|search|fetch|monitor|preview|scan|wget|curl|python-requests|axios|node-fetch|google-pagerender|lighthouse|insights|gtmetrix|pingdom|uptimerobot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegram|skypeuripreview|discordbot|slackbot/i

function detectDeviceType(ua: string): DeviceType {
  if (!ua) return null
  if (BOT_PATTERNS.test(ua)) return 'BOT'
  // Tablet harus dicek sebelum mobile — iPad ada di Mac UA modern, Android
  // tablet biasanya tidak ada token "Mobile".
  if (/iPad/i.test(ua)) return 'TABLET'
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'TABLET'
  if (/Tablet/i.test(ua)) return 'TABLET'
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry/i.test(ua)) {
    return 'MOBILE'
  }
  return 'DESKTOP'
}

function detectBrowser(ua: string): string | null {
  if (!ua) return null
  // Order penting — Edge & Opera contains "Chrome"; Chrome iOS contains "Safari".
  if (/Edg(e|A|iOS)?\//i.test(ua)) return 'Edge'
  if (/OPR\/|Opera/i.test(ua)) return 'Opera'
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet'
  if (/UCBrowser/i.test(ua)) return 'UC Browser'
  if (/FxiOS\//i.test(ua)) return 'Firefox iOS'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  if (/CriOS\//i.test(ua)) return 'Chrome iOS'
  if (/Chrome\//i.test(ua)) return 'Chrome'
  if (/Safari\//i.test(ua)) return 'Safari'
  if (/MSIE|Trident\//i.test(ua)) return 'Internet Explorer'
  return null
}

function detectOs(ua: string): string | null {
  if (!ua) return null
  if (/iPhone OS|iPad OS|iPad;|iPhone;|iPod;/i.test(ua)) return 'iOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows Phone/i.test(ua)) return 'Windows Phone'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS'
  if (/Windows NT/i.test(ua)) return 'Windows'
  if (/CrOS/i.test(ua)) return 'ChromeOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return null
}

export function parseUa(ua: string | null | undefined): ParsedUa {
  const s = (ua ?? '').slice(0, 1000)
  return {
    deviceType: detectDeviceType(s),
    browser: detectBrowser(s),
    os: detectOs(s),
  }
}
