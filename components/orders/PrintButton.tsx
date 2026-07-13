'use client'

// Tombol cetak untuk halaman packing list (server component tak bisa onClick).
import { Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="mr-2 size-4" />
      Cetak
    </Button>
  )
}
