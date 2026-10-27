// Uji guard URL lampiran knowledge (anti SSRF). Jalankan: npm run test (wa-service).
// Gaya sama dengan test lain di repo: tsx + node:assert, tanpa framework.
import assert from 'node:assert/strict'

import { resolveKnowledgeAttachmentUrl } from './knowledge-attachment.js'

const OWNER = 'cmabc123owner'
const UPLOADS = 'http://hulao-uploads'
const OWN = `/uploads/knowledge/${OWNER}/0f1e2d3c4b5a69788796.jpg`

let passed = 0
function check(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ok  ${name}`)
}

console.log('knowledge-attachment: resolveKnowledgeAttachmentUrl')

check('file knowledge milik pemilik sesi → URL nginx uploads', () => {
  assert.equal(
    resolveKnowledgeAttachmentUrl(OWN, OWNER, UPLOADS),
    `${UPLOADS}${OWN}`,
  )
})

check('base dengan garis miring di ujung tidak menggandakan "/"', () => {
  assert.equal(
    resolveKnowledgeAttachmentUrl(OWN, OWNER, `${UPLOADS}/`),
    `${UPLOADS}${OWN}`,
  )
})

check('URL absolut http(s) apa pun → ditolak (dulu diteruskan ke Baileys)', () => {
  for (const url of [
    'http://hulao-postgres:5432/',
    'https://169.254.169.254/latest/meta-data/',
    'HTTPS://example.com/a.jpg',
    `http://hulao-uploads${OWN}`,
  ]) {
    assert.equal(resolveKnowledgeAttachmentUrl(url, OWNER, UPLOADS), null, url)
  }
})

check('protocol-relative & skema lain → ditolak', () => {
  for (const url of [
    `//evil.example${OWN}`,
    'file:///etc/passwd',
    'data:image/png;base64,AAAA',
  ]) {
    assert.equal(resolveKnowledgeAttachmentUrl(url, OWNER, UPLOADS), null, url)
  }
})

check('path di luar /uploads/knowledge/ → ditolak', () => {
  for (const url of [
    '/api/internal/knowledge/x',
    `/uploads/products/${OWNER}/a.jpg`,
    `uploads/knowledge/${OWNER}/a.jpg`,
  ]) {
    assert.equal(resolveKnowledgeAttachmentUrl(url, OWNER, UPLOADS), null, url)
  }
})

check('traversal / encoding / subfolder / query → ditolak', () => {
  for (const url of [
    `/uploads/knowledge/${OWNER}/../../../etc/passwd`,
    `/uploads/knowledge/${OWNER}/..%2f..%2fetc.txt`,
    `/uploads/knowledge/${OWNER}/sub/a.jpg`,
    `/uploads/knowledge/${OWNER}/a.jpg?x=1`,
    `/uploads/knowledge/${OWNER}\\a.jpg`,
    `${OWN}\nhttp://evil.example`,
  ]) {
    assert.equal(resolveKnowledgeAttachmentUrl(url, OWNER, UPLOADS), null, url)
  }
})

check('file di folder user lain → ditolak', () => {
  assert.equal(
    resolveKnowledgeAttachmentUrl(OWN, 'cmlainorang999', UPLOADS),
    null,
  )
})

check('fileUrl / ownerUserId kosong → ditolak', () => {
  assert.equal(resolveKnowledgeAttachmentUrl('', OWNER, UPLOADS), null)
  assert.equal(resolveKnowledgeAttachmentUrl(OWN, '', UPLOADS), null)
})

console.log(`\nknowledge-attachment: ${passed} pemeriksaan lolos`)
