-- Fix Connection foreign keys so deleting a Project/Topology/Device cascades cleanly
ALTER TABLE "Connection" DROP CONSTRAINT "Connection_fromId_fkey";
ALTER TABLE "Connection" DROP CONSTRAINT "Connection_toId_fkey";

ALTER TABLE "Connection" ADD CONSTRAINT "Connection_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Performance indexes for owned project listing and topology joins
CREATE INDEX IF NOT EXISTS "Project_ownerId_updatedAt_idx" ON "Project"("ownerId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Device_topologyId_idx" ON "Device"("topologyId");
CREATE INDEX IF NOT EXISTS "Connection_topologyId_idx" ON "Connection"("topologyId");
