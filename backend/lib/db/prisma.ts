import { PrismaClient } from "../../generated/client";
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
/** Local mode never instantiates a database engine or opens an external connection. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = (globalForPrisma.prisma ??= new PrismaClient());
    const value = Reflect.get(client, property);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
