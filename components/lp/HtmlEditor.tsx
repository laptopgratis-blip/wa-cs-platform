'use client'

// HtmlEditor — textarea mono untuk edit HTML LP. Tombol Format & Simpan,
// counter karakter. Update ke parent realtime; debouncing ke preview ditangani
// di LivePreview supaya iframe tidak rerender setiap keystroke.
import { Code2, Save, Wand2 } from 'lucide-react'
import { useCallback } from 'react'

import { Button } from '@/components/ui/button'

interface Props {
  value: string
  onChange: (v: string) => void
  onSaveNow: () => void
}

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

export function HtmlEditor({ value, onChange, onSaveNow }: Props) {
  const handleFormat = useCallback(() => {
    if (!value.trim()) return
    onChange(simpleFormatHtml(value))
  }, [value, onChange])

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
      <div className="min-h-0 flex-1">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder={
            value
              ? ''
              : 'Generate HTML pakai AI di atas, atau paste HTML kamu di sini.'
          }
          className="block h-full w-full resize-none border-0 bg-warm-900 px-4 py-3 font-mono text-[12px] leading-relaxed text-warm-100 placeholder:text-warm-500 focus:outline-none"
        />
      </div>
    </div>
  )
}
