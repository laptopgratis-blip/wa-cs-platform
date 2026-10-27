// Guard URL lampiran knowledge (IMAGE/FILE) sebelum diserahkan ke Baileys.
//
// Baileys men-fetch `{ image: { url } }` / `{ document: { url } }` sendiri
// (getHttpStream) dari dalam network docker. fileUrl berasal dari data seller,
// jadi kalau diteruskan apa adanya = SSRF: seller bisa membuat wa-service
// mengambil http://hulao-postgres, metadata cloud, dsb. lalu hasilnya terkirim
// ke WhatsApp. Next.js sudah memvalidasi di API & endpoint internal; ini
// lapisan kedua untuk data lama / jalur lain.
//
// Hanya path persis hasil route upload Next (app/api/knowledge/upload) milik
// pemilik sesi yang lolos. Paritas dengan KNOWLEDGE_FILE_URL di
// lib/validations/knowledge.ts — wa-service paket terpisah, tidak bisa import.
const KNOWLEDGE_FILE_URL =
  /^\/uploads\/knowledge\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\.([A-Za-z0-9]{1,5})$/

/**
 * URL absolut untuk di-fetch Baileys, atau null bila fileUrl bukan file
 * knowledge milik `ownerUserId` (URL absolut, path lain, traversal, user lain).
 *
 * `uploadsBase` = nginx container hulao-uploads — BUKAN Next.js: standalone
 * mode 404 untuk file /public yang ditambah saat runtime (lihat
 * docker-compose.yml bagian hulao-uploads).
 */
export function resolveKnowledgeAttachmentUrl(
  fileUrl: string,
  ownerUserId: string,
  uploadsBase: string,
): string | null {
  if (!fileUrl || !ownerUserId) return null
  const match = KNOWLEDGE_FILE_URL.exec(fileUrl)
  if (!match || match[1] !== ownerUserId) return null
  return uploadsBase.replace(/\/+$/, '') + fileUrl
}
