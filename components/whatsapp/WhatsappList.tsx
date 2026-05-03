'use client'

// Wrapper client untuk halaman /whatsapp — menampung daftar session,
// modal tambah, dan refresh data setelah ada perubahan.
import { Plus, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'

import { AddWaModal } from '@/components/whatsapp/AddWaModal'
import {
  WaSessionCard,
  type AiModelOption,
  type SoulOption,
  type WaSessionData,
} from '@/components/whatsapp/WaSessionCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface WhatsappListProps {
  sessions: WaSessionData[]
  souls: SoulOption[]
  models: AiModelOption[]
}

export function WhatsappList({ sessions, souls, models }: WhatsappListProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-warm-900 dark:text-warm-50">
            WhatsApp
          </h1>
          <p className="mt-1 text-sm text-warm-500">
            Hubungkan akun WhatsApp untuk mulai dilayani AI 24/7.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={refresh} disabled={isPending}>
            <RefreshCw className={`size-4 ${isPending ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            onClick={openAdd}
            className="bg-primary-500 text-white shadow-orange hover:bg-primary-600"
          >
            <Plus className="mr-2 size-4" />
            Tambah WhatsApp
          </Button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="text-3xl">📱</div>
            <div>
              <p className="font-medium">Belum ada WhatsApp tertaut</p>
              <p className="text-sm text-muted-foreground">
                Klik <strong>Tambah WhatsApp</strong> untuk pindai QR.
              </p>
            </div>
            <Button onClick={openAdd}>
              <Plus className="mr-2 size-4" />
              Tambah WhatsApp
            </Button>
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
    </>
  )
}
