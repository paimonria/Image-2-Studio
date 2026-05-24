$ErrorActionPreference = "Stop"

$env:DATABASE_URL = "file:./dev.db"
pnpm.cmd exec prisma db push --schema prisma/schema.active.prisma
