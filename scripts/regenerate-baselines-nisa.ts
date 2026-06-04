// Regenerate 3 baseline varian Nisa pake prompt motion script baru
// (Welcome Wave / Explaining Point / Energetic Closing — sekarang truly different).
//
// Yang lama disetel status=ARCHIVED biar gak muncul di picker tapi tetep
// kebaca history. Yang baru fresh generate via Kling.

import { prisma } from '../lib/prisma'
import { generateBaselineVideos } from '../lib/services/host-gen/queue'

async function main() {
  const host = await prisma.hostTemplate.findFirst({
    where: { name: { contains: 'Nisa', mode: 'insensitive' } },
    select: { id: true, name: true, userId: true, sourceImageUrl: true, promptVideo: true },
  })
  if (!host) throw new Error('Host Nisa gak ketemu')
  if (!host.sourceImageUrl) throw new Error('Source image Nisa belum ada')
  console.log(`[regen] target: ${host.name} (${host.id})`)

  // Soft-disable baseline lama (isEnabled=false) — endpoint /baselines
  // hanya pilih yg isEnabled=true. Record tetep ada untuk history.
  const archived = await prisma.hostScene.updateMany({
    where: {
      hostTemplateId: host.id,
      name: { contains: 'Baseline' },
    },
    data: { isEnabled: false },
  })
  console.log(`[regen] disable ${archived.count} baseline lama (soft)`)

  // Generate 3 varian baru — pakai motion script standalone yang udah
  // differentiated (no shared "wave at start").
  const result = await generateBaselineVideos({
    hostTemplateId: host.id,
    userId: host.userId,
    variantKeys: ['A', 'B', 'C'],
  })
  console.log(`[regen] ${result.submitted} baseline baru submitted — tunggu ~2-3 menit per varian`)
  console.log(`[regen] cek progress di /admin/host-templates/${host.id}/clip-library`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
