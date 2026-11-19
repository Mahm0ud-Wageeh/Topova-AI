import { expect, it } from "vitest";
import { runtimeDatabaseUrl } from "../backend/lib/db/connection-url";

it("prefers a PostgreSQL runtime pool URL over the migration connection", () => {
  expect(runtimeDatabaseUrl({
    DATABASE_URL: "postgresql://runtime@localhost/app",
    DIRECT_URL: "postgresql://migrations@localhost/app",
  })).toBe("postgresql://runtime@localhost/app");
});

it("supports legacy Accelerate settings using the native migration connection", () => {
  expect(runtimeDatabaseUrl({
    DATABASE_URL: "prisma://example.invalid/?api_key=test-only",
    DIRECT_URL: " postgres://migrations@localhost/app ",
  })).toBe("postgres://migrations@localhost/app");
});

it("fails without disclosing credentials when no native connection is configured", () => {
  expect(() => runtimeDatabaseUrl({ DATABASE_URL: "prisma://example.invalid/?api_key=test-only" }))
    .toThrow("Set DATABASE_URL or DIRECT_URL");
});
