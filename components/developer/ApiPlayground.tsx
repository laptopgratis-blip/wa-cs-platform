'use client'

// API Playground ala kirimchat (palet hulao): pilih endpoint dari dropdown
// ber-badge method, isi parameter / request body, kirim — respons + kuota
// tampil langsung. Menampilkan Base URL, URL penuh, deskripsi endpoint, dan
// contoh cURL supaya jelas dipakai dari luar (n8n/Zapier/skrip). Kunci hanya
// hidup di state (tidak pernah disimpan).
import { Check, Copy, Loader2, RefreshCw, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

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
import { writeSenderIntoBody } from '@/lib/services/public-api/sender-selection'
import { cn } from '@/lib/utils'

interface ApiPlaygroundProps {
  /** Base URL publik (mis. https://hulao.id) — dari publicBaseUrl(). */
  baseUrl: string
}

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
  desc: string
  params: ParamDef[]
  /** Contoh request body (POST). Ditampilkan & bisa diedit di editor. */
  bodyExample?: string
  /** Endpoint kirim: tampilkan pemilih nomor pengirim (session_id). */
  supportsSender?: boolean
}

// Nilai <Select> untuk "biar platform yang pilih" — Radix Select melarang
// SelectItem bernilai string kosong, jadi pakai sentinel.
const AUTO_SENDER = '__auto__'

const ENDPOINTS: EndpointDef[] = [
  {
    id: 'ping',
    method: 'GET',
    label: 'Uji kunci',
    path: '/api/v1/ping',
    desc: 'Cek apakah kunci valid. Balikannya menyebut nama kunci yang dipakai.',
    params: [],
  },
  {
    id: 'contacts',
    method: 'GET',
    label: 'Daftar kontak',
    path: '/api/v1/contacts',
    desc: 'Daftar kontak dengan paginasi cursor. Filter opsional: search, stage, tag.',
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
    method: 'GET',
    label: 'Detail kontak',
    path: '/api/v1/contacts/{id}',
    desc: 'Detail satu kontak beserta jumlah pesannya.',
    params: [{ name: 'id', label: 'id kontak', kind: 'path', required: true }],
  },
  {
    id: 'messages',
    method: 'GET',
    label: 'Riwayat pesan',
    path: '/api/v1/messages',
    desc: 'Riwayat pesan satu kontak, terbaru dulu. contactId wajib diisi.',
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
    desc: 'Status kirim (SENT/DELIVERED/READ/FAILED) satu pesan by externalMsgId (wamid).',
    params: [
      { name: 'externalMsgId', label: 'externalMsgId (wamid)', kind: 'path', required: true },
    ],
  },
  {
    id: 'balance',
    method: 'GET',
    label: 'Saldo',
    path: '/api/v1/balance',
    desc: 'Saldo token AI, saldo Kredit Pesan WA, dan tarif per kategori.',
    params: [],
  },
  {
    id: 'senders',
    method: 'GET',
    label: 'Nomor terhubung',
    path: '/api/v1/senders',
    desc: 'Nomor WhatsApp yang terhubung ke akunmu, urut prioritas pemakaian.',
    params: [],
  },
  {
    id: 'send-text',
    method: 'POST',
    label: 'Kirim WhatsApp Teks',
    path: '/api/v1/messages',
    desc: 'Kirim pesan teks (Baileys, atau Cloud API selama window 24 jam terbuka). Maks 30 kirim/menit.',
    params: [],
    supportsSender: true,
    bodyExample: JSON.stringify(
      {
        phone_number: '628123456789',
        content: 'Halo dari API Playground!',
        session_id: null,
      },
      null,
      2,
    ),
  },
  {
    id: 'send-template',
    method: 'POST',
    label: 'Kirim WhatsApp Template',
    path: '/api/v1/messages/template',
    desc: 'Kirim template Meta yang sudah disetujui — untuk mengirim di luar window 24 jam.',
    params: [],
    supportsSender: true,
    bodyExample: JSON.stringify(
      {
        phone_number: '628123456789',
        template_name: 'nama_template',
        params: ['Budi', 'INV-001'],
        session_id: null,
      },
      null,
      2,
    ),
  },
]

interface SenderItem {
  sessionId: string
  provider: string
  phoneNumber: string | null
  label: string | null
}

