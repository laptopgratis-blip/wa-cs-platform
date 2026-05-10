// Type definition shared untuk visual template library.
//
// Template = React component fungsional. Terima props standar TemplateProps,
// render via DOM (HTML+CSS) supaya html-to-image bisa convert ke PNG.
//
// Dimensi DOM = render size scaled per device. Real export size constant
// (1080x1080 / 1080x1920) di-set lewat container width+height saat capture.

export type TemplateChannel =
  | 'WA_STATUS'
  | 'IG_STORY'
  | 'IG_POST'
  | 'IG_CAROUSEL_COVER'
  | 'IG_CAROUSEL_BODY'
  | 'IG_CAROUSEL_CTA'

export interface TemplateProps {
  // Text fields — semua optional, template render fallback kalau kosong.
  headline?: string
  body?: string
  caption?: string
  badge?: string // mis. "1/5", "TIP #1"
  cta?: string
  brandLabel?: string // mis. "Hulao Belajar", optional footer
  // Color theme — kalau template support, override default.
  accent?: string // hex
  background?: string // hex
}

export interface TemplateMeta {
  id: string
  name: string
  description: string
  // Channel yg paling cocok — display sebagai filter di selector.
  fitChannels: TemplateChannel[]
  // Default theme.
  defaultAccent: string
  defaultBackground: string
}

// Aspect ratio per channel — width:height. Render container fixed sesuai.
export const CHANNEL_DIMENSIONS: Record<
  Exclude<TemplateChannel, 'IG_CAROUSEL_COVER' | 'IG_CAROUSEL_BODY' | 'IG_CAROUSEL_CTA'>,
  { width: number; height: number }
> = {
  WA_STATUS: { width: 1080, height: 1920 }, // 9:16
  IG_STORY: { width: 1080, height: 1920 }, // 9:16
  IG_POST: { width: 1080, height: 1080 }, // 1:1
}

export const CAROUSEL_DIMENSIONS = { width: 1080, height: 1080 }
