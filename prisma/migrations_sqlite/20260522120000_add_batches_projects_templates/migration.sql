ALTER TABLE "ImageRecord" ADD COLUMN "batchId" TEXT;
ALTER TABLE "ImageRecord" ADD COLUMN "batchItemId" TEXT;
ALTER TABLE "ImageRecord" ADD COLUMN "projectId" TEXT;
ALTER TABLE "ImageRecord" ADD COLUMN "tags" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "ImageJob" ADD COLUMN "batchId" TEXT;
ALTER TABLE "ImageJob" ADD COLUMN "batchItemId" TEXT;

CREATE TABLE "ImageBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "finishedAt" DATETIME,
  CONSTRAINT "ImageBatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ImageBatchItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
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
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "startedAt" DATETIME,
  "finishedAt" DATETIME,
  CONSTRAINT "ImageBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ImageBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ImageBatchItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ImageProject" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ImageProject_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "PromptTemplate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'Default',
  "mode" TEXT NOT NULL DEFAULT 'universal',
  "content" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PromptTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
