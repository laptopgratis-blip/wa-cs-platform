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
  tokenAmount: number
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
        sku: 'TOKEN-PACKAGE',
        name: `Paket Token (${input.tokenAmount} token)`.slice(0, 100),
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
