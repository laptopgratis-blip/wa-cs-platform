// Single source of truth untuk kolom-kolom yang bisa ditampilkan di /pesanan.
// Phase 1 Custom Columns (2026-05-08): bukan rewrite OrdersTable — kita extend
// table existing supaya driven by `visibleColumns` array dari preference user.
//
// Cara render per kolom dipusatkan via `renderType` supaya OrdersTable cukup
// dispatch ke renderCellByType() — tambah kolom baru = tambah entry di array
// + handle case di renderer.

export type OrderColumnCategory =
  | 'order'
  | 'customer'
  | 'shipping'
  | 'payment'
  | 'tracking'
  | 'others'

export type OrderColumnRenderType =
  | 'invoice' // invoice number + waktu relatif + badge BARU
  | 'datetime'
  | 'currency'
  | 'badge-payment-status'
  | 'badge-delivery-status'
  | 'badge-payment-method'
  | 'text'
  | 'tags'
  | 'phone'
  | 'address'
  | 'pixel-status'
  | 'auto-confirm'
  | 'flash-sale-discount'
  | 'utm'
  | 'tracking-number'
  | 'notes-admin' // inline edit
  | 'order-form-name'

export interface OrderColumn {
  key: string
  label: string
  category: OrderColumnCategory
  defaultVisible: boolean
  // Bisa di-sort di server. Kalau false, header tidak clickable.
  sortable: boolean
  renderType: OrderColumnRenderType
  // Tailwind utility untuk min-width header.
  width?: string
  align?: 'left' | 'right' | 'center'
}

