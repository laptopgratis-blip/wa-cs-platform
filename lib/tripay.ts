// Wrapper Tripay payment gateway. Sandbox: https://tripay.co.id/api-sandbox/
// Production: https://tripay.co.id/api/
//
// Auth: bearer API key di header.
// Signature create transaksi: HMAC-SHA256(privateKey, merchantCode + merchantRef + amount).
// Signature webhook: HMAC-SHA256(privateKey, raw_body) — dikirim di header X-Callback-Signature.
import crypto from 'node:crypto'

import axios, { AxiosError } from 'axios'

const API_KEY = process.env.TRIPAY_API_KEY ?? ''
const PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY ?? ''
const MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE ?? ''
const IS_PRODUCTION = process.env.TRIPAY_IS_PRODUCTION === 'true'
const DEFAULT_METHOD = process.env.TRIPAY_DEFAULT_METHOD ?? 'QRIS'

const BASE_URL = IS_PRODUCTION
  ? 'https://tripay.co.id/api'
  : 'https://tripay.co.id/api-sandbox'

function assertConfig() {
  if (!API_KEY || !PRIVATE_KEY || !MERCHANT_CODE) {
    throw new Error(
      'Konfigurasi Tripay belum lengkap. Set TRIPAY_API_KEY, TRIPAY_PRIVATE_KEY, TRIPAY_MERCHANT_CODE di .env.local',
    )
  }
}

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { Authorization: `Bearer ${API_KEY}` },
})

export interface CreateTransactionInput {
  orderId: string // dipakai sebagai merchant_ref
  amount: number // rupiah
  tokenAmount?: number // legacy: untuk pembelian token, jadi label item
  // Override item name di order_items — wajib kalau ini bukan pembelian token
  // (mis. subscription LP). Kalau tidak diisi & tokenAmount ada, fallback ke
  // "Paket Token (X token)".
  itemName?: string
  itemSku?: string
  customerName: string
  customerEmail: string
  // Optional: override method default. Lihat https://tripay.co.id/developer untuk daftar.
  method?: string
  // Optional: callback / return URL — kalau tidak diisi, pakai default merchant.
  callbackUrl?: string
  returnUrl?: string
  // Detik sampai expired. Default 24 jam.
  expiresInSeconds?: number
}

export interface CreateTransactionResult {
  reference: string
  paymentUrl: string // checkout_url Tripay
  expiredAt: Date
  paymentMethod: string
  paymentName: string // nama channel human-readable, mis. "BRI Virtual Account"
  payCode: string | null // VA number / kode bayar (DIRECT channels)
}

interface TripayApiResponse<T> {
  success: boolean
  message?: string
  data?: T
}

interface TripayCreateTxData {
  reference: string
  merchant_ref: string
  payment_method: string
  payment_name: string
  customer_name: string
  customer_email: string
  amount: number
  fee_merchant: number
  fee_customer: number
  total_fee: number
  amount_received: number
  pay_code?: string | null
  pay_url?: string | null
  checkout_url: string
  status: string
  expired_time: number // unix seconds
}

interface TripayDetailData {
  reference: string
  merchant_ref: string
  payment_method: string
  payment_name: string
  customer_name: string
  customer_email: string
  amount: number
  status: 'UNPAID' | 'PAID' | 'EXPIRED' | 'FAILED' | 'REFUND'
  paid_at: number | null
  expired_time: number
  checkout_url: string
}

function makeCreateSignature(merchantRef: string, amount: number): string {
  return crypto
    .createHmac('sha256', PRIVATE_KEY)
    .update(MERCHANT_CODE + merchantRef + String(amount))
    .digest('hex')
}

function unwrapAxiosError(err: unknown, scope: string): never {
  if (err instanceof AxiosError) {
    const data = err.response?.data as { message?: string } | undefined
    const msg = data?.message ?? err.message
    throw new Error(`Tripay ${scope} gagal: ${msg}`)
  }
  throw err
}

// Buat transaksi closed payment Tripay. Return reference + checkout URL.
export async function createTransaction(
  input: CreateTransactionInput,
): Promise<CreateTransactionResult> {
  assertConfig()

  const method = input.method ?? DEFAULT_METHOD
  const signature = makeCreateSignature(input.orderId, input.amount)
  const expiredTime = Math.floor(
    (Date.now() + (input.expiresInSeconds ?? 24 * 60 * 60) * 1000) / 1000,
  )

  const payload = {
    method,
    merchant_ref: input.orderId,
    amount: input.amount,
    customer_name: input.customerName || 'Customer',
    customer_email: input.customerEmail,
    order_items: [
      {
        sku: input.itemSku ?? 'TOKEN-PACKAGE',
        name: (
          input.itemName ??
          `Paket Token (${input.tokenAmount ?? 0} token)`
        ).slice(0, 100),
        price: input.amount,
        quantity: 1,
      },
    ],
    expired_time: expiredTime,
    signature,
    ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
    ...(input.returnUrl ? { return_url: input.returnUrl } : {}),
  }

  try {
    const res = await http.post<TripayApiResponse<TripayCreateTxData>>(
      '/transaction/create',
      payload,
    )
    const body = res.data
    if (!body.success || !body.data) {
      throw new Error(body.message ?? 'Tripay menolak transaksi')
    }
    return {
      reference: body.data.reference,
      paymentUrl: body.data.checkout_url,
      expiredAt: new Date(body.data.expired_time * 1000),
      paymentMethod: body.data.payment_method,
      paymentName: body.data.payment_name,
      payCode: body.data.pay_code ?? null,
    }
  } catch (err) {
    unwrapAxiosError(err, 'createTransaction')
  }
}

