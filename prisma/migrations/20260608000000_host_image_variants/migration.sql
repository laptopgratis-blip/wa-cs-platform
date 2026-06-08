-- Galeri kandidat gambar host. sourceImageUrl tetap pointer aktif.
-- Bentuk: [{ id, url, source, label?, withProduct?, createdAt }]
ALTER TABLE "HostTemplate" ADD COLUMN "imageVariants" JSONB NOT NULL DEFAULT '[]';
