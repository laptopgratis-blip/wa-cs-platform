'use client'

// Bell icon di header — badge merah dgn jumlah unread, dropdown 10 notif terbaru.
// Polling 60 detik supaya update tanpa real-time socket.
import { Bell, Check } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface Notif {
  id: string
  type: string
  title: string
  message: string
  link: string | null
  readAt: string | null
  createdAt: string
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins}m lalu`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}j lalu`
  const days = Math.floor(hours / 24)
  return `${days}h lalu`
}

export function NotificationBell() {
  const [items, setItems] = useState<Notif[]>([])
  const [unreadCount, setUnread] = useState(0)
  const [open, setOpen] = useState(false)

  async function load() {
    try {
      const res = await fetch('/api/notifications')
      const json = (await res.json()) as {
        success: boolean
        data?: { unreadCount: number; notifications: Notif[] }
      }
      if (json.success && json.data) {
        setItems(json.data.notifications)
        setUnread(json.data.unreadCount)
      }
    } catch {
      /* swallow — bell is non-critical */
    }
  }

  useEffect(() => {
    void load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [])

  async function markRead(id: string) {
    void fetch(`/api/notifications/${id}/read`, { method: 'POST' })
    setItems((arr) =>
      arr.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)),
    )
    setUnread((n) => Math.max(0, n - 1))
  }

  async function markAllRead() {
    const res = await fetch('/api/notifications/read-all', { method: 'POST' })
    if (res.ok) {
      const now = new Date().toISOString()
      setItems((arr) => arr.map((n) => ({ ...n, readAt: now })))
      setUnread(0)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative flex size-9 items-center justify-center rounded-md hover:bg-warm-100"
          aria-label="Notifikasi"
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          Notifikasi
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="text-xs font-normal text-primary-500 hover:underline"
            >
              Tandai semua dibaca
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            Belum ada notifikasi.
          </div>
        ) : (
          items.slice(0, 10).map((n) => {
            const isRead = Boolean(n.readAt)
            const Wrapper = n.link ? Link : 'div'
            return (
              <DropdownMenuItem
                key={n.id}
                className={cn(
                  'cursor-pointer items-start gap-2 px-3 py-2',
                  !isRead && 'bg-primary-500/5',
                )}
                onClick={() => {
                  if (!isRead) void markRead(n.id)
                  if (n.link) setOpen(false)
                }}
                asChild
              >
                <Wrapper href={n.link ?? '#'}>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      {isRead && (
                        <Check className="size-3 text-muted-foreground" />
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">
                      {n.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70">
                      {timeAgo(n.createdAt)}
                    </p>
                  </div>
                </Wrapper>
              </DropdownMenuItem>
            )
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
