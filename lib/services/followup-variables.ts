// Resolve placeholder {nama}, {invoice}, dst di template follow-up.
// Dipanggil saat queue di-generate (lib/services/followup-engine.ts) dan saat
// preview / test send. Fail-soft: variable yang tidak punya data jadi '-'.

import type {
  User,
  UserBankAccount,
  UserOrder,
  UserShippingProfile,
} from '@prisma/client'

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
