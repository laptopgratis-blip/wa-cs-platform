'use client'

// API Playground ala kirimchat: pilih endpoint, tempel kunci, isi parameter,
// jalankan — respons + header kuota tampil langsung. Kunci hanya hidup di
// state komponen (tidak pernah disimpan).
import { Loader2, Play } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ParamDef {
  name: string
  label: string
  required?: boolean
  placeholder?: string
  /** 'query' = querystring; 'path' = disisipkan ke path. */
  kind: 'query' | 'path'
}

interface EndpointDef {
  id: string
  label: string
  /** Path dengan {param} untuk path param. */
  path: string
  params: ParamDef[]
}

const ENDPOINTS: EndpointDef[] = [
  { id: 'ping', label: 'GET /ping — uji kunci', path: '/api/v1/ping', params: [] },
  {
    id: 'contacts',
    label: 'GET /contacts — daftar kontak',
    path: '/api/v1/contacts',
    params: [
      { name: 'search', label: 'search', kind: 'query', placeholder: 'nama / nomor' },
      { name: 'stage', label: 'stage', kind: 'query', placeholder: 'NEW / PROSPECT / …' },
      { name: 'tag', label: 'tag', kind: 'query' },
      { name: 'limit', label: 'limit', kind: 'query', placeholder: '25' },
      { name: 'cursor', label: 'cursor', kind: 'query' },
    ],
  },
  {
    id: 'contact-detail',
    label: 'GET /contacts/{id} — detail kontak',
    path: '/api/v1/contacts/{id}',
    params: [{ name: 'id', label: 'id kontak', kind: 'path', required: true }],
  },
  {
    id: 'messages',
    label: 'GET /messages — riwayat pesan',
    path: '/api/v1/messages',
    params: [
      { name: 'contactId', label: 'contactId', kind: 'query', required: true },
      { name: 'limit', label: 'limit', kind: 'query', placeholder: '25' },
      { name: 'cursor', label: 'cursor', kind: 'query' },
    ],
  },
  {
    id: 'message-status',
    label: 'GET /messages/{id}/status — status kirim',
    path: '/api/v1/messages/{externalMsgId}/status',
    params: [{ name: 'externalMsgId', label: 'externalMsgId (wamid)', kind: 'path', required: true }],
  },
  { id: 'balance', label: 'GET /balance — saldo', path: '/api/v1/balance', params: [] },
  { id: 'senders', label: 'GET /senders — nomor terhubung', path: '/api/v1/senders', params: [] },
]

interface RunResult {
  status: number
  durationMs: number
  rateLimit: { limit: string | null; remaining: string | null; reset: string | null }
  body: string
}

// Di luar komponen supaya pemanggilan impure (timer) tidak terjadi di scope
// render — aturan react-compiler repo menandainya sebagai error.
async function timedFetch(url: string, apiKey: string): Promise<RunResult> {
  const started = performance.now()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  const text = await res.text()
  let pretty = text
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    // biarkan mentah kalau bukan JSON
  }
  return {
    status: res.status,
    durationMs: Math.round(performance.now() - started),
    rateLimit: {
      limit: res.headers.get('x-ratelimit-limit'),
      remaining: res.headers.get('x-ratelimit-remaining'),
      reset: res.headers.get('x-ratelimit-reset'),
    },
    body: pretty,
  }
}

export function ApiPlayground() {
  const [apiKey, setApiKey] = useState('')
  const [endpointId, setEndpointId] = useState(ENDPOINTS[0].id)
  const [values, setValues] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const endpoint = ENDPOINTS.find((e) => e.id === endpointId) ?? ENDPOINTS[0]
  const missingRequired = endpoint.params.some((p) => p.required && !values[p.name]?.trim())

  const buildUrl = (): string => {
    let path = endpoint.path
    const qs = new URLSearchParams()
    for (const p of endpoint.params) {
      const v = values[p.name]?.trim()
      if (!v) continue
      if (p.kind === 'path') path = path.replace(/\{[^}]+\}/, encodeURIComponent(v))
      else qs.set(p.name, v)
    }
    return qs.size > 0 ? `${path}?${qs}` : path
  }

  const run = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      setResult(await timedFetch(buildUrl(), apiKey.trim()))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-warm-900">API Playground</h2>
          <p className="text-sm text-warm-500">
            Coba endpoint langsung dari sini. Kunci hanya dipakai untuk request ini — tidak disimpan.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pg-key">Kunci API</Label>
          <Input
            id="pg-key"
            type="password"
            value={apiKey}
            placeholder="hl_live_…"
            autoComplete="off"
            onChange={(e) => setApiKey(e.target.value)}
            className="font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pg-endpoint">Endpoint</Label>
          <Select
            value={endpointId}
            onValueChange={(v) => {
              setEndpointId(v)
              setResult(null)
              setError(null)
            }}
          >
            <SelectTrigger id="pg-endpoint" className="font-mono text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENDPOINTS.map((e) => (
                <SelectItem key={e.id} value={e.id} className="font-mono text-sm">
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {endpoint.params.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {endpoint.params.map((p) => (
              <div key={p.name} className="space-y-1.5">
                <Label htmlFor={`pg-${p.name}`} className="font-mono text-xs">
                  {p.label}
                  {p.required && <span className="text-red-600"> *</span>}
                </Label>
                <Input
                  id={`pg-${p.name}`}
                  value={values[p.name] ?? ''}
                  placeholder={p.placeholder}
                  onChange={(e) => setValues((prev) => ({ ...prev, [p.name]: e.target.value }))}
                  className="font-mono text-sm"
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={run} disabled={running || apiKey.trim().length < 10 || missingRequired}>
            {running ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Play className="mr-2 size-4" />}
            Jalankan
          </Button>
          <code className="truncate font-mono text-xs text-warm-500">{buildUrl()}</code>
        </div>

        {error && <p className="text-sm text-red-600">Request gagal: {error}</p>}

        {result && (
          <div className="space-y-2">
            <p className="text-sm">
              <span
                className={
                  result.status >= 200 && result.status < 300
                    ? 'font-semibold text-emerald-700'
                    : 'font-semibold text-red-600'
                }
              >
                HTTP {result.status}
              </span>{' '}
              <span className="text-warm-500">
                · {result.durationMs} ms
                {result.rateLimit.remaining !== null &&
                  ` · kuota ${result.rateLimit.remaining}/${result.rateLimit.limit}`}
              </span>
            </p>
            <pre className="max-h-96 overflow-auto rounded-lg bg-warm-900 p-3 text-xs leading-relaxed text-warm-50">
              <code>{result.body}</code>
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
