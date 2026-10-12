// Data milik seller yang dibutuhkan resolver variabel follow-up
// ({rekening}, {wa_admin}) — dimuat lewat satu pintu supaya engine (saat
// antrean dibuat), sender (param template Meta) dan refresh antrean (saat data
// pelanggan diedit) me-resolve template dengan konteks yang SAMA.
//
// Konteks ORDER memakai loadOrderResolveExtras: selain data seller, ia
// membawa nomor CS WhatsApp per produk (csNumber) untuk {wa_admin}.

import type { UserBankAccount, UserShippingProfile } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { loadOrderCs } from '@/lib/services/orders/order-cs-loader'

export interface SellerResolveExtras {
  bankAccounts: UserBankAccount[]
  shippingProfile: UserShippingProfile | null
}

export async function loadSellerResolveExtras(
  userId: string,
): Promise<SellerResolveExtras> {
  const [bankAccounts, shippingProfile] = await Promise.all([
    prisma.userBankAccount.findMany({ where: { userId, isActive: true } }),
    prisma.userShippingProfile.findUnique({ where: { userId } }),
  ])
  return { bankAccounts, shippingProfile }
}

export interface OrderResolveExtras extends SellerResolveExtras {
  /** Nomor CS WhatsApp produk di order ini; null = pakai nomor toko. */
  csNumber: string | null
}

/**
 * Extras seller + nomor CS WhatsApp per produk untuk SATU order. Semua
 * pembangun konteks order (engine, sender, refresh antrean) wajib lewat
 * sini supaya {wa_admin} konsisten: nomor CS produk bila ada, selain itu
 * nomor konfirmasi toko.
 */
export async function loadOrderResolveExtras(order: {
  userId: string
  items: unknown
}): Promise<OrderResolveExtras> {
  const [seller, orderCs] = await Promise.all([
    loadSellerResolveExtras(order.userId),
    loadOrderCs({ userId: order.userId, items: order.items }),
  ])
  return { ...seller, csNumber: orderCs.csNumber }
}
