import { spawnSync } from "node:child_process";

// Production schema upgrades must finish before the new API is released.
// Preview builds never migrate the production database.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Run this script using npm run build:vercel.");
const commands = process.env.VERCEL_ENV === "production"
  ? ["db:deploy", "build"]
  : ["build"];
for (const command of commands) {
  const result = spawnSync(process.execPath, [npmCli, "run", command], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
