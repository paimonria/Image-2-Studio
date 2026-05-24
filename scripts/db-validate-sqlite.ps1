$ErrorActionPreference = "Stop"

$env:DATABASE_URL = "file:./dev.db"
pnpm.cmd exec prisma validate --schema prisma/schema.active.prisma
