import { isDeepStrictEqual } from "node:util";
import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "../../generated/client";
import { prisma } from "../../lib/db/prisma";
import { HttpError } from "../middleware/error-handler";
import { LocalJsonStore, type StoreFileShape } from "./local-store";
import type { DataStore } from "./types";

const collections = [
  "projects",
  "branchDesigns",
  "conversations",
  "profiles",
] as const;
const reads = /^(find|list|get|load)/;

/** Indexed owner-scoped records, with serializable transactions for domain mutations. */
export function createPostgresStore(client: PrismaClient = prisma): DataStore {
  const users = {
    async findUserByEmail(email: string) {
      const row = await client.platformUser.findUnique({
        where: { email: email.trim().toLowerCase() },
      });
      return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
    },
    async findUserById(id: string) {
      const row = await client.platformUser.findUnique({ where: { id } });
      return row ? { ...row, createdAt: row.createdAt.toISOString() } : null;
    },
    async createUser(input: {
      email: string;
      name: string;
      passwordHash: string;
    }) {
      try {
        const row = await client.platformUser.create({
          data: {
            ...input,
            email: input.email.trim().toLowerCase(),
            id: `usr${randomBytes(8).toString("hex")}`,
          },
        });
        return { ...row, createdAt: row.createdAt.toISOString() };
      } catch (error) {
        if ((error as { code?: string }).code === "P2002")
          throw new HttpError(
            409,
            "EMAIL_EXISTS",
            "An account with this email already exists.",
          );
        throw error;
      }
    },
  };
  return new Proxy(
    { mode: "postgresql" },
    {
      get(target, key) {
        if (key === "mode") return target.mode;
        if (key in users) return users[key as keyof typeof users];
        if (typeof key !== "string" || !(key in LocalJsonStore.prototype))
          return undefined;
        return async (...args: unknown[]) => {
          const owners =
            key === "adoptGuestRecords"
              ? [String(args[0]), String(args[1])]
              : [String(args[0])];
          for (let attempt = 0; ; attempt++) {
            try {
              return await client.$transaction(
                async (tx) => {
                  const rows = await tx.platformRecord.findMany({
                    where: { ownerId: { in: owners } },
                  });
                  const snapshot: StoreFileShape = {
                    users: [],
                    projects: [],
                    branchDesigns: [],
                    conversations: [],
                    profiles: [],
                  };
                  for (const kind of collections)
                    snapshot[kind] = rows
                      .filter((row) => row.kind === kind)
                      .map((row) => row.payload) as never;
                  const engine = new LocalJsonStore(undefined, snapshot);
                  const method = engine[key as keyof LocalJsonStore] as (
                    ...params: unknown[]
                  ) => Promise<unknown>;
                  const result = await method(...args);
                  if (!reads.test(key)) {
                    const after = engine.exportSnapshot();
                    for (const kind of collections) {
                      const records = after[kind] as unknown as {
                        id?: string;
                        ownerId: string;
                      }[];
                      const ids = records.map(
                        (record) => record.id ?? record.ownerId,
                      );
                      await tx.platformRecord.deleteMany({
                        where: {
                          kind,
                          ownerId: { in: owners },
                          id: { notIn: ids },
                        },
                      });
                      for (const record of records) {
                        const id = record.id ?? record.ownerId;
                        const payload = JSON.parse(
                          JSON.stringify(record),
                        ) as Prisma.InputJsonValue;
                        const previous = rows.find(
                          (row) => row.kind === kind && row.id === id,
                        );
                        if (
                          previous &&
                          previous.ownerId === record.ownerId &&
                          isDeepStrictEqual(previous.payload, payload)
                        )
                          continue;
                        await tx.platformRecord.upsert({
                          where: { kind_id: { kind, id } },
                          create: {
                            kind,
                            id,
                            ownerId: record.ownerId,
                            payload,
                          },
                          update: { ownerId: record.ownerId, payload },
                        });
                      }
                    }
                  }
                  return result;
                },
                {
                  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                  timeout: 15_000,
                },
              );
            } catch (error) {
              if ((error as { code?: string }).code !== "P2034" || attempt >= 3)
                throw error;
            }
          }
        };
      },
    },
  ) as DataStore;
}
