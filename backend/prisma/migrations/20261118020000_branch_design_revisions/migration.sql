CREATE TABLE "BranchDesign" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "head" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BranchDesign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BranchDesignRevision" (
    "designId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "plan" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BranchDesignRevision_pkey" PRIMARY KEY ("designId", "number")
);

CREATE INDEX "BranchDesign_ownerId_updatedAt_idx" ON "BranchDesign"("ownerId", "updatedAt");
ALTER TABLE "BranchDesignRevision"
    ADD CONSTRAINT "BranchDesignRevision_designId_fkey" FOREIGN KEY ("designId")
    REFERENCES "BranchDesign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
