import { prisma } from '../lib/prisma'
async function main() {
  const scenes = await prisma.hostScene.findMany({
    where: { name: { contains: 'Baseline' } },
    select: { name: true, promptVideo: true, hostTemplateId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })
  const hostIds = [...new Set(scenes.map(s => s.hostTemplateId))]
  const hosts = await prisma.hostTemplate.findMany({
    where: { id: { in: hostIds } },
    select: { id: true, name: true, promptVideo: true },
  })
  console.log('=== HOST promptVideo (base) ===')
  for (const h of hosts) {
    console.log(`\n[${h.name}]`)
    console.log(h.promptVideo)
  }
  console.log('\n\n=== SCENE promptVideo (variants) ===')
  for (const s of scenes) {
    console.log(`\n--- ${s.name} (${s.createdAt.toISOString().slice(0,10)}) ---`)
    console.log(s.promptVideo?.slice(0, 1500))
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
