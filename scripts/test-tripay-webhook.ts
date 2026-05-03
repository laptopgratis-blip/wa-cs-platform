// Test helper untuk Tripay webhook (TOKEN_PURCHASE).
// Pakai: npx tsx --env-file=.env.local scripts/test-tripay-webhook.ts <orderId>
//
// Script:
// 1. Cek Payment di DB → ambil userId, orderId, tokenAmount, status
// 2. Generate payload Tripay valid + signature HMAC-SHA256(privateKey, raw_body)
// 3. Hit POST /api/payment/tripay-webhook
// 4. Report balance & TokenTransaction sebelum vs sesudah
//
// Cara cepat bikin Payment dummy untuk test:
//   const payment = await prisma.payment.create({
//     data: { userId, orderId: 'TEST-ORDER-1', amount: 35000, tokenAmount: 10000,
//             status: 'PENDING', purpose: 'TOKEN_PURCHASE' }
//   })

import crypto from 'node:crypto'

import { prisma } from '../lib/prisma'

const WEBHOOK_URL =
  process.env.TEST_WEBHOOK_URL ?? 'http://localhost:3000/api/payment/tripay-webhook'

async function main() {
  const orderId = process.argv[2]
  if (!orderId) {
    console.error('Usage: tsx scripts/test-tripay-webhook.ts <orderId>')
    console.error('Contoh: tsx scripts/test-tripay-webhook.ts WA-ABC-123')
    process.exit(1)
  }

  const privateKey = process.env.TRIPAY_PRIVATE_KEY
  if (!privateKey) {
    console.error('❌ TRIPAY_PRIVATE_KEY belum di-set di .env.local')
    process.exit(1)
  }

  // 1. Lookup payment
  const payment = await prisma.payment.findUnique({
    where: { orderId },
    select: {
      id: true,
      userId: true,
      orderId: true,
      tokenAmount: true,
      amount: true,
      status: true,
      purpose: true,
      reference: true,
    },
  })
  if (!payment) {
    console.error(`❌ Payment dengan orderId="${orderId}" tidak ditemukan`)
    process.exit(1)
  }
  console.log('📋 Payment ditemukan:')
  console.log(JSON.stringify(payment, null, 2))

  // 2. Snapshot balance sebelum
  const balanceBefore = await prisma.tokenBalance.findUnique({
    where: { userId: payment.userId },
    select: { balance: true, totalPurchased: true },
  })
  console.log('\n💰 Balance sebelum:', balanceBefore)

  const txCountBefore = await prisma.tokenTransaction.count({
    where: { userId: payment.userId, type: 'PURCHASE' },
  })
  console.log('🧾 PURCHASE tx count sebelum:', txCountBefore)

  // 3. Bangun payload Tripay (status=PAID).
  // Format mengikuti spec Tripay callback (subset yang dipakai webhook).
  const payload = {
    reference: payment.reference ?? `T${Date.now()}`,
    merchant_ref: payment.orderId,
    payment_method: 'QRIS',
    payment_method_code: 'QRIS',
    total_amount: payment.amount,
    fee_merchant: 0,
    fee_customer: 0,
    total_fee: 0,
    amount_received: payment.amount,
    is_closed_payment: 1,
    status: 'PAID',
    paid_at: Math.floor(Date.now() / 1000),
    note: null,
  }
  const rawBody = JSON.stringify(payload)

  // 4. Generate signature HMAC-SHA256(privateKey, rawBody).
  const signature = crypto
    .createHmac('sha256', privateKey)
    .update(rawBody)
    .digest('hex')

  console.log('\n📡 POST', WEBHOOK_URL)
  console.log('📦 Payload:', rawBody)
  console.log('🔑 Signature:', signature)

  // 5. Hit webhook.
  const res = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Callback-Signature': signature,
      'X-Callback-Event': 'payment_status',
    },
    body: rawBody,
  })
  const respText = await res.text()
  let respJson: unknown
  try {
    respJson = JSON.parse(respText)
  } catch {
    respJson = respText
  }
  console.log(`\n📨 Status: ${res.status}`)
  console.log('Response:', respJson)

  if (!res.ok) {
    console.error('❌ Webhook gagal')
    process.exit(1)
  }

  // 6. Snapshot balance sesudah.
  await new Promise((r) => setTimeout(r, 300)) // beri waktu commit
  const balanceAfter = await prisma.tokenBalance.findUnique({
    where: { userId: payment.userId },
    select: { balance: true, totalPurchased: true },
  })
  const txCountAfter = await prisma.tokenTransaction.count({
    where: { userId: payment.userId, type: 'PURCHASE' },
  })
  const lastTx = await prisma.tokenTransaction.findFirst({
    where: { userId: payment.userId, type: 'PURCHASE' },
    orderBy: { createdAt: 'desc' },
  })
  const updatedPayment = await prisma.payment.findUnique({
    where: { orderId },
    select: { status: true, paidAt: true },
  })

  console.log('\n💰 Balance sesudah:', balanceAfter)
  console.log(`🧾 PURCHASE tx count sesudah: ${txCountAfter} (selisih +${txCountAfter - txCountBefore})`)
  console.log('📋 Payment status:', updatedPayment)
  if (lastTx) {
    console.log('🆕 Tx terbaru:', {
      amount: lastTx.amount,
      desc: lastTx.description,
      ref: lastTx.reference,
      createdAt: lastTx.createdAt,
    })
  }

  const balanceDiff =
    (balanceAfter?.balance ?? 0) - (balanceBefore?.balance ?? 0)
  console.log(
    `\n${balanceDiff === payment.tokenAmount ? '✅' : '⚠️ '} Balance bertambah ${balanceDiff} token (expected: ${payment.tokenAmount})`,
  )
}

main()
  .catch((err) => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
