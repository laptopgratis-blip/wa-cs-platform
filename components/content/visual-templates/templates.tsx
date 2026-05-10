// Visual template library — 5 design.
//
// Tiap template = React component. Render dengan inline styles supaya
// stable kalau html-to-image ambil snapshot (Tailwind kelas tetap di-resolve
// karena html-to-image clone DOM with computed style).
//
// Convention: container DIV outermost punya prop ref forwarded supaya
// html-to-image targetkan node ini saja.
import { forwardRef } from 'react'

import type { TemplateMeta, TemplateProps } from './types'

// Helper: pastikan text fallback masuk akal kalau prop kosong.
function fallback(value: string | undefined, def: string): string {
  return value && value.trim() ? value : def
}

// ─── Template 1: Quote Card ───────────────────────────────────────────────
// Background solid accent color, headline besar tengah, body 2 baris di bawah.
// Cocok untuk hook punchy dengan minimal teks.
export const QuoteCard = forwardRef<HTMLDivElement, TemplateProps & { aspect: 'square' | 'story' }>(
  function QuoteCard(props, ref) {
    const bg = fallback(props.background, '#ea580c')
    const fg = '#ffffff'
    return (
      <div
        ref={ref}
        style={{
          width: '100%',
          height: '100%',
          background: bg,
          color: fg,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: props.aspect === 'story' ? '12% 8%' : '10% 8%',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {props.badge && (
          <div
            style={{
              position: 'absolute',
              top: '6%',
              left: '8%',
              padding: '6px 14px',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '999px',
              fontSize: props.aspect === 'story' ? 28 : 24,
              fontWeight: 600,
              letterSpacing: '0.05em',
            }}
          >
            {props.badge}
          </div>
        )}
        <div
          style={{
            fontSize: props.aspect === 'story' ? 88 : 72,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
          }}
        >
          {fallback(props.headline, 'Tulis hook utama di sini')}
        </div>
        {props.body && (
          <div
            style={{
              marginTop: '6%',
              fontSize: props.aspect === 'story' ? 36 : 32,
              fontWeight: 500,
              lineHeight: 1.4,
              opacity: 0.95,
            }}
          >
            {props.body}
          </div>
        )}
        {props.brandLabel && (
          <div
            style={{
              position: 'absolute',
              bottom: '6%',
              fontSize: props.aspect === 'story' ? 26 : 22,
              fontWeight: 500,
              opacity: 0.8,
            }}
          >
            — {props.brandLabel}
          </div>
        )}
      </div>
    )
  },
)

// ─── Template 2: Tip Card ─────────────────────────────────────────────────
// Background cream warm, headline atas dengan accent stripe kiri, body bawah.
// Cocok untuk educational tip.
export const TipCard = forwardRef<HTMLDivElement, TemplateProps & { aspect: 'square' | 'story' }>(
  function TipCard(props, ref) {
    const accent = fallback(props.accent, '#ea580c')
    return (
      <div
        ref={ref}
        style={{
          width: '100%',
          height: '100%',
          background: '#fef3e7',
          color: '#1f1f1f',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: props.aspect === 'story' ? '10% 8%' : '8% 7%',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        <div>
          {props.badge && (
            <div
              style={{
                display: 'inline-block',
                padding: '8px 18px',
                background: accent,
                color: '#fff',
                borderRadius: '999px',
                fontSize: props.aspect === 'story' ? 26 : 22,
                fontWeight: 700,
                letterSpacing: '0.08em',
                marginBottom: '6%',
                textTransform: 'uppercase',
              }}
            >
              {props.badge}
            </div>
          )}
          <div
            style={{
              fontSize: props.aspect === 'story' ? 80 : 64,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              borderLeft: `8px solid ${accent}`,
              paddingLeft: '4%',
              color: '#1f1f1f',
            }}
          >
            {fallback(props.headline, 'Tulis judul tip di sini')}
          </div>
        </div>
        {(props.body || props.caption) && (
          <div
            style={{
              fontSize: props.aspect === 'story' ? 36 : 30,
              fontWeight: 500,
              lineHeight: 1.5,
              color: '#444',
              paddingLeft: '4%',
            }}
          >
            {fallback(props.body, props.caption ?? 'Penjelasan singkat...')}
          </div>
        )}
        {props.brandLabel && (
          <div
            style={{
              fontSize: props.aspect === 'story' ? 24 : 20,
              fontWeight: 600,
              color: accent,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            {props.brandLabel}
          </div>
        )}
      </div>
    )
  },
)

// ─── Template 3: Stat Card ────────────────────────────────────────────────
// Angka SUPER besar di tengah + caption pendek bawah. Dark bg dengan accent.
export const StatCard = forwardRef<HTMLDivElement, TemplateProps & { aspect: 'square' | 'story' }>(
  function StatCard(props, ref) {
    const accent = fallback(props.accent, '#ea580c')
    return (
      <div
        ref={ref}
        style={{
          width: '100%',
          height: '100%',
          background: '#1a1a1a',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '8%',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        {props.badge && (
          <div
            style={{
              fontSize: props.aspect === 'story' ? 32 : 28,
              fontWeight: 600,
              color: accent,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '4%',
            }}
          >
            {props.badge}
          </div>
        )}
        <div
          style={{
            fontSize: props.aspect === 'story' ? 280 : 240,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: '-0.05em',
            color: accent,
          }}
        >
          {fallback(props.headline, '47x')}
        </div>
        <div
          style={{
            marginTop: '6%',
            fontSize: props.aspect === 'story' ? 42 : 36,
            fontWeight: 600,
            lineHeight: 1.3,
            color: '#fff',
            maxWidth: '90%',
          }}
        >
          {fallback(props.body, 'Caption stat di sini')}
        </div>
        {props.brandLabel && (
          <div
            style={{
              position: 'absolute',
              bottom: '6%',
              fontSize: props.aspect === 'story' ? 24 : 20,
              fontWeight: 500,
              opacity: 0.6,
            }}
          >
            {props.brandLabel}
          </div>
        )}
      </div>
    )
  },
)

// ─── Template 4: Story Slide ──────────────────────────────────────────────
// Gradient diagonal bg, headline bold + body. Ringan, modern, cocok untuk
// IG Story dan storytime carousel slide.
export const StorySlide = forwardRef<HTMLDivElement, TemplateProps & { aspect: 'square' | 'story' }>(
  function StorySlide(props, ref) {
    const accent = fallback(props.accent, '#ea580c')
    return (
      <div
        ref={ref}
        style={{
          width: '100%',
          height: '100%',
          background: `linear-gradient(135deg, ${accent} 0%, #c2410c 100%)`,
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: props.aspect === 'story' ? '8%' : '7%',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
        }}
      >
        {props.badge && (
          <div
            style={{
              position: 'absolute',
              top: '6%',
              left: '7%',
              padding: '8px 18px',
              background: 'rgba(0,0,0,0.3)',
              border: '2px solid rgba(255,255,255,0.4)',
              borderRadius: '999px',
              fontSize: props.aspect === 'story' ? 26 : 22,
              fontWeight: 600,
              letterSpacing: '0.05em',
            }}
          >
            {props.badge}
          </div>
        )}
        <div
          style={{
            fontSize: props.aspect === 'story' ? 96 : 76,
            fontWeight: 900,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            marginBottom: '6%',
            textShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}
        >
          {fallback(props.headline, 'Headline story slide')}
        </div>
        {props.body && (
          <div
            style={{
              fontSize: props.aspect === 'story' ? 38 : 32,
              fontWeight: 500,
              lineHeight: 1.4,
              opacity: 0.95,
              marginBottom: '4%',
            }}
          >
            {props.body}
          </div>
        )}
        {props.cta && (
          <div
            style={{
              display: 'inline-block',
              padding: '14px 28px',
              background: '#fff',
              color: accent,
              borderRadius: '12px',
              fontSize: props.aspect === 'story' ? 32 : 28,
              fontWeight: 700,
              alignSelf: 'flex-start',
              marginTop: '4%',
            }}
          >
            {props.cta}
          </div>
        )}
      </div>
    )
  },
)

// ─── Template 5: Numbered Card ────────────────────────────────────────────
// Angka besar di kiri (50%), text content di kanan. Cocok untuk listicle/
// step-by-step carousel.
export const NumberedCard = forwardRef<HTMLDivElement, TemplateProps & { aspect: 'square' | 'story' }>(
  function NumberedCard(props, ref) {
    const accent = fallback(props.accent, '#ea580c')
    const isStory = props.aspect === 'story'
    return (
      <div
        ref={ref}
        style={{
          width: '100%',
          height: '100%',
          background: '#fff',
          color: '#1f1f1f',
          display: 'flex',
          flexDirection: isStory ? 'column' : 'row',
          alignItems: 'stretch',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            width: isStory ? '100%' : '45%',
            height: isStory ? '40%' : '100%',
            background: accent,
            color: '#fff',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: isStory ? 380 : 320,
            fontWeight: 900,
            lineHeight: 1,
            letterSpacing: '-0.05em',
          }}
        >
          {fallback(props.badge, '01')}
        </div>
        <div
          style={{
            width: isStory ? '100%' : '55%',
            height: isStory ? '60%' : '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: isStory ? '8%' : '6%',
            gap: '4%',
          }}
        >
          <div
            style={{
              fontSize: isStory ? 64 : 56,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              color: '#1f1f1f',
            }}
          >
            {fallback(props.headline, 'Step satu')}
          </div>
          {(props.body || props.caption) && (
            <div
              style={{
                fontSize: isStory ? 32 : 28,
                fontWeight: 500,
                lineHeight: 1.5,
                color: '#444',
              }}
            >
              {fallback(props.body, props.caption ?? 'Penjelasan step ini...')}
            </div>
          )}
          {props.brandLabel && (
            <div
              style={{
                marginTop: 'auto',
                fontSize: isStory ? 22 : 18,
                fontWeight: 600,
                color: accent,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {props.brandLabel}
            </div>
          )}
        </div>
      </div>
    )
  },
)

// ─── Registry ────────────────────────────────────────────────────────────

export const TEMPLATES: TemplateMeta[] = [
  {
    id: 'quote',
    name: 'Quote Card',
    description: 'Hook punchy minimal teks, background solid orange',
    fitChannels: ['WA_STATUS', 'IG_STORY', 'IG_POST', 'IG_CAROUSEL_COVER'],
    defaultAccent: '#ffffff',
    defaultBackground: '#ea580c',
  },
  {
    id: 'tip',
    name: 'Tip Card',
    description: 'Educational tip dengan accent stripe kiri, cream bg',
    fitChannels: ['IG_POST', 'IG_CAROUSEL_BODY'],
    defaultAccent: '#ea580c',
    defaultBackground: '#fef3e7',
  },
  {
    id: 'stat',
    name: 'Stat Card',
    description: 'Angka super besar dark bg — perfect untuk shocking statistic',
    fitChannels: ['IG_POST', 'IG_CAROUSEL_BODY', 'IG_STORY'],
    defaultAccent: '#ea580c',
    defaultBackground: '#1a1a1a',
  },
  {
    id: 'story',
    name: 'Story Slide',
    description: 'Gradient diagonal modern, cocok IG Story / WA Status',
    fitChannels: ['WA_STATUS', 'IG_STORY', 'IG_CAROUSEL_CTA'],
    defaultAccent: '#ea580c',
    defaultBackground: '#ea580c',
  },
  {
    id: 'numbered',
    name: 'Numbered Card',
    description: 'Step listicle, angka besar kiri + text kanan',
    fitChannels: ['IG_CAROUSEL_BODY', 'IG_POST'],
    defaultAccent: '#ea580c',
    defaultBackground: '#ffffff',
  },
]

export function getTemplateComponent(id: string) {
  switch (id) {
    case 'quote':
      return QuoteCard
    case 'tip':
      return TipCard
    case 'stat':
      return StatCard
    case 'story':
      return StorySlide
    case 'numbered':
      return NumberedCard
    default:
      return QuoteCard
  }
}