export const ORDER_COLUMNS: OrderColumn[] = [
  // ── ORDER ──
  {
    key: 'invoiceNumber',
    label: 'Invoice / Waktu',
    category: 'order',
    defaultVisible: true,
    sortable: false,
    renderType: 'invoice',
    width: 'min-w-[150px]',
  },
  {
    key: 'createdAt',
    label: 'Tanggal Order',
    category: 'order',
    defaultVisible: false,
    sortable: true,
    renderType: 'datetime',
    width: 'min-w-[140px]',
  },
  {
    key: 'orderFormName',
    label: 'Sumber Form',
    category: 'order',
    defaultVisible: false,
    sortable: false,
    renderType: 'order-form-name',
    width: 'min-w-[140px]',
  },
  {
    key: 'paymentMethod',
    label: 'Cara Bayar',
    category: 'order',
    defaultVisible: true,
    sortable: false,
    renderType: 'badge-payment-method',
    width: 'min-w-[80px]',
  },
  {
    key: 'tags',
    label: 'Tags',
    category: 'order',
    defaultVisible: false,
    sortable: false,
    renderType: 'tags',
    width: 'min-w-[140px]',
  },
  {
    key: 'notesAdmin',
    label: 'Catatan Admin',
    category: 'order',
    defaultVisible: false,
    sortable: false,
    renderType: 'notes-admin',
    width: 'min-w-[180px]',
  },
  {
    key: 'notes',
    label: 'Catatan Customer',
    category: 'order',
    defaultVisible: false,
    sortable: false,
    renderType: 'text',
    width: 'min-w-[160px]',
  },

  // ── CUSTOMER ──
  {
    key: 'customerName',
    label: 'Customer',
    category: 'customer',
    defaultVisible: true,
    sortable: false,
    renderType: 'text',
    width: 'min-w-[140px]',
  },
  {
    key: 'customerPhone',
    label: 'No. HP',
    category: 'customer',
    defaultVisible: false,
    sortable: false,
    renderType: 'phone',
    width: 'min-w-[120px]',
  },
  {
    key: 'customerEmail',
    label: 'Email',
    category: 'customer',
    defaultVisible: false,
    sortable: false,
    renderType: 'text',
    width: 'min-w-[160px]',
  },
  {
    key: 'shippingCityName',
    label: 'Kota',
    category: 'customer',
    defaultVisible: false,
    sortable: false,
    renderType: 'text',
    width: 'min-w-[120px]',
  },
  {
    key: 'shippingProvinceName',
    label: 'Provinsi',
    category: 'customer',
    defaultVisible: false,
    sortable: false,
    renderType: 'text',
    width: 'min-w-[120px]',
  },
  {
    key: 'shippingAddress',
    label: 'Alamat Lengkap',
    category: 'customer',
    defaultVisible: false,
    sortable: false,
    renderType: 'address',
    width: 'min-w-[200px]',
  },

  // ── PAYMENT ──
  {
    key: 'totalRp',
    label: 'Total',
    category: 'payment',
    defaultVisible: true,
    sortable: true,
    renderType: 'currency',
    width: 'min-w-[110px]',
    align: 'right',
  },
  {
    key: 'subtotalRp',
    label: 'Subtotal',
    category: 'payment',
    defaultVisible: false,
    sortable: false,
    renderType: 'currency',
    width: 'min-w-[110px]',
    align: 'right',
  },
  {
    key: 'flashSaleDiscountRp',
    label: 'Diskon Flash Sale',
    category: 'payment',
    defaultVisible: false,
    sortable: false,
    renderType: 'flash-sale-discount',
    width: 'min-w-[120px]',
    align: 'right',
  },
  {
    key: 'shippingCostRp',
    label: 'Ongkir',
    category: 'payment',
    defaultVisible: false,
    sortable: false,
    renderType: 'currency',
    width: 'min-w-[100px]',
    align: 'right',
  },
  {
    key: 'shippingSubsidyRp',
    label: 'Subsidi Ongkir',
    category: 'payment',
    defaultVisible: false,
    sortable: false,
    renderType: 'currency',
    width: 'min-w-[110px]',
    align: 'right',
  },
  {
    key: 'paymentStatus',
    label: 'Status Bayar',
    category: 'payment',
    defaultVisible: true,
    sortable: false,
    renderType: 'badge-payment-status',
    width: 'min-w-[120px]',
  },
  {
    key: 'paidAt',
    label: 'Dibayar Pada',
    category: 'payment',
    defaultVisible: false,
    sortable: true,
    renderType: 'datetime',
    width: 'min-w-[140px]',
  },
  {
    key: 'autoConfirmedBy',
    label: 'Konfirmasi Oleh',
    category: 'payment',
    defaultVisible: false,
    sortable: false,
    renderType: 'auto-confirm',
    width: 'min-w-[140px]',
  },

  // ── SHIPPING ──
  {
    key: 'deliveryStatus',
    label: 'Status Kirim',
    category: 'shipping',
    defaultVisible: true,
    sortable: false,
    renderType: 'badge-delivery-status',
    width: 'min-w-[120px]',
  },
  {
    key: 'shippingCourier',
    label: 'Kurir',
    category: 'shipping',
    defaultVisible: false,
    sortable: false,
    renderType: 'text',
    width: 'min-w-[80px]',
  },
  {
    key: 'shippingService',
    label: 'Service',
    category: 'shipping',
    defaultVisible: false,
    sortable: false,
    renderType: 'text',
    width: 'min-w-[80px]',
  },
  {
    key: 'trackingNumber',
    label: 'Resi',
    category: 'shipping',
    defaultVisible: true,
    sortable: false,
    renderType: 'tracking-number',
    width: 'min-w-[150px]',
  },
  {
    key: 'shippedAt',
    label: 'Dikirim Pada',
    category: 'shipping',
    defaultVisible: false,
    sortable: true,
    renderType: 'datetime',
    width: 'min-w-[140px]',
  },
  {
    key: 'deliveredAt',
    label: 'Selesai Pada',
    category: 'shipping',
    defaultVisible: false,
    sortable: true,
    renderType: 'datetime',
    width: 'min-w-[140px]',
  },

  // ── TRACKING (UTM + Click IDs + Pixel) ──
  {
    key: 'utmSource',
    label: 'UTM Source',
    category: 'tracking',
    defaultVisible: false,
    sortable: false,
    renderType: 'utm',
    width: 'min-w-[120px]',
  },
  {
    key: 'utmMedium',
    label: 'UTM Medium',
    category: 'tracking',
    defaultVisible: false,
    sortable: false,
    renderType: 'utm',
    width: 'min-w-[120px]',
  },
  {
    key: 'utmCampaign',
    label: 'UTM Campaign',
    category: 'tracking',
    defaultVisible: false,
    sortable: false,
    renderType: 'utm',
    width: 'min-w-[140px]',
  },
  {
    key: 'pixelStatus',
    label: 'Pixel Status',
    category: 'tracking',
    defaultVisible: false,
    sortable: false,
    renderType: 'pixel-status',
    width: 'min-w-[110px]',
  },
]

export const ORDER_COLUMN_CATEGORIES: Record<OrderColumnCategory, string> = {
  order: 'Order',
  customer: 'Customer',
  payment: 'Pembayaran',
  shipping: 'Pengiriman',
  tracking: 'Tracking & Pixel',
  others: 'Lainnya',
}

export const DEFAULT_VISIBLE_COLUMNS: string[] = ORDER_COLUMNS.filter(
  (c) => c.defaultVisible,
).map((c) => c.key)

export function getColumnByKey(key: string): OrderColumn | undefined {
  return ORDER_COLUMNS.find((c) => c.key === key)
}

// Resolve list kolom yang aktif. Empty/invalid prefs → fall back ke default.
// Strip key yang sudah tidak ada di ORDER_COLUMNS (lib evolve, pref obsolete).
export function resolveVisibleColumns(saved: string[] | null | undefined): string[] {
  const validKeys = new Set(ORDER_COLUMNS.map((c) => c.key))
  if (!saved || saved.length === 0) return DEFAULT_VISIBLE_COLUMNS
  const filtered = saved.filter((k) => validKeys.has(k))
  if (filtered.length === 0) return DEFAULT_VISIBLE_COLUMNS
  return filtered
}
