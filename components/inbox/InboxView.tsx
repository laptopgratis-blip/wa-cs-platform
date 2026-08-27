'use client'

// Container utama halaman inbox: kelola filter/search/selectedId state,
// fetch list, render split panel.
//
// Mobile: hanya 1 panel tampil — list saat tidak ada selection, chat
// full-screen saat conversation di-pilih (dengan tombol back ke list).
// Desktop: split panel seperti biasa.
import { Inbox as InboxIcon } from 'lucide-react'
import { toast } from 'sonner'

import { fetchJson } from '@/lib/fetch-json'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  getSocket,
  subscribeWaSession,
  type InboxMessagePayload,
} from '@/lib/socket-client'
import { cn } from '@/lib/utils'

import { ChatView } from './ChatView'
import { ConversationList } from './ConversationList'
import type {
  InboxConversation,
  InboxCounts,
  InboxFilter,
  MessageSource,
  SenderOption,
} from './types'

interface InboxViewProps {
  initialConversations: InboxConversation[]
  initialCounts: InboxCounts
  initialHasMore?: boolean
  // Daftar WA session milik user — dipakai untuk subscribe room realtime.
  sessionIds: string[]
  /** Nomor WA milik user, untuk filter "tampilkan percakapan nomor mana". */
  senders: SenderOption[]
}

