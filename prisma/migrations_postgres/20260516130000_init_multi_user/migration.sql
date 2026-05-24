CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'USER',
  "disabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderConfig" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "activeProvider" TEXT,
  "openaiKeyEncrypted" TEXT,
  "falKeyEncrypted" TEXT,
  "openaiBaseUrl" TEXT,
  "openaiModel" TEXT,
  "falModel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformProviderConfig" (
  "id" TEXT NOT NULL DEFAULT 'platform',
  "openaiKeyEncrypted" TEXT,
  "falKeyEncrypted" TEXT,
  "openaiBaseUrl" TEXT,
  "openaiModel" TEXT,
  "falModel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformProviderConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSetting" (
  "id" TEXT NOT NULL DEFAULT 'settings',
  "registrationOpen" BOOLEAN NOT NULL DEFAULT false,
  "dailyPlatformQuota" INTEGER NOT NULL DEFAULT 20,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImageRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" TEXT,
  "aspectRatio" TEXT,
  "quality" TEXT,
  "inputFidelity" TEXT,
  "sourceImageIds" TEXT NOT NULL DEFAULT '[]',
  "uploadImageIds" TEXT NOT NULL DEFAULT '[]',
  "parentId" TEXT,
  "providerMeta" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ImageRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoredImage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StoredImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageDaily" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "platformUses" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UsageDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE UNIQUE INDEX "ProviderConfig_userId_key" ON "ProviderConfig"("userId");
CREATE INDEX "ImageRecord_userId_createdAt_idx" ON "ImageRecord"("userId", "createdAt");
CREATE INDEX "ImageRecord_provider_idx" ON "ImageRecord"("provider");
CREATE INDEX "ImageRecord_model_idx" ON "ImageRecord"("model");
CREATE INDEX "StoredImage_userId_createdAt_idx" ON "StoredImage"("userId", "createdAt");
CREATE UNIQUE INDEX "UsageDaily_userId_date_key" ON "UsageDaily"("userId", "date");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderConfig" ADD CONSTRAINT "ProviderConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImageRecord" ADD CONSTRAINT "ImageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageDaily" ADD CONSTRAINT "UsageDaily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
