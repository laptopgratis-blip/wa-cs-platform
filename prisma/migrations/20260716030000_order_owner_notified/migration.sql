-- Notif WA "Order Baru" ke owner jadi retry-able (2026-07-16).
-- NULL = belum terkirim; disweep cron followup-send sampai 24 jam.
-- Order lama (pra-fitur) di-stamp createdAt supaya tidak dispam notif lawas.
ALTER TABLE "UserOrder" ADD COLUMN "ownerNotifiedAt" TIMESTAMP(3);
UPDATE "UserOrder" SET "ownerNotifiedAt" = "createdAt";
