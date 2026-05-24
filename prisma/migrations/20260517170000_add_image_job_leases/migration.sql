ALTER TABLE "ImageJob" ADD COLUMN "lockedBy" TEXT;
ALTER TABLE "ImageJob" ADD COLUMN "lockedAt" DATETIME;
ALTER TABLE "ImageJob" ADD COLUMN "heartbeatAt" DATETIME;
ALTER TABLE "ImageJob" ADD COLUMN "queueWaitMs" INTEGER;
ALTER TABLE "ImageJob" ADD COLUMN "executionMs" INTEGER;
ALTER TABLE "ImageJob" ADD COLUMN "upstreamMs" INTEGER;
ALTER TABLE "ImageJob" ADD COLUMN "fileSaveMs" INTEGER;

CREATE INDEX "ImageJob_userId_status_idx" ON "ImageJob"("userId", "status");
CREATE INDEX "ImageJob_status_lockedAt_idx" ON "ImageJob"("status", "lockedAt");
CREATE INDEX "ImageJob_status_heartbeatAt_idx" ON "ImageJob"("status", "heartbeatAt");
CREATE INDEX "ImageJob_lockedBy_status_idx" ON "ImageJob"("lockedBy", "status");
