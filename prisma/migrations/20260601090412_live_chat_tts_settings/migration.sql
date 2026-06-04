-- AlterTable
ALTER TABLE "LiveRoom" ADD COLUMN     "chatModel" TEXT NOT NULL DEFAULT 'claude-haiku-4-5',
ADD COLUMN     "chatTemperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
ADD COLUMN     "ttsInstructions" TEXT,
ALTER COLUMN "ttsVoice" SET DEFAULT 'nova';
