// Bagian konten pesan free-form Cloud API (`type` + objek per tipe) untuk
// POST /{phoneNumberId}/messages. Pure — dipakai send.ts, diuji terpisah.
//
// Caption hanya disertakan bila ada isinya (Meta menolak caption kosong di
// sebagian klien & teks kosong tak berarti apa-apa untuk customer).

export type FreeformMedia =
  | { kind: 'image'; id: string }
  | { kind: 'image'; link: string }
  | { kind: 'document'; id: string; filename: string }

export function freeformMessageContent(
  content: string,
  media?: FreeformMedia,
): Record<string, unknown> {
  const caption = content ? { caption: content } : {}
  if (!media) return { type: 'text', text: { body: content } }
  if (media.kind === 'document') {
    return {
      type: 'document',
      document: { id: media.id, filename: media.filename, ...caption },
    }
  }
  return {
    type: 'image',
    image:
      'id' in media
        ? { id: media.id, ...caption }
        : { link: media.link, ...caption },
  }
}
