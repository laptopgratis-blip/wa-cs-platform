// POST /api/shipping/cost
// Body: { origin: number, destination: number, weight: number, couriers: string[] }
// Proxy ke RajaOngkir Komerce dengan cache 6 jam (lib/services/rajaongkir).
import type { NextResponse } from 'next/server'
import { z } from 'zod'

import { jsonError, jsonOk } from '@/lib/api'
import { requireOrderSystemAccess } from '@/lib/order-system-gate'
import {
  SUPPORTED_COURIERS,
  calculateShippingCost,
} from '@/lib/services/rajaongkir'

const courierCodes = SUPPORTED_COURIERS.map((c) => c.code) as [
  string,
  ...string[],
]

const costSchema = z.object({
  origin: z.number().int().positive(),
  destination: z.number().int().positive(),
  weight: z
    .number()
    .int()
    .min(1, 'Berat minimal 1 gram')
    .max(150_000, 'Berat maksimal 150 kg'),
  couriers: z.array(z.enum(courierCodes)).min(1, 'Pilih minimal 1 kurir'),
})

export async function POST(req: Request) {
  try {
    await requireOrderSystemAccess()
  } catch (res) {
    return res as NextResponse
  }

  const json = await req.json().catch(() => null)
  const parsed = costSchema.safeParse(json)
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? 'Data tidak valid')
  }

  try {
    const services = await calculateShippingCost(parsed.data)
    return jsonOk({ services })
  } catch (err) {
    console.error('[POST /api/shipping/cost] gagal:', err)
    return jsonError('Gagal hitung ongkir. Coba lagi sebentar.', 500)
  }
}
