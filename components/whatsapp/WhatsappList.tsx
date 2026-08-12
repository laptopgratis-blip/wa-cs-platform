'use client'

// Wrapper client untuk halaman /whatsapp — menampung daftar session,
// modal tambah (QR Baileys / Cloud API resmi), dan refresh data.
import { BadgeCheck, MessageCircle, Plus, QrCode, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'

import { AddWaModal } from '@/components/whatsapp/AddWaModal'
import { AddWabaModal } from '@/components/whatsapp/AddWabaModal'
import {
  WaSessionCard,
  type AiModelOption,
  type SoulOption,
  type WaSessionData,
} from '@/components/whatsapp/WaSessionCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface WhatsappListProps {
  sessions: WaSessionData[]
  souls: SoulOption[]
  models: AiModelOption[]
}

export function WhatsappList({ sessions, souls, models }: WhatsappListProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [wabaOpen, setWabaOpen] = useState(false)
  // Kalau diisi: modal dibuka dalam mode "Pair Ulang" untuk session existing.
  // Kalau null saat modal open: mode "Tambah" (bikin session baru).
  const [repairId, setRepairId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const refresh = useCallback(() => {
    startTransition(() => {
      router.refresh()
    })
  }, [router])

  const openAdd = useCallback(() => {
    setRepairId(null)
    setOpen(true)
  }, [])

  const openRepair = useCallback((sessionId: string) => {
    setRepairId(sessionId)
    setOpen(true)
  }, [])

  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Hubungkan akun WhatsApp untuk mulai dilayani AI 24/7."
        actions={
          <>
            <Button variant="outline" size="icon" aria-label="Segarkan daftar" onClick={refresh} disabled={isPending}>
              <RefreshCw className={`size-4 ${isPending ? 'animate-spin' : ''}`} />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="bg-primary-500 text-white shadow-orange hover:bg-primary-600">
                  <Plus className="mr-2 size-4" />
                  Tambah WhatsApp
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={openAdd}>
                  <QrCode className="mr-2 size-4" />
                  Scan QR (nomor WhatsApp biasa)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setWabaOpen(true)}>
                  <BadgeCheck className="mr-2 size-4" />
                  WhatsApp Business API (resmi Meta)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {sessions.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={MessageCircle}
              title="Belum ada WhatsApp tertaut"
              description="Pindai QR sekali, AI langsung siaga membalas chat masuk."
              action={
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button onClick={openAdd}>
                    <QrCode className="mr-2 size-4" />
                    Scan QR (nomor biasa)
                  </Button>
                  <Button variant="outline" onClick={() => setWabaOpen(true)}>
                    <BadgeCheck className="mr-2 size-4" />
                    Business API (resmi)
                  </Button>
                </div>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => (
            <WaSessionCard
              key={s.id}
              session={s}
              souls={souls}
              models={models}
              onChanged={refresh}
              onRepair={openRepair}
            />
          ))}
        </div>
      )}

      <AddWaModal
        open={open}
        onOpenChange={setOpen}
        onConnected={refresh}
        existingSessionId={repairId}
      />
      <AddWabaModal open={wabaOpen} onOpenChange={setWabaOpen} onConnected={refresh} />
    </>
  )
}
