// @vitest-environment node
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalJsonStore } from "../backend/src/storage/local-store";
import { signGuestSession } from "../backend/src/middleware/auth";
import { runNetworkAgentChat } from "../backend/lib/ai/agent";
import { builtTopologySchema } from "@/lib/validators/schemas";
import { buildTopology, planNetwork } from "@/lib/network-engine";
import { compareWorkspaces } from "@/lib/design/workspace-diff";
import { startApi } from "./api-harness";
const topology = buildTopology({
  devices: [
    { type: "ROUTER", count: 1 },
    { type: "SWITCH", count: 1 },
    { type: "PC", count: 2 },
  ],
  options: { vlan: true },
});
const workspace = {
  projectName: "Baseline",
  topology,
  plan: planNetwork(topology),
  acls: [],
};

describe("durable storage and API safeguards", () => {
  const temp = mkdtempSync(join(tmpdir(), "nettopo-hardening-"));
  let api: Awaited<ReturnType<typeof startApi>>;
  const headers = {
    "Content-Type": "application/json",
    "X-NetTopo-Guest": signGuestSession("hardening-owner"),
  };
  beforeAll(async () => {
    api = await startApi(new LocalJsonStore(join(temp, "api.json")));
  });
  afterAll(async () => {
    await api.close();
    rmSync(temp, { recursive: true, force: true });
  });
  async function send(path: string, body?: unknown, method = "POST") {
    return fetch(`${api.url}/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  it("preserves a corrupt source and rejects startup rather than replacing data", () => {
    const file = join(temp, "corrupt.json");
    writeFileSync(file, "{broken");
    expect(() => new LocalJsonStore(file)).toThrow(
      "original file was preserved",
    );
    expect(readFileSync(file, "utf8")).toBe("{broken");
  });
  it("serializes independent JSON store instances and retains a backup", async () => {
    const file = join(temp, "concurrent.json");
    const a = new LocalJsonStore(file);
    const b = new LocalJsonStore(file);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? a : b).createConversation("guest:owner", {
          title: `Chat ${i}`,
        }),
      ),
    );
    expect(
      await new LocalJsonStore(file).listConversations("guest:owner"),
    ).toHaveLength(12);
    expect(
      JSON.parse(readFileSync(file + ".bak", "utf8")).conversations.length,
    ).toBe(11);
  });
  it("preserves more than 160 messages and pages conversations and older messages", async () => {
    const file = join(temp, "history.json");
    const store = new LocalJsonStore(file);
    const conversation = await store.createConversation("guest:owner");
    await store.appendConversationMessages(
      "guest:owner",
      conversation.id,
      Array.from({ length: 180 }, (_, i) => ({
        id: `m${i}`,
        role: "user" as const,
        content: `Message ${i}`,
        createdAt: new Date().toISOString(),
      })),
    );
    expect(
      (
        await new LocalJsonStore(file).getConversation(
          "guest:owner",
          conversation.id,
        )
      )?.messages,
    ).toHaveLength(180);
    const a = await (await send("/conversations", { title: "First" })).json();
    await send("/conversations", { title: "Second" });
    const page = await (
      await send("/conversations?limit=1", undefined, "GET")
    ).json();
    expect(page.conversations).toHaveLength(1);
    expect(page.nextOffset).toBe(1);
    expect(
      (
        await send(
          `/conversations/${a.conversation.id}?before=-1`,
          undefined,
          "GET",
        )
      ).status,
    ).toBe(422);
  });
  it("enforces version conflicts, persists a reversible history and isolates restoration", async () => {
    const { conversation } = await (
      await send("/conversations", { workspaceState: workspace })
    ).json();
    const path = `/conversations/${conversation.id}`;
    const results = await Promise.all(
      ["A", "B"].map((projectName) =>
        send(
          path,
          { workspaceState: { ...workspace, projectName }, expectedVersion: 1 },
          "PATCH",
        ),
      ),
    );
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const latest = (await (await send(path, undefined, "GET")).json())
      .conversation;
    expect(latest.workspaceRevisions).toHaveLength(2);
    const restore = await send(`${path}/restore`, {
      revision: 1,
      expectedVersion: latest.version,
    });
    expect(restore.status).toBe(200);
    const restored = (await restore.json()).conversation;
    expect(restored.workspaceState.projectName).toBe("Baseline");
    expect(restored.workspaceRevisions).toHaveLength(3);
    const alien = await fetch(`${api.url}/api/v1${path}/restore`, {
      method: "POST",
      headers: {
        ...headers,
        "X-NetTopo-Guest": signGuestSession("different-owner"),
      },
      body: JSON.stringify({ revision: 1, expectedVersion: restored.version }),
    });
    expect(alien.status).toBe(404);
  });
  it("previews AI mutations, rejects stale reviews, and applies only the accepted proposal", async () => {
    const { conversation } = await (
      await send("/conversations", { workspaceState: workspace })
    ).json();
    const path = `/conversations/${conversation.id}`;
    const result = await send(`${path}/messages`, {
      message: "Add 1 server",
      requestId: "proposal-message-1",
      expectedVersion: 1,
    });
    expect(result.status).toBe(200);
    const data = await result.json();
    expect(data.conversation.pendingProposal).toBeDefined();
    expect(data.conversation.workspaceState).toEqual(workspace);
    expect(
      data.conversation.pendingProposal.state.topology.devices.length,
    ).toBeGreaterThan(workspace.topology.devices.length);
    const replay = await send(`${path}/messages`, {
      message: "Add 1 server",
      requestId: "proposal-message-1",
    });
    expect((await replay.json()).conversation.messages).toHaveLength(2);
    const proposalId = data.conversation.pendingProposal.id;
    expect(
      (
        await send(`${path}/proposal`, {
          proposalId,
          accept: true,
          expectedVersion: 1,
        })
      ).status,
    ).toBe(409);
    const accepted = await send(`${path}/proposal`, {
      proposalId,
      accept: true,
      expectedVersion: data.conversation.version,
    });
    expect(accepted.status).toBe(200);
    const saved = (await accepted.json()).conversation;
    expect(saved.pendingProposal).toBeUndefined();
    expect(saved.workspaceRevisions).toHaveLength(2);
    expect(saved.workspaceState.topology.devices.length).toBeGreaterThan(
      workspace.topology.devices.length,
    );
  });
  it("validates the graph and ACLs and requires export warning acknowledgment", async () => {
    expect(
      builtTopologySchema.safeParse({
        ...topology,
        devices: [topology.devices[0], topology.devices[0]],
      }).success,
    ).toBe(false);
    expect(
      builtTopologySchema.safeParse({
        ...topology,
        connections: [
          { id: "bad", from: "missing", to: topology.devices[0].id },
        ],
      }).success,
    ).toBe(false);
    expect(
      (
        await send("/exports/lab-pack", {
          name: "Audit",
          ...workspace,
          acls: [{ invalid: true }],
        })
      ).status,
    ).toBe(422);
    const payload = { name: "Audit", topology, plan: workspace.plan, acls: [] };
    expect((await send("/exports/lab-pack", payload)).status).toBe(409);
    expect(
      (
        await send("/exports/lab-pack", {
          ...payload,
          acknowledgeWarnings: true,
        })
      ).status,
    ).toBe(200);
    const report = await (await send("/exports/preflight", payload)).json();
    expect(report.ready).toBe(true);
    expect(report.findings.length).toBeGreaterThan(0);
  });
  it("builds exactly the requested network instead of extending a hidden sample", async () => {
    const response = await runNetworkAgentChat({
      message: "Design 1 router, 1 switch and 2 PCs with VLANs",
      lang: "en",
    });
    expect(response.nextState?.topology.devices).toHaveLength(4);
    const greeting = await runNetworkAgentChat({
      message: "hello",
      lang: "en",
    });
    expect(greeting.mutated).toBe(false);
    expect(greeting.nextState).toBeUndefined();
  });
  it("inspects local attachments without pretending they were applied", async () => {
    const response = await runNetworkAgentChat({
      message: "Inspect this configuration",
      lang: "en",
      attachments: [
        {
          name: "router.cfg",
          content:
            "hostname BranchR1\ninterface GigabitEthernet0/0\n ip address 10.0.0.1 255.255.255.0",
        },
      ],
    });
    expect(response.executionMode).toBe("local");
    expect(response.reply).toContain("BranchR1");
    expect(response.reply).toContain("1 interfaces");
    expect(response.reply).toContain("does not execute");
  });
  it("compares changed fields as well as added and removed objects", () => {
    const next = structuredClone(workspace);
    next.topology.devices[0].label = "New router name";
    next.plan.routing.protocol = "BGP";
    const changes = compareWorkspaces(workspace, next);
    expect(
      changes.some(
        (change) => change.area === "Devices" && change.kind === "changed",
      ),
    ).toBe(true);
    expect(changes.some((change) => change.area === "Routing")).toBe(true);
  });
});
