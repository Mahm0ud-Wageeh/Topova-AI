// @vitest-environment node
import { describe, expect, it } from "vitest";
import { exportCisco } from "./api-harness";
import { planBranch } from "@/lib/design/branch";
import { reviewBranchChange } from "@/lib/design/change";
import { ciscoExample } from "@/lib/design/cisco-example";
import { importCiscoBranch } from "@/lib/design/cisco-import";
import { branchExample } from "@/lib/design/example";
import { createSnapshot } from "@/lib/design/snapshot";
import { assignAddressing, generateCiscoConfigs } from "@/lib/network-engine/cisco";
import { allocateSubnets } from "@/lib/network-engine/ip-planner";
import { ruleParse } from "@/lib/network-engine/parser/rule-parser";
import { planNetwork } from "@/lib/network-engine/planner";
import { buildTopology } from "@/lib/network-engine/topology-builder";
import { planVlans } from "@/lib/network-engine/vlan-planner";
import { updateProjectSchema } from "@/lib/validators/schemas";

describe("network engine bug-fix regressions", () => {
  it("maps VLSM subnets to the matching VLAN and reserves gateway IPs without broadcast overflow", () => {
    const topo = buildTopology({
      devices: [
        { type: "ROUTER", count: 1 },
        { type: "SWITCH", count: 1 },
        { type: "PC", count: 2 },
        { type: "SERVER", count: 10 },
        { type: "AP", count: 1 },
        { type: "PRINTER", count: 1 },
        { type: "CAMERA", count: 1 },
      ],
      options: { vlan: true },
    });

    const vlans = planVlans(topo.devices);
    const servers = vlans.find((v) => v.id === 20);
    const users = vlans.find((v) => v.id === 10);
    const wifi = vlans.find((v) => v.id === 60);
    const printers = vlans.find((v) => v.id === 30);
    const cameras = vlans.find((v) => v.id === 40);

    expect(servers?.subnet).toBe("10.0.0.0/28"); // 10 servers + 1 gateway = 11 -> /28
    expect(users?.subnet).toMatch(/\/29$/);      // 2 PCs + 1 gateway = 3 -> /29 (never /30!)
    expect(wifi).toBeDefined();
    expect(printers).toBeDefined();
    expect(cameras).toBeDefined();

    const plan = planNetwork(topo, undefined, { vlan: true, routingProtocol: "OSPF" });
    expect(plan.ipPlan.base).toBe("10.0.0.0/16");
    for (const subnet of plan.ipPlan.subnets) {
      expect(subnet.mask).not.toBe("");
      expect(subnet.range).not.toBe("");
    }

    const addressing = assignAddressing(topo, plan);
    const assignedIps = Object.values(addressing.byDevice).flatMap((d) => d.interfaces.map((i) => i.ip));
    expect(new Set(assignedIps).size).toBe(assignedIps.length); // zero duplicate IPs across devices

    const cisco = generateCiscoConfigs(topo, plan, addressing);
    const swCli = cisco.configs.find((c) => c.type === "SWITCH")!.cli;
    expect(swCli).toContain("vlan 60");
    expect(swCli).toContain("switchport access vlan 60");
    expect(swCli).toContain("switchport access vlan 30");
    expect(swCli).toContain("switchport access vlan 40");
  });

  it("handles empty network plans safely without crashing assignAddressing or generateCiscoConfigs", () => {
    const topo = buildTopology({ devices: [{ type: "ROUTER", count: 1 }], options: { vlan: false } });
    const emptyPlan = {
      ipPlan: { base: "", subnets: [] },
      vlanPlan: [],
      routing: { protocol: "STATIC", routes: [] },
      notes: [],
    };
    const addressing = assignAddressing(topo, emptyPlan);
    expect(addressing.subnets).toEqual([]);
    const exported = generateCiscoConfigs(topo, emptyPlan, addressing);
    expect(exported.configs).toHaveLength(1);
  });

  it("emits gateway DHCP exclusion in flat mode and clamps VLAN exclusions inside the subnet", () => {
    const flatTopo = buildTopology({ devices: [{ type: "ROUTER", count: 1 }, { type: "PC", count: 2 }], options: { vlan: false } });
    const flatPlan = planNetwork(flatTopo);
    const flatCli = generateCiscoConfigs(flatTopo, flatPlan).configs[0].cli;
    expect(flatCli).toContain("ip dhcp excluded-address 192.168.0.1");

    const vlanTopo = buildTopology({
      devices: [{ type: "ROUTER", count: 1 }, { type: "PC", count: 1 }, { type: "SERVER", count: 1 }],
      options: { vlan: true },
    });
    const vlanPlan = planNetwork(vlanTopo, undefined, { vlan: true });
    const routerCli = generateCiscoConfigs(vlanTopo, vlanPlan).configs[0].cli;
    expect(routerCli).not.toContain("ip dhcp excluded-address 10.0.0.1 10.0.0.5");
    expect(routerCli).toContain("ip dhcp excluded-address 10.0.0.1\n");
  });

  it("aligns allocated VLSM blocks on unaligned base IPs", () => {
    const subnets = allocateSubnets("192.168.1.0", [{ name: "large", hosts: 300 }]);
    expect(subnets[0].cidr).toBe("192.168.2.0/23");
  });

  it("respects explicit vlan and routingProtocol options in planNetwork", () => {
    const topo = buildTopology({ devices: [{ type: "ROUTER", count: 1 }, { type: "PC", count: 5 }], options: { vlan: true, routingProtocol: "EIGRP" } });
    const plan = planNetwork(topo, undefined, { vlan: true, routingProtocol: "EIGRP" });
    expect(plan.vlanPlan.length).toBeGreaterThan(0);
    expect(plan.routing.protocol).toBe("EIGRP");
  });

  it("deduplicates repeated device types from AI intents into unique IDs", () => {
    const topo = buildTopology({
      devices: [{ type: "SWITCH", count: 3 }, { type: "SWITCH", count: 8 }],
      options: { vlan: false },
    });
    const ids = topo.devices.map((d) => d.id);
    expect(ids).toHaveLength(11);
    expect(new Set(ids).size).toBe(11);
    expect(ids[0]).toBe("SW1");
    expect(ids[10]).toBe("SW11");
  });
});

