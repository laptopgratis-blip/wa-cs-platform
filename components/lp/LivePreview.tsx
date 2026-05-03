'use client'

// LivePreview — render HTML editor langsung ke iframe via srcDoc.
// Debounce 800ms supaya iframe tidak rerender setiap keystroke (mahal).
// Toggle viewport di-pass dari shell (state ada di topbar).
import { Eye, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Viewport } from '@/components/lp/EditorTopbar'

const DEBOUNCE_MS = 800
// Sandbox iframe — jalankan script & style halaman LP, tapi blokir top-navigation
// & form submit ke parent. allow-popups untuk wa.me link buka tab baru.
const IFRAME_SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms'

interface Props {
  htmlContent: string
  viewport: Viewport
}

export function LivePreview({ htmlContent, viewport }: Props) {
  const [debouncedHtml, setDebouncedHtml] = useState(htmlContent)
  // refreshKey — naikkan untuk force iframe remount saat user klik refresh.
  const [refreshKey, setRefreshKey] = useState(0)

  // Debounce update ke iframe.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedHtml(htmlContent), DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [htmlContent])

  const isMobile = viewport === 'mobile'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-warm-200 bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-warm-600" />
          <span className="font-display text-sm font-bold text-warm-900">
            Preview
          </span>
          <span className="text-[10px] text-warm-500">
            {isMobile ? 'Mobile · 375px' : 'Desktop · 100%'}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="h-7 text-xs"
          title="Refresh preview"
        >
          <RotateCw className="mr-1.5 size-3" />
          Refresh
        </Button>
      </div>

      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-auto p-4',
          isMobile && 'flex justify-center',
        )}
      >
        {/* Watermark "Preview" tipis di pojok kanan atas */}
        <div
          aria-hidden
          className="pointer-events-none absolute right-6 top-6 z-10 select-none rounded-md bg-warm-900/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/80 backdrop-blur-sm"
        >
          Preview
        </div>

        <div
          className={cn(
            'h-full overflow-hidden rounded-md border border-warm-200 bg-card shadow-sm',
            isMobile ? 'w-[375px] flex-shrink-0' : 'w-full',
          )}
        >
          {debouncedHtml.trim() ? (
            <iframe
              key={refreshKey}
              title="Live preview LP"
              srcDoc={debouncedHtml}
              sandbox={IFRAME_SANDBOX}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-warm-500">
              Preview kosong — generate HTML pakai AI atau ketik HTML di
              editor.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
