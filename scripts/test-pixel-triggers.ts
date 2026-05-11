// One-shot verifikasi fitur trigger Purchase granular:
//   - filter PixelIntegration.triggerOn* benar
//   - dedup via PixelEventLog tetap jalan untuk multi-trigger
//   - Meta Test Event API beneran terpanggil & balas OK
//
// Pakai: docker compose run --rm --user root -e HOME=/tmp nextjs npx tsx scripts/test-pixel-triggers.ts
// CATATAN: butuh access ke source code (volume mount) supaya tsx bisa jalan.
//
// Aman: pixel target user akmng22 isTestMode=true, semua event ke Test Events Tool.
import {
  firePixelEventForOrder,
  type PurchaseTrigger,
} from '../lib/services/pixel-fire'
import { prisma } from '../lib/prisma'

const USER_EMAIL = 'akmng22@gmail.com'

async function main() {
  console.log(`\n=== Test Pixel Triggers ===\n`)

  // 1. Locate user + pixel + order test target
  const user = await prisma.user.findUnique({
    where: { email: USER_EMAIL },
    select: { id: true, email: true },
  })
  if (!user) throw new Error(`User ${USER_EMAIL} tidak ditemukan`)
  console.log(`User: ${user.email} (${user.id})`)

  const pixel = await prisma.pixelIntegration.findFirst({
    where: { userId: user.id, platform: 'META', isActive: true },
  })
  if (!pixel) throw new Error(`Pixel Meta aktif tidak ditemukan`)
  console.log(
    `Pixel: ${pixel.displayName} (${pixel.id}) · token=${pixel.accessToken ? 'set' : 'missing'} · testMode=${pixel.isTestMode}`,
  )

  // Pilih order TRANSFER + orderFormId + sudah PAID supaya kita yakin punya
  // invoiceNumber & enabledPixel. Test pakai logic dedup di-clear dulu.
  const order = await prisma.userOrder.findFirst({
    where: {
      userId: user.id,
      paymentMethod: 'TRANSFER',
      orderFormId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!order) throw new Error('Tidak ada order TRANSFER untuk dipakai')
  console.log(
    `Order target: ${order.invoiceNumber} (${order.id}) · status=${order.paymentStatus}`,
  )

  // 2. Snapshot state — supaya bisa restore di akhir.
  const snapshot = {
    pixelTriggers: {
      buyer: pixel.triggerOnBuyerProofUpload,
      adminProof: pixel.triggerOnAdminProofUpload,
      paid: pixel.triggerOnAdminMarkPaid,
    },
  }
  console.log(`Pixel triggers awal:`, snapshot.pixelTriggers)

  // 3. Set semua 3 trigger = true supaya kita uji penuh.
  await prisma.pixelIntegration.update({
    where: { id: pixel.id },
    data: {
      triggerOnBuyerProofUpload: true,
      triggerOnAdminProofUpload: true,
      triggerOnAdminMarkPaid: true,
    },
  })
  console.log(`✓ Set semua trigger=true sementara untuk test`)

  // 4. Clear log + stamp Purchase untuk order ini supaya dedup tidak skip.
  const deletedLogs = await prisma.pixelEventLog.deleteMany({
    where: {
      orderId: order.id,
      eventName: 'Purchase',
    },
  })
  await prisma.userOrder.update({
    where: { id: order.id },
    data: { pixelPurchaseFiredAt: null },
  })
  console.log(`✓ Clear ${deletedLogs.count} log Purchase lama + reset stamp`)

  // 5. Run scenario: 3 trigger berturut-turut, expect fire pertama sukses, sisanya dedup-skip.
  const triggers: PurchaseTrigger[] = [
    'BUYER_PROOF_UPLOAD',
    'ADMIN_PROOF_UPLOAD',
    'ADMIN_MARK_PAID',
  ]
  const results: Array<{
    trigger: PurchaseTrigger
    fired: number
    succeeded: number
    skipped: number
  }> = []
  for (const t of triggers) {
    const r = await firePixelEventForOrder({
      orderId: order.id,
      eventName: 'Purchase',
      trigger: t,
    })
    results.push({ trigger: t, ...r })
    console.log(`  trigger=${t} → fired=${r.fired} succeeded=${r.succeeded} skipped=${r.skipped}`)
  }

  // Expectations:
  // - Trigger pertama (BUYER_PROOF_UPLOAD): fired>=1, succeeded ideally 1
  // - Trigger kedua & ketiga: dedup-skipped (skipped>=1)
  const pass1 = results[0].fired === 1
  const pass2 = results[1].fired === 0 && results[1].skipped === 1
  const pass3 = results[2].fired === 0 && results[2].skipped === 1
  console.log(`\nDedup test:`)
  console.log(`  ${pass1 ? '✓' : '✗'} 1st fire (BUYER) sebar 1 attempt`)
  console.log(`  ${pass2 ? '✓' : '✗'} 2nd fire (ADMIN_PROOF) skipped via dedup`)
  console.log(`  ${pass3 ? '✓' : '✗'} 3rd fire (ADMIN_MARK_PAID) skipped via dedup`)

  // 6. Test trigger filter: disable triggerOnBuyerProofUpload, clear log,
  //    call dengan trigger BUYER_PROOF → harus skip karena filter (fired=0).
  await prisma.pixelEventLog.deleteMany({
    where: { orderId: order.id, eventName: 'Purchase' },
  })
  await prisma.userOrder.update({
    where: { id: order.id },
    data: { pixelPurchaseFiredAt: null },
  })
  await prisma.pixelIntegration.update({
    where: { id: pixel.id },
    data: { triggerOnBuyerProofUpload: false }, // opt-out
  })
  const r4 = await firePixelEventForOrder({
    orderId: order.id,
    eventName: 'Purchase',
    trigger: 'BUYER_PROOF_UPLOAD',
  })
  const pass4 = r4.fired === 0
  console.log(
    `  ${pass4 ? '✓' : '✗'} Filter trigger: pixel opt-out BUYER → fired=${r4.fired} (expect 0)`,
  )

  // 7. Test legacy: call tanpa trigger param (eventName !== Purchase atau no trigger)
  //    Untuk Purchase TANPA trigger param → no filter, semua aktif pixel di-fire.
  await prisma.pixelEventLog.deleteMany({
    where: { orderId: order.id, eventName: 'Purchase' },
  })
  await prisma.userOrder.update({
    where: { id: order.id },
    data: { pixelPurchaseFiredAt: null },
  })
  const r5 = await firePixelEventForOrder({
    orderId: order.id,
    eventName: 'Purchase',
    // tidak kasih trigger — fallback no filter
  })
  const pass5 = r5.fired >= 1
  console.log(
    `  ${pass5 ? '✓' : '✗'} Legacy: tanpa trigger param → fired=${r5.fired} (expect >=1)`,
  )

  // 8. Cek hasil terakhir di log: ada minimal 1 record Purchase succeeded untuk order ini.
  const successLog = await prisma.pixelEventLog.findFirst({
    where: {
      orderId: order.id,
      eventName: 'Purchase',
      pixelId: pixel.id,
      succeeded: true,
    },
    orderBy: { createdAt: 'desc' },
  })
  const pass6 = !!successLog
  console.log(
    `  ${pass6 ? '✓' : '✗'} Meta API: ada PixelEventLog succeeded=true untuk order ini`,
  )
  if (successLog) {
    console.log(
      `    eventId=${successLog.eventId} responseStatus=${successLog.responseStatus}`,
    )
  }

  // 9. Restore snapshot triggers — supaya state pixel persis seperti sebelum test.
  await prisma.pixelIntegration.update({
    where: { id: pixel.id },
    data: {
      triggerOnBuyerProofUpload: snapshot.pixelTriggers.buyer,
      triggerOnAdminProofUpload: snapshot.pixelTriggers.adminProof,
      triggerOnAdminMarkPaid: snapshot.pixelTriggers.paid,
    },
  })
  console.log(`\n✓ Restore pixel triggers ke state awal`)

  const all = pass1 && pass2 && pass3 && pass4 && pass5 && pass6
  console.log(`\n=== ${all ? 'ALL PASS ✓' : 'SOME FAILED ✗'} ===\n`)
  if (!all) process.exit(1)
}

main()
  .catch((err) => {
    console.error('FATAL:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
