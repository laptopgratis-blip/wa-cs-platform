-- AlterTable: tambah kolom isTester di SoulPersonality.
-- Default false → semua record existing tetap muncul di dropdown user.
-- Admin manual set true untuk record yang khusus untuk testing/simulation.
ALTER TABLE "SoulPersonality"
  ADD COLUMN "isTester" BOOLEAN NOT NULL DEFAULT false;