// Ambil detail transaksi by reference (dipakai untuk polling/cek manual).
export async function getTransactionDetail(
  reference: string,
): Promise<TripayDetailData> {
  assertConfig()
  try {
    const res = await http.get<TripayApiResponse<TripayDetailData>>(
      '/transaction/detail',
      { params: { reference } },
    )
    const body = res.data
    if (!body.success || !body.data) {
      throw new Error(body.message ?? 'Transaksi tidak ditemukan')
    }
    return body.data
  } catch (err) {
    unwrapAxiosError(err, 'getTransactionDetail')
  }
}

// Verifikasi signature webhook Tripay. `rawBody` HARUS body mentah (string),
// bukan hasil JSON.parse — minor whitespace difference akan bikin mismatch.
export function verifySignature(rawBody: string, signature: string): boolean {
  if (!PRIVATE_KEY) return false
  const expected = crypto
    .createHmac('sha256', PRIVATE_KEY)
    .update(rawBody)
    .digest('hex')
  // Constant-time compare supaya tidak vulnerable timing attack.
  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(signature, 'utf8')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// ─────────────────────────────────────────────────────────────
// PAYMENT CHANNELS — daftar channel aktif di merchant
// ─────────────────────────────────────────────────────────────

export interface TripayPaymentChannel {
  group: string // "Virtual Account", "E-Wallet", "Convenience Store"
  code: string // "BRIVA", "QRIS", "ALFAMART"
  name: string // "BRI Virtual Account"
  type: 'direct' | 'redirect'
  fee_merchant: { flat: number; percent: number }
  fee_customer: { flat: number; percent: number }
  total_fee: { flat: number; percent: string }
  minimum_fee: number
  maximum_fee: number
  minimum_amount: number
  maximum_amount: number
  icon_url: string
  active: boolean
}

// Channel yang menggunakan REDIRECT flow — user dikirim ke checkout_url Tripay.
// Sisanya pakai DIRECT flow — pay_code ditampilkan in-app.
export const REDIRECT_CHANNELS = new Set(['QRIS', 'QRISC', 'QRIS2', 'SHOPEEPAY', 'OVO', 'DANA'])

export function isRedirectChannel(code: string): boolean {
  return REDIRECT_CHANNELS.has(code)
}

// Ambil daftar channel pembayaran aktif dari Tripay.
export async function getPaymentChannels(): Promise<TripayPaymentChannel[]> {
  assertConfig()
  try {
    const res = await http.get<TripayApiResponse<TripayPaymentChannel[]>>(
      '/merchant/payment-channel',
    )
    const body = res.data
    if (!body.success || !body.data) {
      throw new Error(body.message ?? 'Gagal mengambil daftar channel')
    }
    return body.data.filter((ch) => ch.active)
  } catch (err) {
    unwrapAxiosError(err, 'getPaymentChannels')
  }
}

// ─────────────────────────────────────────────────────────────
// FEE CALCULATOR — hitung biaya per channel untuk nominal tertentu
// ─────────────────────────────────────────────────────────────

export interface TripayFeeResult {
  code: string
  name: string
  fee: {
    flat: number
    percent: string
    min: number | null
    max: number | null
  }
  total_fee: {
    merchant: number
    customer: number
  }
}

// Hitung biaya transaksi untuk channel + nominal tertentu.
export async function getFeeCalculation(
  code: string,
  amount: number,
): Promise<TripayFeeResult[]> {
  assertConfig()
  try {
    const res = await http.get<TripayApiResponse<TripayFeeResult[]>>(
      '/merchant/fee-calculator',
      { params: { code, amount } },
    )
    const body = res.data
    if (!body.success || !body.data) {
      throw new Error(body.message ?? 'Gagal menghitung biaya')
    }
    return body.data
  } catch (err) {
    unwrapAxiosError(err, 'getFeeCalculation')
  }
}

// ─────────────────────────────────────────────────────────────
// PAYMENT INSTRUCTION — instruksi bayar per channel
// ─────────────────────────────────────────────────────────────

export interface TripayPaymentInstructionStep {
  title: string
  steps: string[]
}

// Ambil instruksi pembayaran untuk channel tertentu. Instruksi mengandung
// placeholder {{pay_code}} yang bisa di-replace di frontend.
export async function getPaymentInstruction(
  code: string,
): Promise<TripayPaymentInstructionStep[]> {
  assertConfig()
  try {
    const res = await http.get<TripayApiResponse<TripayPaymentInstructionStep[]>>(
      '/payment/instruction',
      { params: { code } },
    )
    const body = res.data
    if (!body.success || !body.data) {
      throw new Error(body.message ?? 'Gagal mengambil instruksi pembayaran')
    }
    return body.data
  } catch (err) {
    unwrapAxiosError(err, 'getPaymentInstruction')
  }
}
