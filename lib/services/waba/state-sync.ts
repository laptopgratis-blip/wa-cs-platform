// Webhook `smb_app_state_sync` (coexistence): daftar kontak dari WA Business
// App di HP. `add` → import kontak (tanpa pesan); `remove` → DIABAIKAN —
// kontak di hulao adalah data CRM user, penghapusan di HP tidak boleh
// menghapus riwayat CRM. Webhook ini juga bisa datang belakangan (edit kontak
// di HP) — jalur sama.

import { prisma } from '@/lib/prisma'

import { importContacts } from './coex-contacts'
import type { WabaChangeValue } from './types'

export async function handleStateSync(value: WabaChangeValue): Promise<void> {
  const phoneNumberId = value.metadata?.phone_number_id
  if (!phoneNumberId) return

  const session = await prisma.whatsappSession.findUnique({
    where: { phoneNumberId },
    select: { id: true, userId: true, provider: true, isActive: true },
  })
  if (!session || session.provider !== 'CLOUD_API' || !session.isActive) return

  const items = value.state_sync ?? []
  const adds = items
    .filter((it) => it.type === 'contact' && it.action === 'add' && it.contact?.phone_number)
    .map((it) => ({
      phone: (it.contact?.phone_number ?? '').replace(/\D/g, ''),
      name: it.contact?.full_name || it.contact?.first_name || null,
    }))
  const removes = items.filter((it) => it.type === 'contact' && it.action === 'remove').length

  let created = 0
  if (adds.length > 0) {
    const r = await importContacts({ userId: session.userId, sessionId: session.id, contacts: adds })
    created = r.created
  }

  await prisma.whatsappSession.update({
    where: { id: session.id },
    data: {
      coexContactSyncStatus: 'DONE',
      coexContactsImported: { increment: created },
    },
  })
  console.log(
    `[waba/state-sync] ${session.id} kontak: add=${adds.length} baru=${created} remove(diabaikan)=${removes}`,
  )
}
