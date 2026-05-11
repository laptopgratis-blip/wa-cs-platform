-- AlterTable: tambah 3 trigger Purchase granularity ke PixelIntegration.
-- Default: triggerOnAdminMarkPaid=true preserve current behavior; 2 trigger
-- baru default false (user opt-in).
ALTER TABLE "PixelIntegration"
  ADD COLUMN "triggerOnBuyerProofUpload" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "triggerOnAdminProofUpload" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "triggerOnAdminMarkPaid"    BOOLEAN NOT NULL DEFAULT true;
