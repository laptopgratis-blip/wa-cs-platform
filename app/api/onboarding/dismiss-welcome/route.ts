// POST /api/onboarding/dismiss-welcome
//
// Dipanggil saat user klik "Jangan tampilkan lagi" di MainWelcomeWizard.
// Set User.welcomeWizardDismissedAt = now. Setelah ini wizard utama tidak
// akan muncul lagi pas login berikutnya.
import { jsonError, jsonOk, requireSession } from '@/lib/api'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    const session = await requireSession()

    await prisma.user.update({
      where: { id: session.user.id },
      data: { welcomeWizardDismissedAt: new Date() },
    })

    return jsonOk({ dismissed: true })
  } catch (e) {
    if (e instanceof Response) return e
    console.error('[onboarding/dismiss-welcome]', e)
    return jsonError('Gagal menyimpan preferensi', 500)
  }
}
