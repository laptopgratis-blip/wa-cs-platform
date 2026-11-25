'use client'

// Muat template Meta yang bisa dipilih untuk follow-up: non-AUTHENTICATION,
// status APPROVED/PENDING, dari SEMUA WABA user + daftar WABA yang punya sesi
// Cloud API CONNECTED. Penyaringan per WABA (CONNECTED, atau WABA nomor
// "Kirim dari" walau offline) ada di metaTemplatesForSender
// (lib/services/followup-sender-options.ts). Template yang sedang tertaut
// tetap disertakan (supaya pilihan saat ini terlihat).
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
  /** WABA yang punya sesi Cloud API CONNECTED. */
  connectedWabaIds: string[]
}

interface TemplatesResponse {
  success: boolean
  data: { templates: WabaTemplateDto[]; sessions: CloudSessionOption[] }
}

function selectable(
  data: TemplatesResponse['data'],
  currentId: string | null,
): WabaTemplateDto[] {
  return data.templates.filter(
    (t) =>
      t.id === currentId ||
      (t.category !== 'AUTHENTICATION' && SELECTABLE_STATUSES.has(t.status)),
  )
}

function connectedWabaIds(data: TemplatesResponse['data']): string[] {
  const ids = data.sessions
    .filter((s) => s.status === 'CONNECTED' && s.wabaId)
    .map((s) => s.wabaId as string)
  return [...new Set(ids)]
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
    connectedWabaIds: [],
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
              connectedWabaIds: connectedWabaIds(res.data.data),
            }
          : {
              loading: false,
              error: res.error,
              templates: [],
              connectedWabaIds: [],
            },
      )
    })
    return () => {
      cancelled = true
    }
  }, [enabled])

  return state
}
