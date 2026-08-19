'use client'

// Banner mode Cloud API di halaman Follow-Up: kalau user punya nomor Cloud
// API, follow-up di luar window 24 jam butuh template Meta. Tampilkan pemilih
// nomor + StarterPackPanel (siapkan template bawaan + status). User Baileys-
// only tidak melihat apa pun.
import { BadgeCheck } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { StarterPackPanel } from '@/components/waba-templates/StarterPackPanel'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface CloudSessionLite {
  id: string
  displayName: string | null
  phoneNumber: string | null
}

export function MetaTemplateBanner({ sessions }: { sessions: CloudSessionLite[] }) {
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? '')
  if (sessions.length === 0) return null

  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm text-emerald-900">
          <BadgeCheck className="size-4" /> Nomor resmi Meta (Cloud API) terdeteksi — follow-up di luar window 24 jam
          butuh <b>template Meta yang disetujui</b>. Biaya per pesan dipotong dari Kredit Pesan WA.
        </p>
        {sessions.length > 1 && (
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {sessions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.displayName || s.phoneNumber || s.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {sessionId && <StarterPackPanel sessionId={sessionId} />}
      <p className="text-xs text-emerald-900/70">
        Kelola template lengkap di{' '}
        <Link href={`/whatsapp/templates?session=${sessionId}`} className="underline">Template Meta</Link>. Template
        bawaan yang disetujui otomatis dipakai untuk follow-up default yang cocok.
      </p>
    </div>
  )
}
