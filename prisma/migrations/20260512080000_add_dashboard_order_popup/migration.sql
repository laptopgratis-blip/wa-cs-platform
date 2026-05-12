-- Dashboard order popup setting per user. Default enabled supaya seller
-- langsung dapat feedback popup saat order masuk waktu dashboard terbuka.
ALTER TABLE "User"
  ADD COLUMN "dashboardOrderPopupEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "dashboardOrderPopupSound" TEXT NOT NULL DEFAULT 'chime';
