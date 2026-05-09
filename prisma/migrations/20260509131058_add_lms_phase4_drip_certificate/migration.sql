-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "dripDays" INTEGER;

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "studentPhone" TEXT NOT NULL,
    "courseTitle" TEXT NOT NULL,
    "courseSlug" TEXT NOT NULL,
    "issuerUserId" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_number_key" ON "Certificate"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_enrollmentId_key" ON "Certificate"("enrollmentId");

-- CreateIndex
CREATE INDEX "Certificate_studentPhone_idx" ON "Certificate"("studentPhone");

-- CreateIndex
CREATE INDEX "Certificate_issuerUserId_idx" ON "Certificate"("issuerUserId");

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

