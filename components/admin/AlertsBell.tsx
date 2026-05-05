'use client'

// Bell icon dengan badge jumlah unread + dropdown 10 alert terbaru.
// Polling /api/admin/alerts setiap 60 detik supaya selalu fresh.
import { Bell, Check, CheckCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface AlertItem {
  id: string
  level: 'RED' | 'YELLOW' | 'GREEN'
  category: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
}

const LEVEL_DOT: Record<AlertItem['level'], string> = {
  RED: 'bg-red-500',
  YELLOW: 'bg-amber-400',
  GREEN: 'bg-emerald-500',
}

export function AlertsBell({ collapsed = false }: { collapsed?: boolean }) {
  const [items, setItems] = useState<AlertItem[]>([])
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/alerts')
      const json = (await res.json()) as {
        success: boolean
        data?: { items: AlertItem[]; unread: number }
      }
      if (json.success && json.data) {
        setItems(json.data.items)
        setUnread(json.data.unread)
      }
    } catch {
      // ignore — diam saja kalau gagal
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 60_000)
    return () => clearInterval(t)
  }, [load])

  async function markOne(id: string) {
    await fetch(`/api/admin/alerts/${id}/read`, { method: 'POST' })
    void load()
  }

  async function markAll() {
    const res = await fetch('/api/admin/alerts/read-all', { method: 'POST' })
    if (res.ok) {
      toast.success('Semua alert ditandai dibaca')
      void load()
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifikasi"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
          {collapsed && <span className="sr-only">Notifikasi</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">
            Alerts {unread > 0 && `(${unread} baru)`}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={markAll}
            disabled={unread === 0}
            className="h-7 px-2 text-xs"
          >
            <CheckCheck className="mr-1 size-3" /> Tandai semua
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Belum ada alert.
            </p>
          ) : (
            items.slice(0, 10).map((a) => (
              <div
                key={a.id}
                className={cn(
                  'group flex items-start gap-2 border-b px-3 py-2 last:border-b-0',
                  !a.isRead && 'bg-amber-50/40 dark:bg-amber-950/20',
                )}
              >
                <span
                  className={cn(
                    'mt-1 size-2 shrink-0 rounded-full',
                    LEVEL_DOT[a.level],
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{a.title}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                    {a.message}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString('id-ID')}
                  </p>
                </div>
                {!a.isRead && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => void markOne(a.id)}
                    className="size-6 opacity-0 group-hover:opacity-100"
                    title="Tandai dibaca"
                  >
                    <Check className="size-3" />
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
