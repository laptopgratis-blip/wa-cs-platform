// Resolve placeholder {nama}, {invoice}, dst di template follow-up.
// Dipanggil saat queue di-generate (lib/services/followup-engine.ts) dan saat
// preview / test send. Fail-soft: variable yang tidak punya data jadi '-'.

import type {
  User,
  UserBankAccount,
  UserOrder,
  UserShippingProfile,
} from '@prisma/client'

import { confirmReceivedLink, reviewLink } from '@/lib/review-token'

interface OrderItem {
  productId?: string
  name: string
  qty: number
  price: number
}

export interface ResolveContext {
  order: UserOrder
  user: Pick<User, 'id' | 'name'>
  bankAccounts: UserBankAccount[]
  shippingProfile?: UserShippingProfile | null
}

export function resolveTemplateVariables(
  template: string,
  ctx: ResolveContext,
): string {
  const { order, user, bankAccounts, shippingProfile } = ctx

  let resolved = template

  resolved = replaceAll(resolved, '{nama}', order.customerName || 'Kak')
  resolved = replaceAll(resolved, '{invoice}', order.invoiceNumber || '-')
  resolved = replaceAll(resolved, '{total}', formatRupiah(order.totalRp || 0))

  const items = (order.items as OrderItem[] | null) || []
  const produkList = items
    .map((i) => `- ${i.name} × ${i.qty} (${formatRupiah(i.price * i.qty)})`)
    .join('\n')
  resolved = replaceAll(resolved, '{produk}', produkList || '-')

  const rekeningList = bankAccounts
    .filter((b) => b.isActive)
    .map(
      (b) => `🏦 ${b.bankName}\n${b.accountNumber}\na.n. ${b.accountName}`,
    )
    .join('\n\n')
  resolved = replaceAll(resolved, '{rekening}', rekeningList || '-')

  resolved = replaceAll(
    resolved,
    '{wa_admin}',
    shippingProfile?.waConfirmNumber || '-',
  )

  const alamatParts = [
    order.shippingAddress,
    order.shippingCityName,
    order.shippingProvinceName,
    order.shippingPostalCode,
  ].filter(Boolean)
  resolved = replaceAll(resolved, '{alamat}', alamatParts.join(', ') || '-')

  resolved = replaceAll(resolved, '{etd}', order.shippingEtd || '-')
  resolved = replaceAll(
    resolved,
    '{kurir}',
    (order.shippingCourier || '').toUpperCase() || '-',
  )
  resolved = replaceAll(
    resolved,
    '{resi}',
    order.trackingNumber || '(belum ada)',
  )

  // User.storeName tidak ada di schema — fallback ke user.name.
  resolved = replaceAll(resolved, '{nama_toko}', user.name || 'Toko Kami')

  const invoiceUrl = order.invoiceNumber
    ? `https://hulao.id/invoice/${encodeURIComponent(order.invoiceNumber)}`
    : '-'
  resolved = replaceAll(resolved, '{invoice_url}', invoiceUrl)

  // Link testimoni & konfirmasi-diterima 1-klik (token HMAC stateless).
  resolved = replaceAll(resolved, '{link_review}', reviewLink(order.id))
  resolved = replaceAll(
    resolved,
    '{link_terima}',
    confirmReceivedLink(order.id),
  )

  return resolved
}

// ── Lead Live nurture ("belum order") ───────────────────────────────────────
// Lead belum punya order, jadi variabel order ({invoice}/{total}/{resi}/…)
// tidak relevan. Variabel yang didukung: {nama}, {produk_minat}, {nama_toko},
// {link_order} (link balik ke form order / live room). Variabel order yang
// kebetulan dipakai di template lead di-fallback ke '-' supaya tidak bocor
// placeholder mentah.
export interface LeadResolveContext {
  customerName: string
  productInterest: string | null
  storeName: string | null
  // Link CTA untuk order — form order kalau ada, kalau tidak link live room.
  orderLink: string
}

const LEAD_ORDER_PLACEHOLDERS = [
  '{invoice}',
  '{total}',
  '{produk}',
  '{rekening}',
  '{wa_admin}',
  '{alamat}',
  '{etd}',
  '{kurir}',
  '{resi}',
  '{invoice_url}',
]

export function resolveLeadTemplateVariables(
  template: string,
  ctx: LeadResolveContext,
): string {
  let resolved = template
  resolved = replaceAll(resolved, '{nama}', ctx.customerName || 'Kak')
  resolved = replaceAll(
    resolved,
    '{produk_minat}',
    ctx.productInterest || 'produk kami',
  )
  resolved = replaceAll(resolved, '{nama_toko}', ctx.storeName || 'Toko Kami')
  resolved = replaceAll(resolved, '{link_order}', ctx.orderLink || '-')
  // Fallback placeholder order yang tidak relevan → '-'.
  for (const ph of LEAD_ORDER_PLACEHOLDERS) {
    resolved = replaceAll(resolved, ph, '-')
  }
  return resolved
}

function replaceAll(input: string, search: string, replacement: string): string {
  // String#replaceAll dengan literal string (bukan regex) supaya tidak perlu
  // escape karakter spesial seperti {, }, $, dll.
  return input.split(search).join(replacement)
}

function formatRupiah(amount: number): string {
  return 'Rp ' + Math.round(amount).toLocaleString('id-ID')
}

// Dummy data untuk fitur "Test Kirim ke Saya" + preview di edit modal.
// Schema match UserOrder + relations supaya resolveTemplateVariables jalan.
export const DUMMY_RESOLVE_CONTEXT: ResolveContext = {
  order: {
    customerName: 'Andi Pratama (TEST)',
    customerPhone: '628123456789',
    invoiceNumber: 'INV-TEST-001',
    totalRp: 150000,
    paymentMethod: 'TRANSFER',
    shippingAddress: 'Jl. Mawar No. 5 RT 02 RW 01',
    shippingCityName: 'Bandung',
    shippingProvinceName: 'Jawa Barat',
    shippingPostalCode: '40123',
    shippingEtd: '2-3',
    shippingCourier: 'jne',
    trackingNumber: '0987654321',
    items: [
      { name: 'Produk Test', qty: 2, price: 75000 },
    ] as unknown as UserOrder['items'],
  } as unknown as UserOrder,
  user: { id: 'test', name: 'Toko Test' },
  bankAccounts: [
    {
      bankName: 'BCA',
      accountNumber: '1234567890',
      accountName: 'TOKO TEST',
      isActive: true,
    } as UserBankAccount,
  ],
  shippingProfile: {
    waConfirmNumber: '628111222333',
  } as UserShippingProfile,
}
