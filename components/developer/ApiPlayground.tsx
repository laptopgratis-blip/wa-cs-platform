'use client'

// API Playground ala kirimchat (palet hulao): pilih endpoint dari dropdown
// ber-badge method, isi parameter / request body, kirim — respons + kuota
// tampil langsung. Kunci hanya hidup di state (tidak pernah disimpan).
import { Loader2, Send } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

type Method = 'GET' | 'POST'

interface ParamDef {
  name: string
  label: string
  required?: boolean
  placeholder?: string
  kind: 'query' | 'path'
}

interface EndpointDef {
  id: string
  method: Method
  label: string
  path: string
  params: ParamDef[]
  /** Contoh request body (POST). Ditampilkan & bisa diedit di editor. */
  bodyExample?: string
}

const ENDPOINTS: EndpointDef[] = [
  {
    id: 'ping',
    method: 'GET',
    label: 'Uji kunci',
    path: '/api/v1/ping',
    params: [],
  },
  {
    id: 'contacts',
    method: 'GET',
    label: 'Daftar kontak',
    path: '/api/v1/contacts',
    params: [
      {
        name: 'search',
        label: 'search',
        kind: 'query',
        placeholder: 'nama / nomor',
      },
      {
        name: 'stage',
        label: 'stage',
        kind: 'query',
        placeholder: 'NEW / PROSPECT / …',
      },
      { name: 'tag', label: 'tag', kind: 'query' },
      { name: 'limit', label: 'limit', kind: 'query', placeholder: '25' },
      { name: 'cursor', label: 'cursor', kind: 'query' },
    ],
  },
  {
    id: 'contact-detail',
    method: 'GET',
    label: 'Detail kontak',
    path: '/api/v1/contacts/{id}',
    params: [{ name: 'id', label: 'id kontak', kind: 'path', required: true }],
  },
  {
    id: 'messages',
    method: 'GET',
    label: 'Riwayat pesan',
    path: '/api/v1/messages',
    params: [
      { name: 'contactId', label: 'contactId', kind: 'query', required: true },
      { name: 'limit', label: 'limit', kind: 'query', placeholder: '25' },
      { name: 'cursor', label: 'cursor', kind: 'query' },
    ],
  },
  {
    id: 'message-status',
    method: 'GET',
    label: 'Status kirim pesan',
    path: '/api/v1/messages/{externalMsgId}/status',
    params: [
      {
        name: 'externalMsgId',
        label: 'externalMsgId (wamid)',
        kind: 'path',
        required: true,
      },
    ],
  },
  {
    id: 'balance',
    method: 'GET',
    label: 'Saldo',
    path: '/api/v1/balance',
    params: [],
  },
  {
    id: 'senders',
    method: 'GET',
    label: 'Nomor terhubung',
    path: '/api/v1/senders',
    params: [],
  },
  {
    id: 'send-text',
    method: 'POST',
    label: 'Kirim WhatsApp Teks',
    path: '/api/v1/messages',
    params: [],
    bodyExample: JSON.stringify(
      { phone_number: '628123456789', content: 'Halo dari API Playground!' },
      null,
      2,
    ),
  },
  {
    id: 'send-template',
    method: 'POST',
    label: 'Kirim WhatsApp Template',
    path: '/api/v1/messages/template',
    params: [],
    bodyExample: JSON.stringify(
      {
        phone_number: '628123456789',
        template_name: 'nama_template',
        params: ['Budi', 'INV-001'],
      },
      null,
      2,
    ),
  },
]

interface RunResult {
  status: number
  durationMs: number
  rateLimit: { remaining: string | null; limit: string | null }
  body: string
}

// Di luar komponen: pemanggilan impure (timer) dilarang di scope render.
async function timedFetch(
  method: Method,
  url: string,
  apiKey: string,
  body: string | null,
): Promise<RunResult> {
  const started = performance.now()
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(method === 'POST' && body ? { body } : {}),
  })
  const text = await res.text()
  let pretty = text
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    // biarkan mentah
  }
  return {
    status: res.status,
    durationMs: Math.round(performance.now() - started),
    rateLimit: {
      remaining: res.headers.get('x-ratelimit-remaining'),
      limit: res.headers.get('x-ratelimit-limit'),
    },
    body: pretty,
  }
}

