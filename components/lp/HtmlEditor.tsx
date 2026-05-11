'use client'

// HtmlEditor — textarea mono untuk edit HTML LP. Tombol Format & Simpan,
// counter karakter. Update ke parent realtime; debouncing ke preview ditangani
// di LivePreview supaya iframe tidak rerender setiap keystroke.
//
// Highlight sync: kalau parent kirim `highlightRange` (offset opening..closing
// tag di raw HTML), kita render mirror-div di belakang textarea yang nge-mark
// range itu dengan background amber — supaya selection tetap kelihatan walau
// textarea kehilangan fokus. Native textarea selection cuma backup.
import { Code2, Save, Wand2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef } from 'react'

import { Button } from '@/components/ui/button'

interface Props {
  value: string
  onChange: (v: string) => void
  onSaveNow: () => void
  // Offset di `value` yang harus di-highlight saat berubah (mis. dari klik
  // elemen di LivePreview). null = no-op.
  highlightRange?: { start: number; end: number } | null
}

// Style yang HARUS identik antara textarea & mirror supaya wrapping persis sama.
// Pakai konstanta supaya tidak ada drift kalau salah satu diubah.
const MONO_TEXT_CLASSES =
  'font-mono text-[12px] leading-relaxed whitespace-pre-wrap break-words'
const PADDING_CLASSES = 'px-4 py-3'

// Format HTML sederhana via regex — bukan full prettifier.
// Aman untuk kasus umum: insert newline setelah block-level tag close,
// indent dasar 2 spasi per nesting. Skip kalau ada <pre>/<script>/<style>
// (preserve content di dalamnya).
function simpleFormatHtml(html: string): string {
  // Step 1: collapse whitespace di luar tag, normalize newlines.
  let s = html.replace(/\r\n/g, '\n').trim()

  // Lindungi isi <script>, <style>, <pre> dari auto-format.
  const placeholders: string[] = []
  s = s.replace(/<(script|style|pre)\b[^>]*>[\s\S]*?<\/\1>/gi, (m) => {
    const i = placeholders.length
    placeholders.push(m)
    return `__PRESERVE_${i}__`
  })

  // Step 2: pastikan setiap tag di baris sendiri.
  s = s.replace(/>\s*</g, '>\n<')

  // Step 3: indent berdasarkan depth.
  const VOID_TAGS = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ])
  const lines = s.split('\n')
  let depth = 0
  const out: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    // Closing tag → decrement depth dulu.
    if (/^<\//.test(line)) depth = Math.max(0, depth - 1)
    out.push('  '.repeat(depth) + line)
    // Opening tag yang bukan self-closing & bukan void → increment depth.
    if (
      /^<[a-zA-Z]/.test(line) &&
      !/\/>\s*$/.test(line) &&
      !/<\/[a-zA-Z][^>]*>\s*$/.test(line) // jangan increment kalau ada close tag di line yang sama
    ) {
      const tagMatch = line.match(/^<([a-zA-Z][a-zA-Z0-9-]*)/)
      const tag = tagMatch?.[1]?.toLowerCase()
      if (tag && !VOID_TAGS.has(tag)) depth++
    }
  }
  let result = out.join('\n')

  // Restore preserved blocks.
  result = result.replace(/__PRESERVE_(\d+)__/g, (_, i) => placeholders[Number(i)] ?? '')
  return result
}

// Pecah `value` jadi 3 segmen berdasarkan highlightRange yang sudah di-clamp.
function splitForMirror(
  value: string,
  range: { start: number; end: number } | null | undefined,
): { before: string; mid: string; after: string } | null {
  if (!range) return null
  const len = value.length
  const s = Math.max(0, Math.min(range.start, len))
  const e = Math.max(s, Math.min(range.end, len))
  if (e <= s) return null
  return {
    before: value.slice(0, s),
    mid: value.slice(s, e),
    after: value.slice(e),
  }
}