function senderLabel(s: SenderItem): string {
  const name = s.label?.trim()
  const phone = s.phoneNumber ?? 'nomor belum diketahui'
  return name ? `${phone} — ${name}` : phone
}

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

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback di bawah
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

function MethodBadge({ method }: { method: Method }) {
  // Orange = satu-satunya peristiwa kromatik (design system): POST (aksi tulis)
  // memakainya, GET (baca) netral. Bukan tone status, jadi tidak lewat ui-tones.
  return (
    <span
      className={cn(
        'inline-flex w-12 shrink-0 justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-bold',
        method === 'GET' ? 'bg-warm-100 text-warm-600' : 'bg-primary-100 text-primary-700',
      )}
    >
      {method}
    </span>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        const ok = await copyText(text)
        if (ok) {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } else {
          toast.error('Gagal menyalin — salin manual')
        }
      }}
      className="text-warm-400 hover:text-warm-700 shrink-0"
    >
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
    </button>
  )
}

export function ApiPlayground({ baseUrl }: ApiPlaygroundProps) {
  const [apiKey, setApiKey] = useState('')
  const [endpointId, setEndpointId] = useState(ENDPOINTS[0].id)
  const [values, setValues] = useState<Record<string, string>>({})
  const [bodyText, setBodyText] = useState(ENDPOINTS[0].bodyExample ?? '')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<RunResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [senders, setSenders] = useState<SenderItem[] | null>(null)
  const [loadingSenders, setLoadingSenders] = useState(false)
  const [senderId, setSenderId] = useState<string>(AUTO_SENDER)
  const [strictSender, setStrictSender] = useState(false)

  const endpoint = ENDPOINTS.find((e) => e.id === endpointId) ?? ENDPOINTS[0]
  const isPost = endpoint.method === 'POST'
  const missingRequired = endpoint.params.some((p) => p.required && !values[p.name]?.trim())
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
    setSenderId(AUTO_SENDER)
    setStrictSender(false)
  }

  // Ambil nomor terhubung memakai kunci yang sedang diketik — sengaja manual
  // (tombol), bukan otomatis: kunci baru lengkap setelah user selesai paste,
  // dan tiap panggilan memotong kuota rate limit.
  const loadSenders = async () => {
    setLoadingSenders(true)
    try {
      const res = await fetch('/api/v1/senders', {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      })
      const json = (await res.json().catch(() => null)) as {
        success?: boolean
        data?: { items?: SenderItem[] }
        error?: string
      } | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error || 'Gagal memuat nomor terhubung')
        setSenders([])
        return
      }
      const items = json.data?.items ?? []
      setSenders(items)
      if (items.length === 0) toast.info('Belum ada nomor WhatsApp terhubung')
    } catch {
      toast.error('Tidak bisa terhubung ke server')
      setSenders([])
    } finally {
      setLoadingSenders(false)
    }
  }

  const applySender = (nextId: string, nextStrict: boolean) => {
    setSenderId(nextId)
    setStrictSender(nextStrict)
    setBodyText((prev) =>
      writeSenderIntoBody(prev, nextId === AUTO_SENDER ? null : nextId, nextStrict),
    )
  }

  const buildPath = (): string => {
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

  const fullUrl = `${baseUrl}${buildPath()}`
  const keyForCurl = apiKey.trim() || 'hl_live_xxxxxxxxxxxx'
  const curl = [
    `curl -X ${endpoint.method} "${fullUrl}"`,
    `  -H "Authorization: Bearer ${keyForCurl}"`,
    ...(isPost
      ? [`  -H "Content-Type: application/json"`, `  -d '${(bodyText || '{}').replace(/\n\s*/g, ' ')}'`]
      : []),
  ].join(' \\\n')

  const run = async () => {
    setRunning(true)
    setError(null)
    setResult(null)
    try {
      // fetch pakai path relatif (same-origin, tanpa CORS); tampilan pakai URL penuh.
      setResult(await timedFetch(endpoint.method, buildPath(), apiKey.trim(), isPost ? bodyText : null))
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
          <h2 className="font-display text-warm-900 text-lg font-semibold">API Playground</h2>
          <p className="text-warm-500 text-sm">
            Coba endpoint langsung dari sini. Kunci hanya dipakai untuk request ini — tidak disimpan.
          </p>
        </div>

        {/* Info Base URL + autentikasi — supaya jelas dipakai dari luar. */}
        <div className="border-warm-200 bg-warm-50 space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-warm-500 text-xs font-medium uppercase tracking-wide">Base URL</span>
            <CopyButton text={`${baseUrl}/api/v1`} label="Salin base URL" />
          </div>
          <code className="text-warm-800 block break-all font-mono text-sm">{baseUrl}/api/v1</code>
          <p className="text-warm-500 text-xs">
            Autentikasi: kirim header{' '}
            <code className="bg-warm-100 text-warm-700 rounded px-1 py-0.5 font-mono">
              Authorization: Bearer &lt;kunci&gt;
            </code>{' '}
            di setiap request. Semua respons berbentuk{' '}
            <code className="font-mono">{'{ success, data | error, code }'}</code>.
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
          <p className="text-warm-500 text-xs">
            Belum punya? Buat di tab <span className="font-medium">Kunci API</span>.
          </p>
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
          <p className="text-warm-500 pt-0.5 text-xs">{endpoint.desc}</p>
          {/* URL penuh (bukan cuma path relatif). */}
          <div className="bg-warm-100 flex items-center gap-2 rounded px-2 py-1.5">
            <MethodBadge method={endpoint.method} />
            <code className="text-warm-700 min-w-0 flex-1 break-all font-mono text-xs">{fullUrl}</code>
            <CopyButton text={fullUrl} label="Salin URL" />
          </div>
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

        {endpoint.supportsSender && (
          <div className="border-warm-200 space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="pg-sender">Kirim dari</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadSenders()}
                disabled={loadingSenders || apiKey.trim().length < 10}
              >
                {loadingSenders ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 size-4" />
                )}
                Muat nomor
              </Button>
            </div>

            <Select
              value={senderId}
              onValueChange={(v) => applySender(v, strictSender)}
              disabled={!senders || senders.length === 0}
            >
              <SelectTrigger id="pg-sender">
                <SelectValue placeholder="Otomatis — platform yang pilih" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AUTO_SENDER}>Otomatis — platform yang pilih</SelectItem>
                {(senders ?? []).map((snd) => (
                  <SelectItem key={snd.sessionId} value={snd.sessionId}>
                    {senderLabel(snd)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="text-warm-600 flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                className="accent-primary-500 mt-0.5 size-3.5"
                checked={strictSender}
                disabled={senderId === AUTO_SENDER}
                onChange={(e) => applySender(senderId, e.target.checked)}
              />
              <span>
                Kunci ke nomor ini (<code className="font-mono">strict_session</code>) — kalau nomor
                itu gagal, request ikut gagal. Tanpa ini, platform boleh memakai nomor lain sebagai
                cadangan.
              </span>
            </label>

            <p className="text-warm-500 text-xs">
              {senders === null
                ? 'Klik "Muat nomor" untuk mengambil daftar nomor terhubung dari akunmu.'
                : senders.length === 0
                  ? 'Belum ada nomor terhubung — hubungkan dulu di menu WhatsApp.'
                  : 'Pilihanmu langsung ditulis ke Request Body di bawah.'}
            </p>
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
            {bodyInvalid && <p className="text-xs text-red-600">JSON tidak valid.</p>}
          </div>
        )}

        <Button
          onClick={run}
          disabled={running || apiKey.trim().length < 10 || missingRequired || bodyInvalid}
          className="w-full"
        >
          {running ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Send className="mr-2 size-4" />
          )}
          Kirim Request
        </Button>

        {/* Contoh cURL — copy-paste ke terminal / n8n / tool lain. */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Setara cURL</Label>
            <CopyButton text={curl} label="Salin cURL" />
          </div>
          <pre className="bg-warm-900 text-warm-50 overflow-x-auto rounded-lg p-3 text-xs leading-relaxed">
            <code>{curl}</code>
          </pre>
        </div>

        {error && <p className="text-sm text-red-600">Request gagal: {error}</p>}

        {result && (
          <div className="space-y-2">
            <p className="text-sm">
              <span className={okStatus ? 'font-semibold text-emerald-700' : 'font-semibold text-red-600'}>
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
