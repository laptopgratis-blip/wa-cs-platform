'use client'

// /admin/api-keys — kelola encrypted API key 3 provider AI.
// 3 cards (Anthropic/OpenAI/Google), masing-masing: input password (show/hide),
// tombol Save & Test, status badge real-time, info terakhir di-test.
//
// Auto-behavior:
// - Saat halaman load → trigger /test-all di background (refresh status).
// - Tombol "Refresh All" di atas → test ulang semua.
// - Polling otomatis tiap 1 jam selama tab terbuka.
import { formatDistanceToNow } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import {
  Eye,
  EyeOff,
  Key,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type Provider = 'ANTHROPIC' | 'OPENAI' | 'GOOGLE'

interface KeyRow {
  provider: Provider
  maskedKey: string | null
  isActive: boolean
  lastTestedAt: string | null
  lastTestStatus: string | null
  lastTestError: string | null
}

const PROVIDERS: Provider[] = ['ANTHROPIC', 'OPENAI', 'GOOGLE']

const PROVIDER_LABEL: Record<Provider, string> = {
  ANTHROPIC: 'Anthropic',
  OPENAI: 'OpenAI',
  GOOGLE: 'Google',
}

const PROVIDER_EMOJI: Record<Provider, string> = {
  ANTHROPIC: '🟠',
  OPENAI: '🟢',
  GOOGLE: '🔵',
}

const ONE_HOUR_MS = 60 * 60 * 1_000
const POLL_INTERVAL_MS = ONE_HOUR_MS
const STALE_TEST_MS = 24 * ONE_HOUR_MS

type StatusKind = 'AKTIF' | 'BELUM_DITES' | 'ERROR' | 'KOSONG'

function statusOf(row: KeyRow): StatusKind {
  if (!row.maskedKey) return 'KOSONG'
  if (row.lastTestStatus === 'FAILED') return 'ERROR'
  if (!row.lastTestedAt) return 'BELUM_DITES'
  const ageMs = Date.now() - new Date(row.lastTestedAt).getTime()
  if (row.lastTestStatus === 'SUCCESS' && ageMs < STALE_TEST_MS) return 'AKTIF'
  return 'BELUM_DITES'
}

const STATUS_LABEL: Record<StatusKind, string> = {
  AKTIF: '🟢 Aktif',
  BELUM_DITES: '🟡 Belum dites',
  ERROR: '🔴 Error',
  KOSONG: '⚪ Kosong',
}

const STATUS_STYLE: Record<StatusKind, string> = {
  AKTIF: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  BELUM_DITES: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  ERROR: 'bg-red-100 text-red-700 hover:bg-red-100',
  KOSONG: 'bg-warm-100 text-warm-600 hover:bg-warm-100',
}

export function ApiKeysManager() {
  const [rows, setRows] = useState<Record<Provider, KeyRow> | null>(null)
  const [draft, setDraft] = useState<Record<Provider, string>>({
    ANTHROPIC: '',
    OPENAI: '',
    GOOGLE: '',
  })
  const [showKey, setShowKey] = useState<Record<Provider, boolean>>({
    ANTHROPIC: false,
    OPENAI: false,
    GOOGLE: false,
  })
  const [savingId, setSavingId] = useState<Provider | null>(null)
  const [testingId, setTestingId] = useState<Provider | null>(null)
  const [refreshingAll, setRefreshingAll] = useState(false)

  const fetchKeys = useCallback(async () => {
    const res = await fetch('/api/admin/api-keys')
    const json = (await res.json()) as { success: boolean; data?: KeyRow[] }
    if (json.success && json.data) {
      const map = {} as Record<Provider, KeyRow>
      json.data.forEach((r) => {
        map[r.provider] = r
      })
      setRows(map)
    }
  }, [])

  const refreshAll = useCallback(
    async (showToast = true) => {
      setRefreshingAll(true)
      try {
        const res = await fetch('/api/admin/api-keys/test-all', {
          method: 'POST',
        })
        if (!res.ok) {
          if (showToast) toast.error('Gagal test semua')
          return
        }
        await fetchKeys()
        if (showToast) toast.success('Test selesai')
      } finally {
        setRefreshingAll(false)
      }
    },
    [fetchKeys],
  )

  useEffect(() => {
    void fetchKeys().then(() => {
      // Background test ringan setelah load awal.
      void refreshAll(false)
    })
  }, [fetchKeys, refreshAll])

  // Polling 1 jam selama tab terbuka.
  useEffect(() => {
    const t = setInterval(() => {
      void refreshAll(false)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(t)
  }, [refreshAll])

  async function saveKey(provider: Provider) {
    const value = draft[provider].trim()
    if (!value) {
      toast.error('Isi API key dulu')
      return
    }
    setSavingId(provider)
    try {
      const res = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: value }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal menyimpan')
        return
      }
      setDraft((prev) => ({ ...prev, [provider]: '' }))
      toast.success(`Key ${PROVIDER_LABEL[provider]} disimpan`)
      await fetchKeys()
    } finally {
      setSavingId(null)
    }
  }

  async function testKey(provider: Provider) {
    setTestingId(provider)
    try {
      const res = await fetch(
        `/api/admin/api-keys/${provider}/test`,
        { method: 'POST' },
      )
      const json = (await res.json()) as {
        success: boolean
        error?: string
        data?: { ok: boolean; httpStatus: number; error?: string }
      }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal test')
        return
      }
      if (json.data?.ok) {
        toast.success(`${PROVIDER_LABEL[provider]} OK`)
      } else {
        toast.error(
          `${PROVIDER_LABEL[provider]} gagal: ${json.data?.error ?? 'unknown'}`,
        )
      }
      await fetchKeys()
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            API Keys
          </h1>
          <p className="mt-1 text-sm text-warm-500">
            Kelola API key provider AI. Disimpan terenkripsi (AES-256-GCM) di DB.
            Tidak pernah dikembalikan plaintext lewat API.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => refreshAll()}
          disabled={refreshingAll}
        >
          {refreshingAll ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 size-4" />
          )}
          Refresh All
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {PROVIDERS.map((p) => {
          const row = rows?.[p]
          const status = row ? statusOf(row) : 'KOSONG'
          const isShown = showKey[p]
          const isSaving = savingId === p
          const isTesting = testingId === p
          return (
            <Card key={p}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{PROVIDER_EMOJI[p]}</span>
                    {PROVIDER_LABEL[p]}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn('font-normal', STATUS_STYLE[status])}
                  >
                    {STATUS_LABEL[status]}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {row?.maskedKey ? (
                    <span className="font-mono">{row.maskedKey}</span>
                  ) : (
                    <span>Belum ada key</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {row?.lastTestError && status === 'ERROR' && (
                  <p className="rounded-md bg-red-50 px-2 py-1.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {row.lastTestError}
                  </p>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor={`key-${p}`}>API Key baru</Label>
                  <div className="relative">
                    <Input
                      id={`key-${p}`}
                      type={isShown ? 'text' : 'password'}
                      value={draft[p]}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [p]: e.target.value }))
                      }
                      placeholder={
                        row?.maskedKey
                          ? row.maskedKey
                          : 'sk-... / AIza... / sk-ant-...'
                      }
                      autoComplete="off"
                      className="pr-9 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowKey((prev) => ({ ...prev, [p]: !prev[p] }))
                      }
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={isShown ? 'Sembunyikan' : 'Tampilkan'}
                    >
                      {isShown ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => saveKey(p)}
                    disabled={isSaving || !draft[p].trim()}
                    className="flex-1"
                  >
                    {isSaving && (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    )}
                    Save
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => testKey(p)}
                    disabled={isTesting || !row?.maskedKey}
                    className="flex-1"
                  >
                    {isTesting ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Key className="mr-2 size-4" />
                    )}
                    Test
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {row?.lastTestedAt
                    ? `Terakhir dites: ${formatDistanceToNow(
                        new Date(row.lastTestedAt),
                        { addSuffix: true, locale: idLocale },
                      )}`
                    : 'Belum pernah dites'}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
