-- CreateEnum
CREATE TYPE "InputType" AS ENUM ('PROMPT', 'MANUAL');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('ROUTER', 'SWITCH', 'SERVER', 'PC', 'FIREWALL', 'AP', 'PRINTER', 'CAMERA', 'NVR', 'IP_PHONE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "source" "InputType" NOT NULL DEFAULT 'MANUAL',
    "prompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topology" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "layout" JSONB,

    CONSTRAINT "Topology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "topologyId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "meta" JSONB,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "topologyId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "meta" JSONB,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkPlan" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ipPlan" JSONB NOT NULL,
    "vlanPlan" JSONB NOT NULL,
    "routing" JSONB NOT NULL,
    "notes" JSONB,

    CONSTRAINT "NetworkPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Topology_projectId_key" ON "Topology"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkPlan_projectId_key" ON "NetworkPlan"("projectId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topology" ADD CONSTRAINT "Topology_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_topologyId_fkey" FOREIGN KEY ("topologyId") REFERENCES "Topology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_topologyId_fkey" FOREIGN KEY ("topologyId") REFERENCES "Topology"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkPlan" ADD CONSTRAINT "NetworkPlan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