function MethodBadge({ method }: { method: Method }) {
  // Orange = satu-satunya peristiwa kromatik (design system): POST (aksi tulis)
  // memakainya, GET (baca) netral. Bukan tone status, jadi tidak lewat ui-tones.
  return (
    <span
      className={cn(
        'inline-flex w-12 shrink-0 justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-bold',
        method === 'GET'
          ? 'bg-warm-100 text-warm-600'
          : 'bg-primary-100 text-primary-700',
      )}
    >
      {method}
    </span>
  )
}

export function ApiPlayground() {
  const [apiKey, setApiKey] = useState('')
  const [endpointId, setEndpointId] = useState(ENDPOINTS[0].id)
  const [values, setValues] = useState<Record<string, string>>({})
  const [bodyText, setBodyText] = useState(ENDPOINTS[0].bodyExample ?? '')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const endpoint = ENDPOINTS.find((e) => e.id === endpointId) ?? ENDPOINTS[0]
  const isPost = endpoint.method === 'POST'
  const missingRequired = endpoint.params.some(
    (p) => p.required && !values[p.name]?.trim(),
  )
  let bodyInvalid = false
  if (isPost) {
    try {
      JSON.parse(bodyText || '{}')
    } catch {
      bodyInvalid = true
    }
  }

  const selectEndpoint = (id: string) => {
    const ep = ENDPOINTS.find((e) => e.id === id)
    setEndpointId(id)
    setValues({})
    setBodyText(ep?.bodyExample ?? '')
    setResult(null)
    setError(null)
  }

  const buildUrl = (): string => {
    let path = endpoint.path
    const qs = new URLSearchParams()
    for (const p of endpoint.params) {
      const v = values[p.name]?.trim()
      if (!v) continue
      if (p.kind === 'path')
        path = path.replace(/\{[^}]+\}/, encodeURIComponent(v))
      else qs.set(p.name, v)
    }
    return qs.size > 0 ? `${path}?${qs}` : path
  }

  const run = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      setResult(
        await timedFetch(
          endpoint.method,
          buildUrl(),
          apiKey.trim(),
          isPost ? bodyText : null,
        ),
      )
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const okStatus = result && result.status >= 200 && result.status < 300

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="font-display text-warm-900 text-lg font-semibold">
            API Playground
          </h2>
          <p className="text-warm-500 text-sm">
            Coba endpoint langsung dari sini. Kunci hanya dipakai untuk request
            ini — tidak disimpan.
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
          <Select value={endpointId} onValueChange={selectEndpoint}>
            <SelectTrigger id="pg-endpoint" className="h-auto py-2">
              <SelectValue asChild>
                <span className="flex items-center gap-2">
                  <MethodBadge method={endpoint.method} />
                  <span className="text-sm">{endpoint.label}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {ENDPOINTS.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  <span className="flex items-center gap-2">
                    <MethodBadge method={e.method} />
                    <span className="text-sm">{e.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="pt-1">
            <code className="bg-warm-100 text-warm-700 rounded px-2 py-1 font-mono text-xs">
              {endpoint.method} {endpoint.path}
            </code>
          </p>
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
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [p.name]: e.target.value }))
                  }
                  className="font-mono text-sm"
                />
              </div>
            ))}
          </div>
        )}

        {isPost && (
          <div className="space-y-1.5">
            <Label htmlFor="pg-body">Request Body</Label>
            <Textarea
              id="pg-body"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              spellCheck={false}
              rows={7}
              className="font-mono text-sm"
            />
            {bodyInvalid && (
              <p className="text-xs text-red-600">JSON tidak valid.</p>
            )}
          </div>
        )}

        <Button
          onClick={run}
          disabled={
            running ||
            apiKey.trim().length < 10 ||
            missingRequired ||
            bodyInvalid
          }
          className="w-full"
        >
          {running ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Send className="mr-2 size-4" />
          )}
          Kirim Request
        </Button>

        {error && (
          <p className="text-sm text-red-600">Request gagal: {error}</p>
        )}

        {result && (
          <div className="space-y-2">
            <p className="text-sm">
              <span
                className={
                  okStatus
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
            <pre className="bg-warm-900 text-warm-50 max-h-96 overflow-auto rounded-lg p-3 text-xs leading-relaxed">
              <code>{result.body}</code>
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
