-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "lastBookstackTestAt" DATETIME;
ALTER TABLE "Settings" ADD COLUMN "lastBookstackTestOk" BOOLEAN;
ALTER TABLE "Settings" ADD COLUMN "lastBookstackTestMessage" TEXT;
ALTER TABLE "Settings" ADD COLUMN "lastAnythingllmTestAt" DATETIME;
ALTER TABLE "Settings" ADD COLUMN "lastAnythingllmTestOk" BOOLEAN;
ALTER TABLE "Settings" ADD COLUMN "lastAnythingllmTestMessage" TEXT;
