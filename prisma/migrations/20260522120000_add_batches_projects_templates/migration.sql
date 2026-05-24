ALTER TABLE "ImageRecord" ADD COLUMN "batchId" TEXT;
ALTER TABLE "ImageRecord" ADD COLUMN "batchItemId" TEXT;
ALTER TABLE "ImageRecord" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ImageRecord" ADD COLUMN "tags" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "ImageJob" ADD COLUMN "batchId" TEXT;
ALTER TABLE "ImageJob" ADD COLUMN "batchItemId" TEXT;

CREATE TABLE "ImageBatch" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "totalCount" INTEGER NOT NULL,
  "successCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "promptFormat" TEXT NOT NULL DEFAULT 'blocks',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "ImageBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImageBatchItem" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemIndex" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "jobId" TEXT,
  "resultId" TEXT,
  "error" TEXT,
  "retryCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "ImageBatchItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImageProject" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImageProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromptTemplate" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'Default',
  "mode" TEXT NOT NULL DEFAULT 'universal',
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PromptTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImageRecord_userId_batchId_idx" ON "ImageRecord"("userId", "batchId");
CREATE INDEX "ImageRecord_userId_projectId_idx" ON "ImageRecord"("userId", "projectId");
CREATE INDEX "ImageJob_userId_batchId_idx" ON "ImageJob"("userId", "batchId");
CREATE INDEX "ImageJob_batchItemId_idx" ON "ImageJob"("batchItemId");
CREATE INDEX "ImageBatch_userId_createdAt_idx" ON "ImageBatch"("userId", "createdAt");
CREATE INDEX "ImageBatch_userId_status_idx" ON "ImageBatch"("userId", "status");
CREATE UNIQUE INDEX "ImageBatchItem_batchId_itemIndex_key" ON "ImageBatchItem"("batchId", "itemIndex");
CREATE INDEX "ImageBatchItem_userId_status_idx" ON "ImageBatchItem"("userId", "status");
CREATE INDEX "ImageBatchItem_batchId_status_idx" ON "ImageBatchItem"("batchId", "status");
CREATE INDEX "ImageBatchItem_jobId_idx" ON "ImageBatchItem"("jobId");
CREATE UNIQUE INDEX "ImageProject_userId_name_key" ON "ImageProject"("userId", "name");
CREATE INDEX "ImageProject_userId_createdAt_idx" ON "ImageProject"("userId", "createdAt");
CREATE INDEX "PromptTemplate_userId_createdAt_idx" ON "PromptTemplate"("userId", "createdAt");
CREATE INDEX "PromptTemplate_userId_mode_idx" ON "PromptTemplate"("userId", "mode");

ALTER TABLE "ImageRecord" ADD CONSTRAINT "ImageRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImageBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImageRecord" ADD CONSTRAINT "ImageRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ImageProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImageJob" ADD CONSTRAINT "ImageJob_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImageBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImageBatch" ADD CONSTRAINT "ImageBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageBatchItem" ADD CONSTRAINT "ImageBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImageBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageBatchItem" ADD CONSTRAINT "ImageBatchItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageProject" ADD CONSTRAINT "ImageProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromptTemplate" ADD CONSTRAINT "PromptTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
