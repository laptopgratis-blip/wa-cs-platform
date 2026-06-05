'use client'

import { useEffect, useState } from 'react'

export function FlashSaleCountdown({ endAt }: { endAt: string }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(endAt).getTime() - now
  if (ms <= 0) {
    return (
      <div className="text-[9px] font-semibold uppercase tracking-wider text-warm-400">
        Berakhir
      </div>
    )
  }
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  const display = h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
  return (
    <div className="flex items-center gap-1 text-[9px] font-bold tabular-nums leading-none text-red-600">
      <span className="rounded-sm bg-red-600 px-1 py-px text-white">{display}</span>
      <span className="uppercase tracking-wider">tersisa</span>
    </div>
  )
}
