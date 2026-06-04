-- CreateEnum
CREATE TYPE "HostTemplateStatus" AS ENUM ('DRAFT', 'GENERATING_IMAGE', 'IMAGE_READY', 'GENERATING_VIDEO', 'READY', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GenerationJobType" AS ENUM ('HOST_IMAGE', 'HOST_VIDEO');

-- CreateEnum
CREATE TYPE "GenerationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "AiFeatureConfig" ADD COLUMN     "unitLabel" TEXT,
ADD COLUMN     "unitType" TEXT NOT NULL DEFAULT 'TOKEN';

-- CreateTable
CREATE TABLE "HostTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "visualStyle" TEXT,
    "voiceId" TEXT,
    "promptImage" TEXT NOT NULL,
    "promptVideo" TEXT NOT NULL,
    "refImageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceImageUrl" TEXT,
    "videoLoopUrl" TEXT,
    "videoSeconds" INTEGER,
    "status" "HostTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HostTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hostTemplateId" TEXT,
    "type" "GenerationJobType" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputPayload" JSONB NOT NULL,
    "providerTaskId" TEXT,
    "status" "GenerationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "outputUrl" TEXT,
    "errorMessage" TEXT,
    "apiCostUsd" DOUBLE PRECISION,
    "tokensCharged" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HostTemplate_userId_createdAt_idx" ON "HostTemplate"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "HostTemplate_isPublic_status_idx" ON "HostTemplate"("isPublic", "status");

-- CreateIndex
CREATE INDEX "GenerationJob_status_provider_idx" ON "GenerationJob"("status", "provider");

-- CreateIndex
CREATE INDEX "GenerationJob_userId_createdAt_idx" ON "GenerationJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationJob_hostTemplateId_idx" ON "GenerationJob"("hostTemplateId");

-- AddForeignKey
ALTER TABLE "HostTemplate" ADD CONSTRAINT "HostTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationJob" ADD CONSTRAINT "GenerationJob_hostTemplateId_fkey" FOREIGN KEY ("hostTemplateId") REFERENCES "HostTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
