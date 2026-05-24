DROP INDEX "ImageRecord_userId_createdAt_idx";
CREATE INDEX "ImageRecord_userId_createdAt_id_idx" ON "ImageRecord"("userId", "createdAt", "id");
