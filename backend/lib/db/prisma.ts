import { PrismaClient } from "../../generated/client";
import { runtimeDatabaseUrl } from "./connection-url";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
/** Local mode never instantiates a database engine or opens an external connection. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = (globalForPrisma.prisma ??= new PrismaClient({
      datasources: { db: { url: runtimeDatabaseUrl() } },
    }));
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
