'use client'

// Daftar percakapan di kolom kiri inbox. Filter tabs + search + item list.
import {
  Bot,
  CheckCircle2,
  Hand,
  MessageCircle,
  Search,
  UserRound,
} from 'lucide-react'
import { useEffect, useRef } from 'react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatRelativeTime } from '@/lib/format-time'
import { cn } from '@/lib/utils'

import { SenderLabel, senderName } from './SenderLabel'
import type { SenderOption, InboxConversation, InboxCounts, InboxFilter } from './types'

interface ConversationListProps {
  conversations: InboxConversation[]
  counts: InboxCounts
  filter: InboxFilter
  search: string
  selectedId: string | null
  isLoading: boolean
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  onFilterChange: (next: InboxFilter) => void
  onSearchChange: (next: string) => void
  /** Nomor WA milik user. Filter hanya muncul kalau lebih dari satu. */
  senders: SenderOption[]
  /** '' = semua nomor. */
  senderFilter: string
  onSenderFilterChange: (next: string) => void
  onSelect: (id: string) => void
}

// Radix Select melarang SelectItem bernilai string kosong.
const ALL_SENDERS = '__all__'

const TAB_ITEMS: { value: InboxFilter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'ai', label: 'AI' },
  { value: 'attention', label: 'Perlu Perhatian' },
  { value: 'resolved', label: 'Resolved' },
]

export function ConversationList({
  conversations,
  counts,
  filter,
  search,
  selectedId,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onFilterChange,
  onSearchChange,
  senders,
  senderFilter,
  onSenderFilterChange,
  onSelect,
}: ConversationListProps) {
  // Auto-load: begitu sentinel di dasar list mendekati layar, muat halaman
  // berikutnya tanpa user harus klik "Muat lebih banyak". Ini yang mencegah
  // persepsi "chat tidak muncul semua" — badge tab tampil total, jadi kalau
  // list berhenti di 100 user kira sisanya hilang. Tombol manual tetap ada
  // sebagai fallback (mis. IntersectionObserver tak didukung).
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const root = el.closest('[data-slot="scroll-area-viewport"]')
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore()
        }
      },
      // rootMargin: picu sedikit sebelum benar-benar sampai dasar.
      { root, rootMargin: '300px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, onLoadMore])

  // Tampilkan penanda nomor hanya bila percakapan yang termuat memang berasal
  // dari lebih dari satu nomor kita.
  const showSender =
    new Set(
      conversations.map((c) => c.waSession?.id).filter((id): id is string => Boolean(id)),
    ).size > 1

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b p-3">
        <h2 className="text-lg font-semibold tracking-tight">Inbox</h2>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            aria-label="Cari percakapan"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari nama atau nomor"
            className="pl-8"
          />
        </div>
        <Tabs
          value={filter}
          onValueChange={(v) => onFilterChange(v as InboxFilter)}
        >
          <TabsList className="grid w-full grid-cols-4">
            {TAB_ITEMS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs">
                <span className="truncate">{t.label}</span>
                {counts[t.value] > 0 && (
                  <span className="bg-muted-foreground/20 ml-1 hidden rounded-full px-1.5 text-xs sm:inline">
                    {counts[t.value]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {/* Filter nomor — hanya relevan kalau user punya >1 nomor terhubung.
          Tanpa ini, satu nomor pelanggan yang chat ke dua nomor kita tampil
          sebagai dua baris yang terlihat kembar. */}
      {senders.length > 1 && (
        <div className="border-b px-3 pb-3">
          <Select
            value={senderFilter || ALL_SENDERS}
            onValueChange={(v) => onSenderFilterChange(v === ALL_SENDERS ? '' : v)}
          >
            <SelectTrigger className="w-full" aria-label="Filter nomor WhatsApp">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SENDERS}>Semua nomor</SelectItem>
              {senders.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {senderName(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* min-h-0 WAJIB: tanpa ini flex item (flex-1) default min-height:auto →
          Root ikut tinggi konten (ratusan chat), Viewport size-full tak pernah
          punya tinggi terbatas → tidak ada scroll & item bawah terpotong oleh
          overflow-hidden. min-h-0 bikin flex-1 menyusut ke ruang tersisa. */}
      <ScrollArea className="min-h-0 flex-1 overscroll-contain">
        {isLoading ? (
          <div className="text-muted-foreground p-4 text-center text-sm">
            Memuat…
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-muted-foreground p-8 text-center text-sm">
            Tidak ada percakapan di filter ini.
          </div>
        ) : (
          <ul>
            {conversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    'hover:bg-muted/50 flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors',
                    selectedId === c.id && 'bg-muted',
                  )}
                >
                  <Avatar className="size-10 shrink-0">
                    {c.avatar && (
                      <AvatarImage src={c.avatar} alt={c.name ?? ''} />
                    )}
                    <AvatarFallback>
                      {(c.name || c.phoneNumber).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {c.name || `+${c.phoneNumber}`}
                      </p>
                      <span className="text-muted-foreground shrink-0 text-xs">
                        {formatRelativeTime(c.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-muted-foreground line-clamp-1 flex-1 text-xs">
                        {c.lastMessage?.role === 'AI' && (
                          <Bot className="mr-1 inline size-3" aria-hidden />
                        )}
                        {(c.lastMessage?.role === 'AGENT' ||
                          c.lastMessage?.role === 'HUMAN') && (
                          <UserRound
                            className="mr-1 inline size-3"
                            aria-hidden
                          />
                        )}
                        {c.lastMessage?.role === 'USER' && (
                          <MessageCircle
                            className="mr-1 inline size-3"
                            aria-hidden
                          />
                        )}
                        {c.lastMessage?.content || 'Belum ada pesan'}
                      </p>
                      <ConvBadges
                        aiPaused={c.aiPaused}
                        isResolved={c.isResolved}
                      />
                    </div>
                    {/* Nomor KITA yang memegang percakapan ini. Hanya relevan
                        (dan hanya ditampilkan) kalau akun punya >1 nomor —
                        untuk akun satu nomor barisnya cuma jadi ramai. */}
                    {showSender && (
                      <SenderLabel sender={c.waSession} className="mt-0.5" />
                    )}
                  </div>
                </button>
              </li>
            ))}
            {hasMore && (
              <li>
                {/* Sentinel untuk auto-load saat scroll mendekati dasar. */}
                <div ref={sentinelRef} aria-hidden className="h-px w-full" />
                <button
                  type="button"
                  onClick={onLoadMore}
                  disabled={isLoadingMore}
                  className="text-primary hover:bg-muted/50 w-full px-3 py-3 text-center text-xs font-medium disabled:opacity-60"
                >
                  {isLoadingMore ? 'Memuat…' : 'Muat lebih banyak'}
                </button>
              </li>
            )}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}

function ConvBadges({
  aiPaused,
  isResolved,
}: {
  aiPaused: boolean
  isResolved: boolean
}) {
  if (isResolved) {
    return (
      <Badge variant="outline" className="gap-1 px-1.5 text-xs">
        <CheckCircle2 className="size-3" />
        Selesai
      </Badge>
    )
  }
  // Tone sama dengan header ChatView supaya arti warnanya konsisten:
  // brand (orange) = AI menangani, info (sky) = manusia yang menangani.
  if (aiPaused) {
    return <StatusBadge tone="info" label="Manual" icon={Hand} className="px-2 py-0.5" />
  }
  return <StatusBadge tone="brand" label="AI" icon={Bot} className="px-2 py-0.5" />
}
