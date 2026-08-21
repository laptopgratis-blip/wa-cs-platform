// GET /api/v1/ping — uji kredensial. Endpoint pertama yang dipanggil orang
// saat menyalin kunci baru, jadi responsnya sengaja menyebut nama kunci supaya
// jelas kunci mana yang sedang dipakai.
import { API_VERSION, apiV1Ok, requirePublicApiAuth } from '@/lib/public-api-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await requirePublicApiAuth(req)
  if (!gate.ok) return gate.response

  return apiV1Ok(
    {
      pong: true,
      keyName: gate.auth.keyName,
      scopes: gate.auth.scopes,
      serverTime: new Date().toISOString(),
      apiVersion: API_VERSION,
    },
    gate.auth,
  )
}
