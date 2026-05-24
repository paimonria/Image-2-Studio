ALTER TABLE "ProviderConfig"
  DROP COLUMN "falKeyEncrypted",
  DROP COLUMN "falModel";

ALTER TABLE "PlatformProviderConfig"
  DROP COLUMN "falKeyEncrypted",
  DROP COLUMN "falModel";
