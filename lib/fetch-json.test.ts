// Uji fetchJson. Jalankan lewat `npm test`.
import assert from 'node:assert/strict'

import { fetchJson } from './fetch-json'

let passed = 0
function check(name: string, fn: () => Promise<void>): Promise<void> {
  return fn().then(() => {
    passed += 1
    console.log(`  ok  ${name}`)
  })
}

const realFetch = globalThis.fetch
function stub(impl: () => Promise<Response> | never): void {
  globalThis.fetch = (async () => impl()) as typeof fetch
}
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function main(): Promise<void> {
  console.log('fetch-json: fetchJson')

  await check('sukses → ok + data', async () => {
    stub(() => Promise.resolve(jsonRes({ success: true, data: { a: 1 } })))
    const r = await fetchJson<{ success: boolean; data: { a: number } }>('/x')
    assert.equal(r.ok, true)
    assert.equal(r.error, null)
    assert.deepEqual(r.data?.data, { a: 1 })
  })

  await check('fetch ditolak (jaringan) → ok:false, status 0, pesan ramah', async () => {
    stub(() => {
      throw new TypeError('Failed to fetch')
    })
    const r = await fetchJson('/x')
    assert.equal(r.ok, false)
    assert.equal(r.status, 0)
    assert.match(r.error ?? '', /koneksi internet/i)
  })

  await check('respons HTML 502 → TIDAK throw, pesan server bermasalah', async () => {
    // Ini kasus yang dulu bikin diam total: res.json() melempar SyntaxError.
    stub(() =>
      Promise.resolve(new Response('<!DOCTYPE html><h1>Bad Gateway</h1>', { status: 502 })),
    )
    const r = await fetchJson('/x')
    assert.equal(r.ok, false)
    assert.equal(r.status, 502)
    assert.match(r.error ?? '', /Server sedang bermasalah/i)
  })

  await check('500 berbadan kosong → tetap ada pesan', async () => {
    stub(() => Promise.resolve(new Response('', { status: 500 })))
    const r = await fetchJson('/x')
    assert.equal(r.ok, false)
    assert.match(r.error ?? '', /Server sedang bermasalah/i)
  })

  await check('envelope success:false → pakai pesan dari server', async () => {
    stub(() => Promise.resolve(jsonRes({ success: false, error: 'Template tidak ditemukan' })))
    const r = await fetchJson('/x')
    assert.equal(r.ok, false)
    assert.equal(r.error, 'Template tidak ditemukan')
  })

  await check('success:false tanpa pesan → pakai fallbackError pemanggil', async () => {
    stub(() => Promise.resolve(jsonRes({ success: false })))
    const r = await fetchJson('/x', undefined, 'Gagal mengirim template')
    assert.equal(r.error, 'Gagal mengirim template')
  })

  await check('401 → arahkan user masuk lagi', async () => {
    stub(() => Promise.resolve(new Response('', { status: 401 })))
    const r = await fetchJson('/x')
    assert.match(r.error ?? '', /masuk lagi/i)
  })

  globalThis.fetch = realFetch
  console.log(`\nfetch-json: ${passed} pemeriksaan lolos`)
}

void main()
