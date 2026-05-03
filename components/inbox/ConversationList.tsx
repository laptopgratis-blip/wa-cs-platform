'use client'

// Daftar percakapan di kolom kiri inbox. Filter tabs + search + item list.
import { Bot, CheckCircle2, Hand, Search } from 'lucide-react'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatRelativeTime } from '@/lib/format-time'
import { cn } from '@/lib/utils'

import type { InboxConversation, InboxCounts, InboxFilter } from './types'

interface ConversationListProps {
  conversations: InboxConversation[]
  counts: InboxCounts
  filter: InboxFilter
  search: string
  selectedId: string | null
  isLoading: boolean
  onFilterChange: (next: InboxFilter) => void
  onSearchChange: (next: string) => void
  onSelect: (id: string) => void
}

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
  onFilterChange,
  onSearchChange,
  onSelect,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="space-y-3 border-b p-3">
        <h2 className="text-lg font-semibold tracking-tight">Inbox</h2>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Cari nama atau nomor"
            className="pl-8"
          />
        </div>
        <Tabs value={filter} onValueChange={(v) => onFilterChange(v as InboxFilter)}>
          <TabsList className="grid w-full grid-cols-4">
            {TAB_ITEMS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="text-xs">
                <span className="truncate">{t.label}</span>
                {counts[t.value] > 0 && (
                  <span className="ml-1 hidden rounded-full bg-muted-foreground/20 px-1.5 text-[10px] sm:inline">
                    {counts[t.value]}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Memuat...</div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
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
                    'flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/50',
                    selectedId === c.id && 'bg-muted',
                  )}
                >
                  <Avatar className="size-10 shrink-0">
                    {c.avatar && <AvatarImage src={c.avatar} alt={c.name ?? ''} />}
                    <AvatarFallback>
                      {(c.name || c.phoneNumber).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {c.name || `+${c.phoneNumber}`}
                      </p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelativeTime(c.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <p className="line-clamp-1 flex-1 text-xs text-muted-foreground">
                        {c.lastMessage?.role === 'AI' && '🤖 '}
                        {c.lastMessage?.role === 'HUMAN' && '👤 '}
                        {c.lastMessage?.content || 'Belum ada pesan'}
                      </p>
                      <ConvBadges
                        aiPaused={c.aiPaused}
                        isResolved={c.isResolved}
                      />
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  )
}

function ConvBadges({ aiPaused, isResolved }: { aiPaused: boolean; isResolved: boolean }) {
  if (isResolved) {
    return (
      <Badge variant="outline" className="gap-1 px-1.5 text-[10px]">
        <CheckCircle2 className="size-3" />
        Selesai
      </Badge>
    )
  }
  if (aiPaused) {
    return (
      <Badge variant="secondary" className="gap-1 px-1.5 text-[10px]">
        <Hand className="size-3" />
        Manual
      </Badge>
    )
  }
  return (
    <Badge variant="default" className="gap-1 px-1.5 text-[10px]">
      <Bot className="size-3" />
      AI
    </Badge>
  )
}