describe("ruleParse bug-fix regressions", () => {
  it("caps extreme counts to prevent OOM DoS", () => {
    const intent = ruleParse("99999999 routers and 99999999 pcs");
    const total = intent.devices.reduce((sum, d) => sum + d.count, 0);
    expect(total).toBeLessThanOrEqual(500);
  });

  it("parses printers, cameras, NVRs, IP phones, mixed singular/plural, and Arabic hamza/isolation", () => {
    const en = ruleParse("1 core router and 2 branch routers, 1 printer, 4 cameras, 1 NVR, 2 IP phones");
    expect(en.devices.find((d) => d.type === "ROUTER")?.count).toBe(3);
    expect(en.devices.find((d) => d.type === "PRINTER")?.count).toBe(1);
    expect(en.devices.find((d) => d.type === "CAMERA")?.count).toBe(4);
    expect(en.devices.find((d) => d.type === "NVR")?.count).toBe(1);
    expect(en.devices.find((d) => d.type === "IP_PHONE")?.count).toBe(2);

    const ar = ruleParse("أربع أجهزة وطابعة مع عزل الشبكة");
    expect(ar.devices.find((d) => d.type === "PC")?.count).toBe(4);
    expect(ar.devices.find((d) => d.type === "PRINTER")?.count).toBe(1);
    expect(ar.options.vlan).toBe(true);
  });

  it("does not misclassify words containing 'rip' such as 'description' as RIP routing", () => {
    const intent = ruleParse("A network description with encryption, 1 router and 2 PCs");
    expect(intent.options.routingProtocol).toBeUndefined();
  });
});

describe("validators, branch review & Cisco export regressions", () => {
  it("does not inject default source into partial project updates", () => {
    const parsed = updateProjectSchema.parse({ name: "Renamed" });
    expect(parsed).toEqual({ name: "Renamed" });
    expect("source" in parsed).toBe(false);
  });

  it("rejects reserved Cisco VLANs in reviewBranchChange and cisco-import", () => {
    const plan = planBranch(branchExample);
    const option = plan.alternatives[0];
    if (!option.feasible) throw new Error("Expected feasible alternative");
    const snapshot = createSnapshot(plan, option);
    expect(() =>
      reviewBranchChange({
        snapshot,
        segment: { id: "legacy", label: "Legacy", vlanId: 1002, endpointAddresses: 4, accessPorts: 2, switchId: "sw1" },
      }),
    ).toThrow(/reserved/i);

    expect(() =>
      importCiscoBranch({
        ...ciscoExample,
        routerConfig: ciscoExample.routerConfig + "\ninterface GigabitEthernet0/0.1002\n encapsulation dot1Q 1002\n ip address 10.50.0.65 255.255.255.248\n no shutdown\n!",
      }),
    ).toThrow();
  });

  it("honors complex Accept headers for JSON base64 Cisco ZIP export", async () => {
    const response = await exportCisco(
      new Request("http://localhost/api/v1/cisco-exports", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*;q=0.8",
        },
        body: JSON.stringify({ input: branchExample, alternativeId: "single-switch", profile: "packet-tracer-2960" }),
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.encoding).toBe("base64");
  });
});
