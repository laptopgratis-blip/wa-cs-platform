'use client'

// Container utama halaman inbox: kelola filter/search/selectedId state,
// fetch list, render split panel.
import { Inbox as InboxIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ChatView } from './ChatView'
import { ConversationList } from './ConversationList'
import type {
  InboxConversation,
  InboxCounts,
  InboxFilter,
} from './types'

interface InboxViewProps {
  initialConversations: InboxConversation[]
  initialCounts: InboxCounts
}

export function InboxView({ initialConversations, initialCounts }: InboxViewProps) {
  const [conversations, setConversations] = useState(initialConversations)
  const [counts, setCounts] = useState(initialCounts)
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  )
  const [isLoading, setLoading] = useState(false)

  // Debounce search supaya tidak spam API setiap keystroke.
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [search])

  const fetchList = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ filter })
      if (debouncedSearch) params.set('search', debouncedSearch)
      const res = await fetch(`/api/inbox?${params}`)
      const json = (await res.json()) as {
        success: boolean
        data?: { conversations: InboxConversation[]; counts: InboxCounts }
      }
      if (json.success && json.data) {
        setConversations(json.data.conversations)
        setCounts(json.data.counts)
      }
    } finally {
      setLoading(false)
    }
  }, [filter, debouncedSearch])

  // Skip first call (data sudah dari server). Trigger saat filter/search ganti.
  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false
      return
    }
    void fetchList()
  }, [fetchList])

  const refresh = useCallback(() => {
    void fetchList()
  }, [fetchList])

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  )

  return (
    <div className="flex h-[calc(100svh-3.5rem)] overflow-hidden border-t bg-background">
      <aside className="w-80 shrink-0 border-r">
        <ConversationList
          conversations={conversations}
          counts={counts}
          filter={filter}
          search={search}
          selectedId={selectedId}
          isLoading={isLoading}
          onFilterChange={(f) => {
            setFilter(f)
            setSelectedId(null)
          }}
          onSearchChange={setSearch}
          onSelect={setSelectedId}
        />
      </aside>
      <section className="flex-1 h-full overflow-hidden">
        {selected ? (
          <ChatView contactId={selected.id} onChanged={refresh} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <InboxIcon className="size-10" />
            <p>Pilih percakapan di sebelah kiri untuk lihat chat.</p>
          </div>
        )}
      </section>
    </div>
  )
}
