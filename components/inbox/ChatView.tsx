'use client'

// Panel kanan inbox: header + bubble chat + input box.
// Komponen mandiri yang fetch sendiri data per contactId; parent cukup pass id.
import {
  Bot,
  CheckCircle2,
  Download,
  FileArchive,
  FileText,
  Hand,
  Loader2,
  RotateCcw,
  Send,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import {
  formatChatDateLabel,
  formatChatTime,
} from '@/lib/format-time'
import { cn } from '@/lib/utils'

import type { ChatContact, ChatMessage } from './types'

interface ChatViewProps {
  contactId: string
  onChanged: () => void
}

export function ChatView({ contactId, onChanged }: ChatViewProps) {
  const [contact, setContact] = useState<ChatContact | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [isSending, setSending] = useState(false)
  const [isToggling, setToggling] = useState(false)
  const [isDownloading, setDownloading] = useState(false)
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
          data?: { contact: ChatContact; messages: ChatMessage[] }
          error?: string
        }
        if (aborted) return
        if (!res.ok || !json.success || !json.data) {
          toast.error(json.error || 'Gagal memuat percakapan')
          return
        }
        setContact(json.data.contact)
        setMessages(json.data.messages)
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
      }
      if (!res.ok || !json.success || !json.data) {
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
        type === 'single' ? `/api/inbox/${contactId}/export` : `/api/inbox/export-all`
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
        type === 'single' ? 'Percakapan didownload' : 'Semua percakapan didownload',
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
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" />
        Memuat percakapan...
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            {contact.avatar && <AvatarImage src={contact.avatar} alt={contact.name ?? ''} />}
            <AvatarFallback>
              {(contact.name || contact.phoneNumber).slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{contact.name || `+${contact.phoneNumber}`}</p>
            <p className="text-xs text-muted-foreground">
              +{contact.phoneNumber}
              {contact.waSession?.displayName && ` · via ${contact.waSession.displayName}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {contact.isResolved && (
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="size-3" /> Selesai
            </Badge>
          )}
          {contact.aiPaused ? (
            <Badge variant="secondary" className="gap-1">
              <Hand className="size-3" /> Manual
            </Badge>
          ) : (
            <Badge variant="default" className="gap-1">
              <Bot className="size-3" /> AI
            </Badge>
          )}
          <Button
            variant={contact.aiPaused ? 'default' : 'outline'}
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto bg-muted/20">
        <div className="flex flex-col gap-2 p-4">
          {grouped.map((group) => (
            <div key={group.date} className="flex flex-col gap-2">
              <div className="my-2 flex justify-center">
                <span className="rounded-full bg-background px-3 py-1 text-[11px] text-muted-foreground shadow-sm">
                  {formatChatDateLabel(group.messages[0]!.createdAt)}
                </span>
              </div>
              {group.messages.map((m) => (
                <Bubble key={m.id} message={m} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t p-3">
        {!contact.aiPaused && (
          <p className="mb-2 text-xs text-muted-foreground">
            AI sedang aktif untuk kontak ini. Klik <strong>Ambil Alih</strong> untuk balas manual.
          </p>
        )}
        <div className="flex items-end gap-2">
          <Textarea
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
            className="shrink-0"
          >
            {isSending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Bubble({ message }: { message: ChatMessage }) {
  const isOutgoing = message.role !== 'USER'
  return (
    <div className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm',
          isOutgoing
            ? 'bg-primary text-primary-foreground'
            : 'bg-background border',
        )}
      >
        {message.role === 'AI' && (
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase opacity-80">
            <Bot className="size-3" /> AI
          </div>
        )}
        {message.role === 'HUMAN' && (
          <div className="mb-1 flex items-center gap-1 text-[10px] uppercase opacity-80">
            <Hand className="size-3" /> CS
          </div>
        )}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <p
          className={cn(
            'mt-1 text-right text-[10px]',
            isOutgoing ? 'opacity-70' : 'text-muted-foreground',
          )}
        >
          {formatChatTime(message.createdAt)}
        </p>
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