export function InboxView({
  initialConversations,
  initialCounts,
  initialHasMore = false,
  sessionIds,
  senders,
}: InboxViewProps) {
  const [conversations, setConversations] = useState(initialConversations)
  const [counts, setCounts] = useState(initialCounts)
  const [filter, setFilter] = useState<InboxFilter>('all')
  // '' = semua nomor.
  const [senderFilter, setSenderFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null,
  )
  const [isLoading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [isLoadingMore, setLoadingMore] = useState(false)

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
      if (senderFilter) params.set('senderPhone', senderFilter)
      // Dulu hanya cabang sukses yang ditangani: kalau gagal, daftar tetap
      // kosong tanpa pesan apa pun dan user mengira memang belum ada chat.
      const r = await fetchJson<{
        success: boolean
        data?: {
          conversations: InboxConversation[]
          counts: InboxCounts
          hasMore?: boolean
        }
      }>(`/api/inbox?${params}`, undefined, 'Gagal memuat daftar percakapan')
      if (!r.ok || !r.data?.data) {
        toast.error(r.error ?? 'Gagal memuat daftar percakapan')
        return
      }
      setConversations(r.data.data.conversations)
      setCounts(r.data.data.counts)
      setHasMore(r.data.data.hasMore ?? false)
    } finally {
      setLoading(false)
    }
  }, [filter, debouncedSearch, senderFilter])

  // Muat halaman percakapan berikutnya (offset = jumlah yang sudah tampil) lalu
  // tambahkan ke daftar. Dipakai tombol "Muat lebih banyak".
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({
        filter,
        offset: String(conversations.length),
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (senderFilter) params.set('senderPhone', senderFilter)
      const r = await fetchJson<{
        success: boolean
        data?: { conversations: InboxConversation[]; hasMore?: boolean }
      }>(`/api/inbox?${params}`, undefined, 'Gagal memuat percakapan berikutnya')
      if (!r.ok || !r.data?.data) {
        toast.error(r.error ?? 'Gagal memuat percakapan berikutnya')
        return
      }
      {
        const more = r.data.data.conversations
        setConversations((prev) => {
          // Dedup defensif kalau ada pergeseran urutan antar-fetch.
          const seen = new Set(prev.map((c) => c.id))
          return [...prev, ...more.filter((c) => !seen.has(c.id))]
        })
        setHasMore(r.data.data.hasMore ?? false)
      }
    } finally {
      setLoadingMore(false)
    }
  }, [isLoadingMore, hasMore, filter, conversations.length, debouncedSearch, senderFilter])

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

  // Subscribe realtime ke room tiap WA session milik user. Saat ada
  // 'inbox:message': update preview & reorder conversation yang sudah ada,
  // atau refetch list kalau kontaknya baru (belum ada di daftar).
  //
  // Key dependency pakai join string supaya effect tidak re-run gara-gara
  // identitas array berubah tiap render.
  const sessionIdsKey = sessionIds.join(',')
  // refresh dipakai di handler tapi sengaja tidak masuk deps: kalau ikut,
  // tiap fetch (yang mengubah fetchList) akan unsubscribe+resubscribe ulang.
  // Pegang lewat ref biar handler selalu lihat versi terbaru tanpa re-subscribe.
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  // Cermin conversations terbaru untuk dibaca handler socket secara sinkron
  // (cek "kontak sudah ada?") tanpa memasukkan conversations ke deps effect
  // subscribe — kalau masuk deps, tiap update list akan resubscribe room.
  const conversationsRef = useRef(conversations)
  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    if (sessionIds.length === 0) return
    const socket = getSocket()
    const allowed = new Set(sessionIds)

    for (const sessionId of sessionIds) {
      void subscribeWaSession(socket, sessionId)
    }

    const handler = (payload: InboxMessagePayload) => {
      if (!allowed.has(payload.sessionId)) return
      const msg = payload.message
      // Cek keberadaan kontak dari snapshot terbaru (bukan dari flag yang
      // di-set di dalam updater — updater bisa jalan async/batched).
      const exists = conversationsRef.current.some(
        (c) => c.id === payload.contactId,
      )
      if (!exists) {
        // Kontak baru (mis. chat pertama kali) → refetch supaya muncul tanpa
        // membentuk InboxConversation parsial yang salah tipe.
        refreshRef.current()
        return
      }
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === payload.contactId)
        if (idx === -1) return prev
        const current = prev[idx]!
        // Bentuk objek baru (immutable) dengan preview + timestamp terbaru,
        // lalu pindahkan ke posisi paling atas.
        const updated: InboxConversation = {
          ...current,
          lastMessageAt: msg.createdAt,
          lastMessage: {
            content: msg.content,
            role: msg.role,
            source: (msg.source as MessageSource | null) ?? null,
            createdAt: msg.createdAt,
          },
        }
        const next = [...prev]
        next.splice(idx, 1)
        return [updated, ...next]
      })
    }

    socket.on('inbox:message', handler)
    return () => {
      socket.off('inbox:message', handler)
      // wa-service 'unsubscribe' menerima sessionId string polos (lihat
      // wa-service/src/index.ts). InboxView yang memegang room sesi tingkat
      // daftar, jadi unsubscribe di sini saat unmount halaman inbox.
      for (const sessionId of sessionIds) {
        socket.emit('unsubscribe', sessionId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionIdsKey])

  const selected = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  )

  // h-full, BUKAN kalkulasi viewport: <main> di layout dashboard sudah punya
  // tinggi pasti (flex-1 dalam kolom h-dvh), jadi h-full pas persis mengisinya
  // di semua breakpoint — termasuk saat ada padding BottomNav + safe-area di
  // mobile. Kalkulasi `100svh - <tinggi topbar>` gampang meleset begitu tinggi
  // topbar/padding berubah, dan selisih sekecil apa pun bikin <main> ikut
  // scrollable sehingga seluruh halaman bergeser saat panel di-scroll.
  return (
    <div className="flex h-full overflow-hidden border-t bg-background">
      {/* List — full width di mobile saat tidak ada selection,
          fixed-width sidebar di desktop. */}
      <aside
        className={cn(
          'h-full shrink-0 overflow-hidden border-r md:block md:w-80',
          selected ? 'hidden md:block' : 'w-full',
        )}
      >
        <ConversationList
          conversations={conversations}
          counts={counts}
          filter={filter}
          search={search}
          selectedId={selectedId}
          isLoading={isLoading}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMore}
          onFilterChange={(f) => {
            setFilter(f)
            setSelectedId(null)
          }}
          onSearchChange={setSearch}
          senders={senders}
          senderFilter={senderFilter}
          onSenderFilterChange={(v) => {
            setSenderFilter(v)
            setSelectedId(null)
          }}
          onSelect={setSelectedId}
        />
      </aside>
      {/* Chat — hanya tampil di mobile saat ada selection. */}
      <section
        className={cn(
          'h-full overflow-hidden md:flex-1 md:flex',
          selected ? 'flex flex-1' : 'hidden md:flex',
        )}
      >
        {selected ? (
          <ChatView
            contactId={selected.id}
            onChanged={refresh}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <InboxIcon className="size-10" />
            <p>Pilih percakapan di sebelah kiri untuk lihat chat.</p>
          </div>
        )}
      </section>
    </div>
  )
}
