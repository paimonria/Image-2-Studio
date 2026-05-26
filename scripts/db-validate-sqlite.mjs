import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(command, ["exec", "prisma", "validate", "--schema", "prisma/schema.active.prisma"], {
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db"
  },
  shell: process.platform === "win32",
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.signal) {
  console.error(`Prisma validation exited with signal ${result.signal}.`);
  process.exit(1);
}

process.exit(result.status ?? 1);
