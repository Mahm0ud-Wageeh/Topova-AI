/** The active Prisma client uses native PostgreSQL, without Accelerate/Data Proxy. */
export function runtimeDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  for (const value of [env.DATABASE_URL, env.DIRECT_URL]) {
    const url = value?.trim();
    if (url && /^postgres(?:ql)?:\/\//.test(url)) return url;
  }
  throw new Error(
    "Set DATABASE_URL or DIRECT_URL to a postgres:// or postgresql:// connection URL. The active client does not use Prisma Accelerate.",
  );
}
