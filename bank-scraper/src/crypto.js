// Mirror dari /var/www/wa-cs-platform/lib/crypto.ts (AES-256-GCM).
// PENTING: format ciphertext, IV length, dan auth tag length WAJIB sama
// dengan crypto.ts supaya nilai yang di-encrypt di Next.js bisa di-decrypt
// di sini dan sebaliknya. Kalau ubah salah satu, ubah dua-duanya.
const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto')

const ALGO = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey() {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY belum di-set atau panjangnya bukan 64 karakter hex (32 byte).',
    )
  }
  return Buffer.from(hex, 'hex')
}

function encrypt(plaintext) {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGO, key, iv)
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`
}

function decrypt(payload) {
  const key = getKey()
  const parts = payload.split(':')
  if (parts.length !== 3) {
    throw new Error('Ciphertext format tidak valid')
  }
  const [ivHex, tagHex, dataHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(tagHex, 'hex')
  const data = Buffer.from(dataHex, 'hex')
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Ciphertext format tidak valid')
  }
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return plaintext.toString('utf8')
}

module.exports = { encrypt, decrypt }
