-- Zona ongkir: dukung pengecualian provinsi ("Semua wilayah kecuali Papua").
-- findMatchingZone melewati zona bila provinsi tujuan ada di daftar ini.
ALTER TABLE "ShippingZone" ADD COLUMN "excludedProvinceNames" TEXT[] NOT NULL DEFAULT '{}';
