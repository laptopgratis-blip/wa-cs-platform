-- User: tambah nomor WA + flag verifikasi nomor.
ALTER TABLE "User"
  ADD COLUMN "phoneNumber"   TEXT,
  ADD COLUMN "phoneVerified" TIMESTAMP(3);

-- Unique partial — Postgres treat NULL as distinct, jadi banyak user lama yg
-- phoneNumber NULL tetap valid; baru enforce unique untuk yg sudah isi.
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- AuthOtp: simpan OTP login/signup. CodeHash = sha256 hex (short-lived).
CREATE TABLE "AuthOtp" (
  "id"           TEXT NOT NULL,
  "identifier"   TEXT NOT NULL,
  "ipAddress"    TEXT,
  "codeHash"     TEXT NOT NULL,
  "mode"         TEXT NOT NULL,
  "channel"      TEXT NOT NULL,
  "pendingEmail" TEXT,
  "pendingPhone" TEXT,
  "pendingName"  TEXT,
  "userId"       TEXT,
  "expiresAt"    TIMESTAMP(3) NOT NULL,
  "attempts"     INTEGER NOT NULL DEFAULT 0,
  "used"         BOOLEAN NOT NULL DEFAULT false,
  "emailSent"    BOOLEAN NOT NULL DEFAULT false,
  "waSent"       BOOLEAN NOT NULL DEFAULT false,
  "waError"      TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuthOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthOtp_identifier_createdAt_idx" ON "AuthOtp"("identifier", "createdAt");
CREATE INDEX "AuthOtp_expiresAt_idx"           ON "AuthOtp"("expiresAt");
