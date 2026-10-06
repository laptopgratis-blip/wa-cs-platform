'use client'

// Muat template Meta yang bisa dipilih untuk follow-up: WABA dari sesi Cloud
// API yang CONNECTED, non-AUTHENTICATION, status APPROVED/PENDING. Template
// yang sedang tertaut tetap disertakan (supaya pilihan saat ini terlihat).
import { useEffect, useRef, useState } from 'react'

import type {
  CloudSessionOption,
  WabaTemplateDto,
} from '@/components/waba-templates/types'
import { fetchJson } from '@/lib/fetch-json'

const SELECTABLE_STATUSES = new Set(['APPROVED', 'PENDING'])

export interface MetaTemplateOptions {
  loading: boolean
  error: string | null
  templates: WabaTemplateDto[]
}

interface TemplatesResponse {
  success: boolean
  data: { templates: WabaTemplateDto[]; sessions: CloudSessionOption[] }
}

function selectable(
  data: TemplatesResponse['data'],
  currentId: string | null,
): WabaTemplateDto[] {
  const wabaIds = new Set(
    data.sessions
      .filter((s) => s.status === 'CONNECTED' && s.wabaId)
      .map((s) => s.wabaId as string),
  )
  return data.templates.filter(
    (t) =>
      t.id === currentId ||
      (wabaIds.has(t.wabaId) &&
        t.category !== 'AUTHENTICATION' &&
        SELECTABLE_STATUSES.has(t.status)),
  )
}

export function useMetaTemplateOptions(
  enabled: boolean,
  currentId: string | null,
): MetaTemplateOptions {
  // Template tertaut saat modal dibuka (modal di-remount per template).
  const initialIdRef = useRef(currentId)
  const [state, setState] = useState<MetaTemplateOptions>({
    loading: enabled,
    error: null,
    templates: [],
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    void fetchJson<TemplatesResponse>(
      '/api/whatsapp/templates',
      { cache: 'no-store' },
      'Gagal memuat Template Meta',
    ).then((res) => {
      if (cancelled) return
      setState(
        res.ok && res.data
          ? {
              loading: false,
              error: null,
              templates: selectable(res.data.data, initialIdRef.current),
            }
          : { loading: false, error: res.error, templates: [] },
      )
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return state
}
