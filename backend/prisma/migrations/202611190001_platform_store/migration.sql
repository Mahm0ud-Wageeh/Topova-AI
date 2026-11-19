CREATE TABLE "PlatformUser" (
 "id" TEXT PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL,
 "passwordHash" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "PlatformRecord" (
 "kind" TEXT NOT NULL, "id" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
 "payload" JSONB NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("kind", "id")
);
CREATE INDEX "PlatformRecord_ownerId_kind_updatedAt_idx" ON "PlatformRecord" ("ownerId", "kind", "updatedAt");
