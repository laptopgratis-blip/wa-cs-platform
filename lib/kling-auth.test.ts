// Test lib/kling-auth.ts — jalankan: npx tsx lib/kling-auth.test.ts
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

import { klingAuthHeader, parseKlingKey } from './kling-auth'

function b64urlDecode(part: string): string {
  return Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

// ── parseKlingKey ──────────────────────────────────────────────

// 1. API key tunggal (format baru) — tanpa colon → dipakai verbatim.
{
  const parsed = parseKlingKey('  api-key-kling-AbC123xyz  ')
  assert.deepEqual(parsed, { kind: 'single', apiKey: 'api-key-kling-AbC123xyz' })
}

// 2. Format lama AccessKey:SecretKey → legacy pair.
{
  const parsed = parseKlingKey('AKIAxxx:sekret999')
  assert.deepEqual(parsed, { kind: 'legacy', accessKey: 'AKIAxxx', secretKey: 'sekret999' })
}

// 3. Legacy: hanya colon PERTAMA yang memisahkan (secret boleh mengandung colon).
{
  const parsed = parseKlingKey('ak:se:cret')
  assert.deepEqual(parsed, { kind: 'legacy', accessKey: 'ak', secretKey: 'se:cret' })
}

// 4. Kosong / colon dengan sisi kosong → error berpesan actionable.
for (const bad of ['', '   ', ':secret', 'access:', ':']) {
  assert.throws(() => parseKlingKey(bad), /platform\.klingai\.com/)
}

// ── klingAuthHeader ────────────────────────────────────────────

// 5. Key tunggal → Bearer verbatim, tanpa JWT.
{
  const header = klingAuthHeader('api-key-kling-AbC123xyz')
  assert.equal(header, 'Bearer api-key-kling-AbC123xyz')
}

// 6. Legacy pair → Bearer JWT HS256 valid: iss=AccessKey, signature cocok,
//    exp ≈ now+TTL, nbf ≈ now-5.
{
  const before = Math.floor(Date.now() / 1000)
  const header = klingAuthHeader('myAccess:mySecret', 600)
  assert.ok(header.startsWith('Bearer '))
  const jwt = header.slice('Bearer '.length)
  const [h, p, sig] = jwt.split('.')
  assert.ok(h && p && sig, 'JWT harus 3 bagian')

  const headerJson = JSON.parse(b64urlDecode(h)) as { alg: string; typ: string }
  assert.equal(headerJson.alg, 'HS256')
  assert.equal(headerJson.typ, 'JWT')

  const payload = JSON.parse(b64urlDecode(p)) as { iss: string; exp: number; nbf: number }
  assert.equal(payload.iss, 'myAccess')
  assert.ok(payload.exp >= before + 600 && payload.exp <= before + 602, 'exp = now+TTL')
  assert.ok(payload.nbf <= before - 4, 'nbf mundur ~5 detik')

  const expected = createHmac('sha256', 'mySecret')
    .update(`${h}.${p}`)
    .digest('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  assert.equal(sig, expected, 'signature HMAC harus cocok dengan SecretKey')
}

// 7. Header untuk key invalid → lempar error yang sama dengan parse.
assert.throws(() => klingAuthHeader('access:'), /platform\.klingai\.com/)

console.log('kling-auth.test.ts: semua assertion lolos')
