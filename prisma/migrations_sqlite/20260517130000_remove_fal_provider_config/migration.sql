PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ProviderConfig" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "activeProvider" TEXT,
  "openaiKeyEncrypted" TEXT,
  "openaiBaseUrl" TEXT,
  "openaiModel" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProviderConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_ProviderConfig" ("id", "userId", "activeProvider", "openaiKeyEncrypted", "openaiBaseUrl", "openaiModel", "createdAt", "updatedAt")
SELECT "id", "userId", "activeProvider", "openaiKeyEncrypted", "openaiBaseUrl", "openaiModel", "createdAt", "updatedAt"
FROM "ProviderConfig";

DROP TABLE "ProviderConfig";
ALTER TABLE "new_ProviderConfig" RENAME TO "ProviderConfig";
CREATE UNIQUE INDEX "ProviderConfig_userId_key" ON "ProviderConfig"("userId");

CREATE TABLE "new_PlatformProviderConfig" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'platform',
  "openaiKeyEncrypted" TEXT,
  "openaiBaseUrl" TEXT,
  "openaiModel" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_PlatformProviderConfig" ("id", "openaiKeyEncrypted", "openaiBaseUrl", "openaiModel", "createdAt", "updatedAt")
SELECT "id", "openaiKeyEncrypted", "openaiBaseUrl", "openaiModel", "createdAt", "updatedAt"
FROM "PlatformProviderConfig";

DROP TABLE "PlatformProviderConfig";
ALTER TABLE "new_PlatformProviderConfig" RENAME TO "PlatformProviderConfig";

PRAGMA foreign_keys=ON;
