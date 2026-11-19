// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "../backend/generated/client";
import { createPostgresStore } from "../backend/src/storage/postgres-store";
import { signJwt } from "../backend/src/middleware/auth";
import { branchExample } from "@/lib/design/example";
import { buildTopology, planNetwork } from "@/lib/network-engine";
import { startApi } from "./api-harness";
const url = process.env.NETTOPO_TEST_DATABASE_URL;
describe.skipIf(!url)("active Express API with disposable PostgreSQL", () => {
  let db: PrismaClient;
  let api: Awaited<ReturnType<typeof startApi>>;
  const who = `integration-${randomUUID()}`;
  const other = `integration-${randomUUID()}`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${signJwt({ id: who, email: `${who}@example.test` })}`,
  };
  beforeAll(async () => {
    if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))
      throw new Error("Select an explicit, local disposable test database.");
    db = new PrismaClient({ datasources: { db: { url } } });
    api = await startApi(createPostgresStore(db));
  });
  afterAll(async () => {
    await api?.close();
    if (db) {
      await db.platformRecord.deleteMany({
        where: { ownerId: { in: [`user:${who}`, `user:${other}`] } },
      });
      await db.$disconnect();
    }
  });
  it("isolates owners and allows exactly one concurrent branch revision", async () => {
    const response = await fetch(`${api.url}/api/v1/branch-designs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Branch A", input: branchExample }),
    });
    expect(response.status).toBe(201);
    const { design } = await response.json();
    const alien = {
      Authorization: `Bearer ${signJwt({ id: other, email: "other@example.test" })}`,
    };
    expect(
      (
        await fetch(`${api.url}/api/v1/branch-designs/${design.id}`, {
          headers: alien,
        })
      ).status,
    ).toBe(404);
    const responses = await Promise.all(
      [1, 2].map(() =>
        fetch(`${api.url}/api/v1/branch-designs/${design.id}`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            expectedHead: 1,
            input: { ...branchExample, parentCidr: "10.60.0.0/24" },
          }),
        }),
      ),
    );
    expect(responses.map((result) => result.status).sort()).toEqual([201, 409]);
    const detail = await (
      await fetch(`${api.url}/api/v1/branch-designs/${design.id}`, { headers })
    ).json();
    expect(detail.design.revisions).toHaveLength(2);
  });
  it("round trips topology, layout and conversations through independent store instances", async () => {
    const topology = buildTopology({
      devices: [
        { type: "ROUTER", count: 1 },
        { type: "SWITCH", count: 1 },
      ],
      options: { vlan: false },
    });
    const plan = planNetwork(topology);
    const response = await fetch(`${api.url}/api/v1/projects`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Connected", topology, plan, acls: [] }),
    });
    expect(response.status).toBe(201);
    const { project } = await response.json();
    const independent = createPostgresStore(db);
    expect(
      (await independent.getProject(`user:${who}`, project.id))?.connections,
    ).toEqual(topology.connections);
    expect(
      (await independent.getProject(`user:${who}`, project.id))?.layout,
    ).toEqual(topology.layout);
    const conversation = await independent.createConversation(`user:${who}`, {
      workspaceState: { projectName: "Durable", topology, plan, acls: [] },
    });
    await independent.updateConversation(`user:${who}`, conversation.id, {
      workspaceState: { projectName: "Changed", topology, plan, acls: [] },
      expectedVersion: 1,
    });
    expect(
      (
        await createPostgresStore(db).getConversation(
          `user:${who}`,
          conversation.id,
        )
      )?.workspaceRevisions,
    ).toHaveLength(2);
  });
});
