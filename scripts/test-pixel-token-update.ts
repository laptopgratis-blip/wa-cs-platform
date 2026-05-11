// Reproduce logic PATCH /api/integrations/pixels/[id] untuk debug
// "input token CAPI tidak tersimpan". Cek schema → encrypt → DB update path.
import { encrypt } from '../lib/crypto'
import { prisma } from '../lib/prisma'
import { pixelIntegrationUpdateSchema } from '../lib/validations/pixel-integration'

const USER_EMAIL = 'akmng22@gmail.com'

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: USER_EMAIL },
    select: { id: true },
  })
  if (!user) throw new Error('user not found')

  const before = await prisma.pixelIntegration.findFirst({
    where: { userId: user.id, platform: 'META' },
  })
  if (!before) throw new Error('pixel not found')
  console.log(`BEFORE token prefix: ${(before.accessToken ?? '').slice(0, 30)}`)

  // Simulasi payload yang persis dikirim FE saat user edit + isi token baru.
  const rawJson: Record<string, unknown> = {
    platform: 'META',
    displayName: before.displayName,
    pixelId: before.pixelId,
    serverSideEnabled: true,
    accessToken: 'EAA_TEST_TOKEN_FROM_SCRIPT_2026_05_11_VERIFY_DEBUG',
    conversionLabelInitiateCheckout: null,
    conversionLabelLead: null,
    conversionLabelPurchase: null,
    testEventCode: before.testEventCode,
    isTestMode: before.isTestMode,
    triggerOnBuyerProofUpload: before.triggerOnBuyerProofUpload,
    triggerOnAdminProofUpload: before.triggerOnAdminProofUpload,
    triggerOnAdminMarkPaid: before.triggerOnAdminMarkPaid,
    isActive: before.isActive,
  }

  const tokenWasInBody = 'accessToken' in rawJson
  console.log(`tokenWasInBody=${tokenWasInBody}`)

  const parsed = pixelIntegrationUpdateSchema.safeParse(rawJson)
  console.log(`parse success=${parsed.success}`)
  if (!parsed.success) {
    console.log('errors:', JSON.stringify(parsed.error.issues, null, 2))
    return
  }
  const data = parsed.data
  console.log(`data.accessToken length=${data.accessToken?.length ?? 'null'}`)

  let tokenUpdate: Record<string, string | null> = {}
  if (tokenWasInBody) {
    if (data.accessToken == null) {
      tokenUpdate = { accessToken: null }
    } else if (data.accessToken.trim().length > 0) {
      tokenUpdate = { accessToken: encrypt(data.accessToken) }
    }
  }
  console.log(`tokenUpdate prefix=${(tokenUpdate.accessToken ?? '').slice(0, 30) || '(empty)'}`)

  const updated = await prisma.pixelIntegration.update({
    where: { id: before.id },
    data: {
      ...(data.platform !== undefined && { platform: data.platform }),
      ...(data.displayName !== undefined && { displayName: data.displayName }),
      ...(data.pixelId !== undefined && { pixelId: data.pixelId.trim() }),
      ...(data.serverSideEnabled !== undefined && {
        serverSideEnabled: data.serverSideEnabled,
      }),
      ...tokenUpdate,
      ...(data.isTestMode !== undefined && { isTestMode: data.isTestMode }),
      ...(data.triggerOnBuyerProofUpload !== undefined && {
        triggerOnBuyerProofUpload: data.triggerOnBuyerProofUpload,
      }),
      ...(data.triggerOnAdminProofUpload !== undefined && {
        triggerOnAdminProofUpload: data.triggerOnAdminProofUpload,
      }),
      ...(data.triggerOnAdminMarkPaid !== undefined && {
        triggerOnAdminMarkPaid: data.triggerOnAdminMarkPaid,
      }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })
  console.log(`AFTER token prefix: ${(updated.accessToken ?? '').slice(0, 30)}`)

  const changed = updated.accessToken !== before.accessToken
  console.log(`\nResult: token ${changed ? 'CHANGED ✓' : 'UNCHANGED ✗'}`)

  // Restore original token supaya tidak break.
  if (before.accessToken) {
    await prisma.pixelIntegration.update({
      where: { id: before.id },
      data: { accessToken: before.accessToken },
    })
    console.log('✓ Restored original token')
  }
}

main()
  .catch((err) => {
    console.error('FATAL:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
