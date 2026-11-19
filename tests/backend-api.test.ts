import { signGuestSession } from "../backend/src/middleware/auth";
// @vitest-environment node
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../backend/src/app";
import { LocalJsonStore } from "../backend/src/storage/local-store";

let server: Server;
let baseUrl = "";
const storeFile = join(tmpdir(), `nettopo-api-test-${Date.now()}.json`);

beforeAll(async () => {
  const store = new LocalJsonStore(storeFile);
  const { app } = createApp({ store, disableRateLimit: true });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  try {
    rmSync(storeFile, { force: true });
  } catch {
    // ignore cleanup errors
  }
});

describe("NetTopo AI 2.0 Express Backend Integration", () => {
  it("serves health, OpenAPI JSON, and HTML API docs", async () => {
    const health = await fetch(`${baseUrl}/api/v1/health`);
    expect(health.status).toBe(200);
    const body = await health.json();
    expect(body).toMatchObject({ status: "ok", storage: "local-json" });
    expect(body.capabilities).toContain("live-cli-emulator");

    const docs = await fetch(`${baseUrl}/api/v1/docs`);
    expect(docs.status).toBe(200);
    expect(await docs.text()).toContain("NetTopo AI 2.0 API Reference");
  });

  it("supports Guest Mode project CRUD + revisions and isolates guests, then adopts projects on registration", async () => {
    const genRes = await fetch(`${baseUrl}/api/v1/topology/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "1 router, 1 switch, 1 server, 4 PCs, 2 cameras with VLAN and OSPF" }),
    });
    expect(genRes.status).toBe(200);
    const generated = await genRes.json();
    expect(generated.devices.length).toBeGreaterThan(5);
    expect(generated.acls.length).toBeGreaterThan(0);

    // Save in Guest A
    const guestA = { "Content-Type": "application/json", "X-NetTopo-Guest": signGuestSession("guest-alpha-12345") };
    const guestB = { "Content-Type": "application/json", "X-NetTopo-Guest": signGuestSession("guest-bravo-67890") };

    const saveRes = await fetch(`${baseUrl}/api/v1/projects`, {
      method: "POST",
      headers: guestA,
      body: JSON.stringify({
        name: "Campus Core",
        topology: { devices: generated.devices, connections: generated.connections, layout: generated.layout },
        plan: generated.network_plan,
        acls: generated.acls,
      }),
    });
    expect(saveRes.status).toBe(201);
    const { project } = await saveRes.json();
    expect(project.revisions).toHaveLength(1);

    // Guest B cannot see Guest A's project
    const listB = await (await fetch(`${baseUrl}/api/v1/projects`, { headers: guestB })).json();
    expect(listB.projects).toHaveLength(0);

    // Append revision 2
    const revRes = await fetch(`${baseUrl}/api/v1/projects/${project.id}/revisions`, {
      method: "POST",
      headers: guestA,
      body: JSON.stringify({ note: "Hardened Zero-Trust" }),
    });
    expect(revRes.status).toBe(201);
    const revBody = await revRes.json();
    expect(revBody.project.revisions).toHaveLength(2);

    // Register account from Guest A -> adopts project automatically!
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: guestA,
      body: JSON.stringify({ email: "engineer@nettopo.ai", password: "Password123!", name: "Mahmoud" }),
    });
    expect(regRes.status).toBe(201);
    const { token, user } = await regRes.json();
    expect(user.email).toBe("engineer@nettopo.ai");

    const authedList = await (
      await fetch(`${baseUrl}/api/v1/projects`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).json();
    expect(authedList.projects).toHaveLength(1);
    expect(authedList.projects[0].id).toBe(project.id);
  });

  it("executes packet trace, attack path, traffic forecast, security audit, BOM, CLI, Co-Pilot, and verified Lab Pack ZIP", async () => {
    const gen = await (
      await fetch(`${baseUrl}/api/v1/topology/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "1 router, 1 switch, 1 server, 3 PCs, 2 cameras, 1 AP with VLAN" }),
      })
    ).json();

    const base = {
      acknowledgeWarnings: true,
      topology: { devices: gen.devices, connections: gen.connections, layout: gen.layout },
      plan: gen.network_plan,
      acls: gen.acls,
    };

    const trace = await (
      await fetch(`${baseUrl}/api/v1/simulate/packet-trace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, sourceId: "PC1", destinationId: "SRV1", protocol: "TCP", port: 443 }),
      })
    ).json();
    expect(trace.reachable).toBe(true);

    const cli = await (
      await fetch(`${baseUrl}/api/v1/simulate/cli`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...base, deviceId: "R1", command: "show ip interface brief" }),
      })
    ).json();
    expect(cli.ok).toBe(true);
    expect(cli.output).toContain("GigabitEthernet0/0");

    const audit = await (
      await fetch(`${baseUrl}/api/v1/audit/security`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(base),
      })
    ).json();
    expect(audit.overallScore).toBeGreaterThanOrEqual(0);
    expect(audit.pillars).toHaveLength(4);

    const bom = await (
      await fetch(`${baseUrl}/api/v1/bom/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topology: base.topology }),
      })
    ).json();
    expect(bom.tiers).toHaveLength(3);
    expect(bom.poe.requiredWatts).toBeGreaterThan(0);

    const labPackRes = await fetch(`${baseUrl}/api/v1/exports/lab-pack`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/zip" },
      body: JSON.stringify({ name: "grad-demo", ...base }),
    });
    expect(labPackRes.status).toBe(200);
    const zip = unzipSync(new Uint8Array(await labPackRes.arrayBuffer()));
    expect(zip["cisco/combined-ios.cfg"]).toBeDefined();
    expect(zip["mikrotik/routeros-v7.rsc"]).toBeDefined();
    expect(zip["juniper/junos-set.conf"]).toBeDefined();
    expect(zip["ansible/hosts.yml"]).toBeDefined();
    const manifest = JSON.parse(Buffer.from(zip["manifest.json"]).toString("utf8"));
    for (const file of manifest.files) {
      const actual = createHash("sha256").update(zip[file.name]).digest("hex");
      expect(actual).toBe(file.sha256);
    }
  });
});
