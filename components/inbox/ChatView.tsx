'use client'

// Panel kanan inbox: header + bubble chat + input box.
// Komponen mandiri yang fetch sendiri data per contactId; parent cukup pass id.
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bot,
  CheckCircle2,
  Download,
  FileArchive,
  FileText,
  Hand,
  LayoutTemplate,
  Loader2,
  RotateCcw,
  Send,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatusBadge as SharedStatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { formatChatDateLabel, formatChatTime } from '@/lib/format-time'
import {
  getSocket,
  subscribeWaSession,
  type InboxMessagePayload,
  type InboxStatusPayload,
} from '@/lib/socket-client'
import { TONES } from '@/lib/ui-tones'
import { cn } from '@/lib/utils'

import { SendTemplateDialog } from './SendTemplateDialog'
import type { ChatContact, ChatMessage } from './types'

interface ChatViewProps {
  contactId: string
  onChanged: () => void
  /** Mobile only — kembali ke list. */
  onBack?: () => void
}

export function ChatView({ contactId, onChanged, onBack }: ChatViewProps) {
  const [contact, setContact] = useState<ChatContact | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [isSending, setSending] = useState(false)
  const [isToggling, setToggling] = useState(false)
  const [isDownloading, setDownloading] = useState(false)
  // Dialog kirim template Meta (sesi Cloud API, window 24 jam tutup).
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateSessionId, setTemplateSessionId] = useState<string | null>(
    null,
  )
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Fetch detail tiap kali contactId berubah.
  useEffect(() => {
    let aborted = false
    setLoading(true)
    setMessages([])
    setDraft('')
    ;(async () => {
      try {
        const res = await fetch(`/api/inbox/${contactId}/messages`)
        const json = (await res.json()) as {
          success: boolean
          data?: {
            contact: ChatContact
            messages: ChatMessage[]
            isAdmin?: boolean
          }
          error?: string
        }
        if (aborted) return
        if (!res.ok || !json.success || !json.data) {
          toast.error(json.error || 'Gagal memuat percakapan')
          return
        }
        setContact(json.data.contact)
        setMessages(json.data.messages)
        setIsAdmin(Boolean(json.data.isAdmin))
      } finally {
        if (!aborted) setLoading(false)
      }
    })()
    return () => {
      aborted = true
    }
  }, [contactId])

  // Auto-scroll ke bawah saat ada pesan baru.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages.length, isLoading])

  // Realtime: subscribe ke room WA session kontak ini, lalu append pesan baru
  // ('inbox:message') & update status kirim ('inbox:status').
  const waSessionId = contact?.waSession?.id ?? null
  useEffect(() => {
    if (!waSessionId) return
    const socket = getSocket()
    let cancelled = false
    void subscribeWaSession(socket, waSessionId, {
      isCancelled: () => cancelled,
    })

    // Append pesan baru milik kontak ini. Dedup by message.id supaya pesan
    // yang sudah ada (mis. balasan manual yang tadi kita append sendiri) tidak
    // dobel. Kalau id null (gagal simpan), tetap append tanpa dedup.
    const onMessage = (payload: InboxMessagePayload) => {
      if (payload.contactId !== contactId) return
      const m = payload.message
      setMessages((prev) => {
        if (m.id && prev.some((p) => p.id === m.id)) return prev
        const appended: ChatMessage = {
          id: m.id ?? `rt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          content: m.content,
          role: m.role,
          status: m.status,
          source: (m.source as ChatMessage['source']) ?? null,
          createdAt: m.createdAt,
        }
        return [...prev, appended]
      })
    }

    // Update status kirim (mis. jadi FAILED) — best-effort: payload pakai
    // externalMsgId, jadi hanya bisa match kalau ChatMessage punya field itu.
    // Kalau tidak ada yang cocok, lewati (status awal sudah dibawa onMessage).
    const onStatus = (payload: InboxStatusPayload) => {
      if (payload.sessionId !== waSessionId) return
      setMessages((prev) => {
        let changed = false
        const next = prev.map((p) => {
          if (p.externalMsgId && p.externalMsgId === payload.externalMsgId) {
            changed = true
            return { ...p, status: payload.status }
          }
          return p
        })
        return changed ? next : prev
      })
    }

    socket.on('inbox:message', onMessage)
    socket.on('inbox:status', onStatus)
    return () => {
      cancelled = true
      socket.off('inbox:message', onMessage)
      socket.off('inbox:status', onStatus)
      // SENGAJA tidak emit 'unsubscribe': socket singleton dibagi dengan
      // InboxView yang juga memegang room sesi ini. Kalau ChatView keluar dari
      // room, InboxView ikut berhenti terima 'inbox:message'. Cukup lepas
      // listener milik ChatView; room dilepas InboxView saat halaman unmount.
    }
  }, [contactId, waSessionId])

  // Group pesan by tanggal supaya bisa kasih separator "Hari Ini" / tanggal.
  const grouped = useMemo(() => groupByDate(messages), [messages])

  async function send() {
    const content = draft.trim()
    if (!content || isSending) return
    setSending(true)
    try {
      const res = await fetch(`/api/inbox/${contactId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      const json = (await res.json()) as {
        success: boolean
        data?: ChatMessage
        error?: string
        code?: string
        sessionId?: string
      }
      if (!res.ok || !json.success || !json.data) {
        // Sesi Cloud API di luar window 24 jam → tawarkan kirim template.
        if (res.status === 409 && json.code === 'WINDOW_CLOSED') {
          setTemplateSessionId(json.sessionId ?? null)
          setTemplateOpen(true)
          toast.info(
            'Window 24 jam Meta sudah tutup — kirim lewat template yang disetujui.',
          )
          return
        }
        toast.error(json.error || 'Gagal kirim pesan')
        return
      }
      setMessages((prev) => [...prev, json.data!])
      setDraft('')
      onChanged()
    } finally {
      setSending(false)
    }
  }

  async function toggleTakeover() {
    if (!contact) return
    setToggling(true)
    try {
      const next = !contact.aiPaused
      const res = await fetch(`/api/inbox/${contact.id}/takeover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: next }),
      })
      const json = (await res.json()) as { success: boolean; error?: string }
      if (!res.ok || !json.success) {
        toast.error(json.error || 'Gagal mengubah status')
        return
      }
      setContact({ ...contact, aiPaused: next })
      toast.success(next ? 'AI dijeda — kamu yang balas' : 'AI aktif kembali')
      onChanged()
    } finally {
      setToggling(false)
    }
  }

  async function downloadChat(type: 'single' | 'all') {
    if (isDownloading) return
    setDownloading(true)
    try {
      const url =
        type === 'single'
          ? `/api/inbox/${contactId}/export`
          : `/api/inbox/export-all`
      const res = await fetch(url)
      if (!res.ok) {
        // Server pakai JSON envelope { success, error } untuk error path —
        // fallback ke text() kalau bukan JSON (tidak fatal).
        const body = await res
          .clone()
          .json()
          .catch(() => null)
        const msg =
          (body as { error?: string } | null)?.error ||
          (res.status === 429
            ? 'Tunggu sebentar sebelum coba lagi'
            : 'Gagal download percakapan')
        toast.error(msg)
        return
      }
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') ?? ''
      // Prefer filename* (RFC 5987, UTF-8) jika ada, kalau tidak fallback ke
      // filename= biasa. Strip kutip + decode percent-encoding.
      let filename = type === 'single' ? 'percakapan.md' : 'hulao-export.zip'
      const star = cd.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]
      if (star) {
        try {
          filename = decodeURIComponent(star.trim())
        } catch {
          /* biar default */
        }
      } else {
        const plain = cd.match(/filename\s*=\s*"?([^";]+)"?/i)?.[1]
        if (plain) filename = plain.trim()
      }
      const a = document.createElement('a')
      const objectUrl = URL.createObjectURL(blob)
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
      toast.success(
        type === 'single'
          ? 'Percakapan didownload'
          : 'Semua percakapan didownload',
      )
    } catch (err) {
      console.error('[downloadChat] gagal:', err)
      toast.error('Gagal download percakapan')
    } finally {
      setDownloading(false)
    }
  }

  async function toggleResolved() {
    if (!contact) return
    const next = !contact.isResolved
    const res = await fetch(`/api/inbox/${contact.id}/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resolved: next }),
    })
    const json = (await res.json()) as { success: boolean; error?: string }
    if (!res.ok || !json.success) {
      toast.error(json.error || 'Gagal mengubah status')
      return
    }
    setContact({ ...contact, isResolved: next })
    toast.success(next ? 'Ditandai selesai' : 'Dibuka kembali')
    onChanged()
  }

  if (isLoading || !contact) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center">
        <Loader2 className="mr-2 size-5 animate-spin" />
        Memuat percakapan…
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* Tombol back hanya tampil di mobile (md:hidden). */}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="hover:bg-warm-100 flex size-9 shrink-0 items-center justify-center rounded-md md:hidden"
              aria-label="Kembali"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
          <Avatar className="size-10 shrink-0">
            {contact.avatar && (
              <AvatarImage src={contact.avatar} alt={contact.name ?? ''} />
            )}
            <AvatarFallback>
              {(contact.name || contact.phoneNumber).slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">
              {contact.name || `+${contact.phoneNumber}`}
            </p>
            <p className="text-muted-foreground truncate text-xs">
              +{contact.phoneNumber}
              {contact.waSession?.displayName &&
                ` · via ${contact.waSession.displayName}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {contact.isResolved && (
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="size-3" /> Selesai
            </Badge>
          )}
          {/* Dua-duanya status, jadi dua-duanya ber-highlight lewat TONES —
              dulu Manual pakai `secondary` (abu polos) sehingga hanya AI yang
              terlihat "aktif". brand=orange utk AI, info=sky utk Manual:
              beda hue yang jelas tanpa memakai orange dua kali. */}
          {contact.aiPaused ? (
            <SharedStatusBadge tone="info" label="Manual" icon={Hand} />
          ) : (
            <SharedStatusBadge tone="brand" label="AI" icon={Bot} />
          )}
          {/* Tombol ini AKSI, bukan penanda state — state ada di badge kiri.
              Dulu variant-nya ikut berubah (`default` saat Manual), sehingga
              aksen orange LOMPAT dari badge ke tombol: di mode Manual mata
              jatuh ke "Lepaskan ke AI" dan membacanya sebagai state terpilih.
              Toolbar = outline (design system), jadi orange konsisten hanya
              berarti satu hal: AI sedang aktif. */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTakeover}
            disabled={isToggling}
          >
            {isToggling ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : contact.aiPaused ? (
              <Bot className="mr-2 size-4" />
            ) : (
              <Hand className="mr-2 size-4" />
            )}
            {contact.aiPaused ? 'Lepaskan ke AI' : 'Ambil Alih'}
          </Button>
          <Button variant="ghost" size="sm" onClick={toggleResolved}>
            {contact.isResolved ? (
              <RotateCcw className="mr-2 size-4" />
            ) : (
              <CheckCircle2 className="mr-2 size-4" />
            )}
            {contact.isResolved ? 'Buka kembali' : 'Tandai selesai'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" disabled={isDownloading}>
                {isDownloading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Download className="mr-2 size-4" />
                )}
                Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => void downloadChat('single')}
                disabled={isDownloading}
              >
                <FileText className="mr-2 size-4" />
                Percakapan ini (.md)
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void downloadChat('all')}
                disabled={isDownloading}
              >
                <FileArchive className="mr-2 size-4" />
                Semua percakapan (.zip)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      {/* overscroll-contain + min-h-0: scroll mentok tidak merambat ke <main>
          (scroll chaining) sehingga header & halaman tidak ikut bergerak. */}
      <div
        ref={scrollRef}
        className="bg-muted/20 min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="flex flex-col gap-2 p-4">
          {grouped.map((group) => (
            <div key={group.date} className="flex flex-col gap-2">
              <div className="my-2 flex justify-center">
                <span className="bg-background text-muted-foreground rounded-full px-3 py-1 text-xs shadow-sm">
                  {formatChatDateLabel(group.messages[0]!.createdAt)}
                </span>
              </div>
              {group.messages.map((m) => (
                <Bubble key={m.id} message={m} isAdmin={isAdmin} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t p-3">
        {!contact.aiPaused && (
          <p className="text-muted-foreground mb-2 text-xs">
            AI sedang aktif untuk kontak ini. Klik <strong>Ambil Alih</strong>{' '}
            untuk balas manual.
          </p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            aria-label="Ketik pesan"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              contact.aiPaused
                ? 'Tulis balasan manual...'
                : 'Aktifkan "Ambil Alih" dulu untuk balas manual'
            }
            disabled={!contact.aiPaused}
            rows={2}
            className="min-h-[44px] resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />
          <Button
            onClick={send}
            disabled={!contact.aiPaused || !draft.trim() || isSending}
            size="icon"
            aria-label="Kirim pesan"
            className="shrink-0"
          >
            {isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Kirim template Meta"
            title="Kirim template Meta (nomor Cloud API, di luar window 24 jam)"
            className="shrink-0"
            disabled={!contact.aiPaused || isSending}
            onClick={() => {
              setTemplateSessionId(null)
              setTemplateOpen(true)
            }}
          >
            <LayoutTemplate className="size-4" />
          </Button>
        </div>
      </div>

      <SendTemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        contactId={contact.id}
        contactName={contact.name}
        contactPhone={contact.phoneNumber}
        sessionId={templateSessionId}
        onSent={(m) => {
          setMessages((prev) => [...prev, m])
          setDraft('')
          onChanged()
        }}
      />
    </div>
  )
}

// Label asal untuk pesan AGENT — bantu CS tahu balasan datang dari mana.
const AGENT_SOURCE_LABEL: Record<string, string> = {
  WA_DIRECT: 'CS via WA',
  WA_HISTORY: 'CS via WA (riwayat)',
  WEB_DASHBOARD: 'CS via Web',
  TEMPLATE: 'CS via Template',
  BROADCAST: 'Broadcast',
  FOLLOWUP: 'Follow-up',
  SYSTEM: 'Sistem',
}

function Bubble({
  message,
  isAdmin,
}: {
  message: ChatMessage
  isAdmin: boolean
}) {
  const isOutgoing = message.role !== 'USER'
  const isAgent = message.role === 'AGENT' || message.role === 'HUMAN'
  // Hanya tampilkan cost detail kalau: admin, role AI, dan ada datanya.
  const showCost =
    isAdmin &&
    message.role === 'AI' &&
    message.apiCostRp !== null &&
    message.apiCostRp !== undefined
  // Bubble AGENT pakai warna hijau muda supaya gampang dibedakan dari AI
  // (primary). Outgoing tapi non-AGENT/AI tetap pakai warna primary.
  const bubbleClass = !isOutgoing
    ? 'bg-background border'
    : isAgent
      ? 'bg-green-100 text-green-950 border border-green-200'
      : 'bg-primary text-primary-foreground'
  // Label asal untuk pesan AGENT — bantu CS tahu balasan datang dari mana.
  const agentLabel = AGENT_SOURCE_LABEL[message.source ?? ''] ?? 'CS'
  return (
    <div className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm',
          bubbleClass,
        )}
      >
        {message.role === 'AI' && (
          <div className="mb-1 flex items-center gap-1 text-xs uppercase opacity-80">
            <Bot className="size-3" /> AI
          </div>
        )}
        {isAgent && (
          <div className="mb-1 flex items-center gap-1 text-xs uppercase opacity-80">
            <Hand className="size-3" /> {agentLabel}
          </div>
        )}
        <p className="break-words whitespace-pre-wrap">{message.content}</p>
        {isOutgoing && message.status === 'FAILED' && (
          <div
            className={cn(
              'mt-1 flex items-center gap-1 text-xs font-medium',
              TONES.danger.text,
            )}
          >
            <AlertTriangle className="size-3" /> Gagal terkirim ke WhatsApp
          </div>
        )}
        <p
          className={cn(
            'mt-1 text-right text-xs',
            isOutgoing ? 'opacity-70' : 'text-muted-foreground',
          )}
        >
          {formatChatTime(message.createdAt)}
        </p>
        {showCost && (
          <details
            className={cn(
              'mt-1 cursor-pointer text-xs',
              isOutgoing ? 'opacity-80' : 'text-muted-foreground',
            )}
          >
            <summary className="flex items-center gap-1 select-none">
              <BarChart3 className="size-3" aria-hidden /> Cost detail
            </summary>
            <div className="mt-1 space-y-0.5 font-mono">
              {message.modelName && <div>Model: {message.modelName}</div>}
              <div>
                Token: {message.apiInputTokens ?? '—'} in /{' '}
                {message.apiOutputTokens ?? '—'} out
              </div>
              <div>
                Cost: Rp{' '}
                {(message.apiCostRp ?? 0).toLocaleString('id-ID', {
                  maximumFractionDigits: 2,
                })}{' '}
                · Charged: Rp{' '}
                {(message.revenueRp ?? 0).toLocaleString('id-ID', {
                  maximumFractionDigits: 0,
                })}
              </div>
              <div
                className={cn((message.profitRp ?? 0) < 0 && 'font-semibold')}
              >
                Profit: Rp{' '}
                {(message.profitRp ?? 0).toLocaleString('id-ID', {
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

function groupByDate(
  messages: ChatMessage[],
): { date: string; messages: ChatMessage[] }[] {
  const out: { date: string; messages: ChatMessage[] }[] = []
  for (const m of messages) {
    const d = new Date(m.createdAt)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    const last = out[out.length - 1]
    if (last && last.date === key) last.messages.push(m)
    else out.push({ date: key, messages: [m] })
  }
  return out
}
