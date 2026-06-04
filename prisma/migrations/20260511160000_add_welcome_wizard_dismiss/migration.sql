-- Welcome Wizard: tambah kolom dismissedAt untuk persist preferensi
-- "Jangan tampilkan lagi". Default NULL = wizard tetap muncul setiap login.
ALTER TABLE "User" ADD COLUMN "welcomeWizardDismissedAt" TIMESTAMP(3);
