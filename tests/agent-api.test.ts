// @vitest-environment node
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { unzipSync } from "fflate";
import { createApp } from "../backend/src/app";
import { LocalJsonStore } from "../backend/src/storage/local-store";
import { buildTopology, generateZeroTrustAcls, planNetwork } from "@/lib/network-engine";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Gemini AI Agent & Cisco Native Export Endpoints", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void> = async () => {};
  let tempDir = "";

  const topology = buildTopology({
    devices: [
      { type: "ROUTER", count: 1 },
      { type: "SWITCH", count: 1 },
      { type: "SERVER", count: 1 },
      { type: "PC", count: 2 },
      { type: "CAMERA", count: 2 },
    ],
    options: { vlan: false, routingProtocol: "STATIC" },
  });
  const plan = planNetwork(topology, undefined, { vlan: false, routingProtocol: "STATIC" });
  const acls = generateZeroTrustAcls(plan);

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "nettopo-agent-test-"));
    const store = new LocalJsonStore(join(tempDir, "store.json"));
    const { app } = createApp({ store, disableRateLimit: true });
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    closeServer = () => new Promise((resolve) => server.close(() => resolve()));
  });

  afterAll(async () => {
    await closeServer();
    rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("reports white-label agent status, work modes, and 8 engineering tools without leaking providers", async () => {
    const res = await fetch(`${baseUrl}/api/v1/agent/status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ready).toBe(true);
    expect(data.engineLabel).toBe("Topova Intelligence");
    expect(JSON.stringify(data).toLowerCase()).not.toContain("gemini");
    expect(JSON.stringify(data).toLowerCase()).not.toContain("google");
    expect(Array.isArray(data.modes)).toBe(true);
    expect(data.tools.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining([
        "generate_topology",
        "modify_topology",
        "run_security_audit",
        "auto_remediate_network",
        "trace_packet_flow",
        "simulate_cyber_attack",
        "estimate_bom_and_poe",
        "run_device_cli",
      ]),
    );
  });

  it("executes agent tools reliably with thinking steps & follow-up suggestions when offline", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");

    // 1. Auto-remediation in Arabic
    const fixRes = await fetch(`${baseUrl}/api/v1/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "أصلح الشبكة تلقائياً وأمنها",
        state: { topology, plan, acls },
      }),
    });
    expect(fixRes.status).toBe(200);
    const fixData = await fixRes.json();
    expect(fixData.engineLabel).toBe("Topova Intelligence");
    expect(JSON.stringify(fixData).toLowerCase()).not.toContain("gemini");
    expect(Array.isArray(fixData.thinkingSteps)).toBe(true);
    expect(fixData.thinkingSteps.length).toBeGreaterThan(0);
    expect(Array.isArray(fixData.followUpSuggestions)).toBe(true);
    expect(fixData.mutated).toBe(true);
    expect(fixData.nextState.topology.devices.some((d: { type: string }) => d.type === "FIREWALL")).toBe(true);
    expect(fixData.toolCalls[0].name).toBe("auto_remediate_network");

    // 2. Live CLI command via agent
    const cliRes = await fetch(`${baseUrl}/api/v1/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "show ip interface brief",
        state: { topology, plan, acls },
      }),
    });
    expect(cliRes.status).toBe(200);
    const cliData = await cliRes.json();
    expect(cliData.cliOutput?.command).toContain("show ip interface brief");
    expect(cliData.cliOutput?.output).toContain("GigabitEthernet0/0");
  });

  it("exports Cisco CML (.yaml), GNS3 (.gns3), and Packet Tracer Ready Pack (.zip)", async () => {
    const body = JSON.stringify({ name: "Branch Core", topology, plan, acls, acknowledgeWarnings: true });

    // CML YAML
    const cmlRes = await fetch(`${baseUrl}/api/v1/exports/cml`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
    });
    expect(cmlRes.status).toBe(200);
    const cmlData = await cmlRes.json();
    expect(cmlData.filename).toBe("branch-core-cisco-cml.yaml");
    expect(cmlData.content).toContain("node_definition: iosv");

    // GNS3 JSON
    const gnsRes = await fetch(`${baseUrl}/api/v1/exports/gns3`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
    });
    expect(gnsRes.status).toBe(200);
    const gnsData = await gnsRes.json();
    expect(gnsData.filename).toBe("branch-core.gns3");
    const parsedGns = JSON.parse(gnsData.content);
    expect(parsedGns.version).toBe("2.2.49");

    // Packet Tracer ZIP Pack
    const ptRes = await fetch(`${baseUrl}/api/v1/exports/packet-tracer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
    });
    expect(ptRes.status).toBe(200);
    const ptData = await ptRes.json();
    expect(ptData.filename).toContain("packet-tracer-pack.zip");
    const files = unzipSync(Uint8Array.from(Buffer.from(ptData.archive, "base64")));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        "packet-tracer-build-guide.html",
        "cabling-matrix.csv",
        "configs/r1-startup.cfg",
        "cli-paste/r1-paste.txt",
        "cisco-cml/branch-core.yaml",
        "gns3/branch-core.gns3",
      ]),
    );
  });
});