export function HtmlEditor({ value, onChange, onSaveNow, highlightRange }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)

  const handleFormat = useCallback(() => {
    if (!value.trim()) return
    onChange(simpleFormatHtml(value))
  }, [value, onChange])

  const segments = useMemo(
    () => splitForMirror(value, highlightRange),
    [value, highlightRange],
  )

  // Apply highlight: scroll baris ke ~1/3 atas + set native selection (backup
  // kalau ada user yang lebih familiar dengan caret selection ala editor).
  useEffect(() => {
    if (!highlightRange) return
    const ta = taRef.current
    if (!ta) return
    const { start, end } = highlightRange
    if (start < 0 || end <= start) return
    const len = ta.value.length
    const s = Math.min(start, len)
    const e = Math.min(end, len)
    // Set native selection — sebagian browser akan show ini juga; mirror tetap
    // jadi primary visual cue.
    try {
      ta.focus({ preventScroll: true })
      ta.setSelectionRange(s, e)
    } catch {
      // Some browsers throw if textarea hidden — abaikan.
    }
    // Scroll baris yang berisi `start` ke ~1/3 tinggi.
    const lineIndex = value.slice(0, s).split('\n').length - 1
    const cs = window.getComputedStyle(ta)
    const lh = parseFloat(cs.lineHeight)
    const lineHeight = Number.isFinite(lh) && lh > 0 ? lh : 19
    const targetScroll = Math.max(0, lineIndex * lineHeight - ta.clientHeight / 3)
    ta.scrollTop = targetScroll
    // Mirror akan sync via onScroll handler textarea.
    if (mirrorRef.current) mirrorRef.current.scrollTop = ta.scrollTop
  }, [highlightRange, value])

  // Sync scroll mirror ke textarea — supaya highlight tetap align saat user scroll.
  const handleScroll = useCallback(() => {
    const ta = taRef.current
    const mirror = mirrorRef.current
    if (!ta || !mirror) return
    mirror.scrollTop = ta.scrollTop
    mirror.scrollLeft = ta.scrollLeft
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-warm-200 bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-warm-600" />
          <span className="font-display text-sm font-bold text-warm-900">
            HTML Editor
          </span>
          <span className="text-[10px] text-warm-500">
            {value.length.toLocaleString('id-ID')} karakter
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleFormat}
            disabled={!value.trim()}
            className="h-7 text-xs"
            title="Format HTML (rapikan indentasi)"
          >
            <Wand2 className="mr-1.5 size-3" />
            Format
          </Button>
          <Button
            size="sm"
            onClick={onSaveNow}
            className="h-7 bg-primary-500 text-xs text-white shadow-orange hover:bg-primary-600"
          >
            <Save className="mr-1.5 size-3" />
            Simpan
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 bg-warm-900">
        {/* Mirror di belakang textarea: render konten yang sama tapi cuma untuk
            visual highlight (text transparent, <mark> dengan bg warna). Sync
            scroll via onScroll handler textarea. pointer-events: none supaya
            klik tetap ke textarea. */}
        <div
          ref={mirrorRef}
          aria-hidden
          className={`pointer-events-none absolute inset-0 overflow-hidden text-transparent ${MONO_TEXT_CLASSES} ${PADDING_CLASSES}`}
        >
          {segments ? (
            <>
              {segments.before}
              <mark className="rounded-sm bg-amber-300/35 ring-2 ring-amber-400/70 text-transparent">
                {segments.mid}
              </mark>
              {segments.after}
              {/* Trailing newline supaya line terakhir tetap dirender di mirror.
                  Textarea auto-render virtual newline; mirror harus eksplisit. */}
              {'\n'}
            </>
          ) : null}
        </div>

        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          spellCheck={false}
          placeholder={
            value
              ? ''
              : 'Generate HTML pakai AI di atas, atau paste HTML kamu di sini.'
          }
          className={`relative block h-full w-full resize-none border-0 bg-transparent text-warm-100 placeholder:text-warm-500 focus:outline-none selection:bg-amber-400/40 selection:text-amber-50 ${MONO_TEXT_CLASSES} ${PADDING_CLASSES}`}
        />
      </div>
    </div>
  )
}
