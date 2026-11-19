import { readFile } from "node:fs/promises";
import { LocalJsonStore } from "../backend/src/storage/local-store";
import { prisma } from "../backend/lib/db/prisma";

const source = process.argv[2];
if (!source)
  throw new Error(
    "Usage: npm run db:import-local -- /absolute/path/to/store.json [owner-map.json]",
  );
const data = new LocalJsonStore(source).exportSnapshot();
const ownerMap: Record<string, string> = process.argv[3]
  ? JSON.parse(await readFile(process.argv[3], "utf8"))
  : {};
try {
  await prisma.$transaction(
    async (tx) => {
      // Existing records are never overwritten. A conflict rolls back the entire import.
      for (const user of data.users)
        await tx.platformUser.create({
          data: { ...user, createdAt: new Date(user.createdAt) },
        });
      for (const kind of [
        "projects",
        "branchDesigns",
        "conversations",
        "profiles",
      ] as const) {
        for (const original of data[kind]) {
          const record = {
            ...original,
            ownerId: ownerMap[original.ownerId] ?? original.ownerId,
          };
          const id = "id" in record ? record.id : record.ownerId;
          await tx.platformRecord.create({
            data: {
              kind,
              id,
              ownerId: record.ownerId,
              payload: JSON.parse(JSON.stringify(record)),
            },
          });
        }
      }
    },
    { timeout: 60_000 },
  );
  console.log(
    "Import complete. Source JSON was preserved. Verify accounts and designs before switching storage.",
  );
} finally {
  await prisma.$disconnect();
}
