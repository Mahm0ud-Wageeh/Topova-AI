import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresStore } from "./postgres-store";
import { LocalJsonStore } from "./local-store";
import type { DataStore } from "./types";

const defaultDataPath = fileURLToPath(
  new URL("../../.data/store.json", import.meta.url),
);

export function createDataStore(customPath?: string): DataStore {
  const storage =
    process.env.NETTOPO_STORAGE ??
    (process.env.NODE_ENV === "production" ? "postgresql" : "local-json");
  if (!customPath && storage === "postgresql") return createPostgresStore();
  if (!customPath && storage !== "local-json")
    throw new Error("NETTOPO_STORAGE must be postgresql or local-json.");
  if (
    !customPath &&
    process.env.NODE_ENV === "production" &&
    storage === "local-json"
  )
    throw new Error(
      "Production requires PostgreSQL. Use local-json only for development.",
    );
  const filePath =
    customPath ?? process.env.NETTOPO_STORE_PATH ?? defaultDataPath;
  return new LocalJsonStore(filePath);
}

export type { DataStore };
export { LocalJsonStore };
export function testStorePath(name: string) {
  return join(process.cwd(), "backend", ".data", `${name}.json`);
}
