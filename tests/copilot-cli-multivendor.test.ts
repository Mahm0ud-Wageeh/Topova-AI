// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateZeroTrustAcls } from "@/lib/network-engine/auditor";
import { executeCliCommand } from "@/lib/network-engine/cli-emulator";
import { applyCopilotInstruction } from "@/lib/network-engine/copilot";
import { generateMultiVendorConfigs } from "@/lib/network-engine/multi-vendor";
import { planNetwork } from "@/lib/network-engine/planner";
import { buildTopology } from "@/lib/network-engine/topology-builder";

describe("Conversational Co-Pilot, Live CLI Emulator & Multi-Vendor Config Generator", () => {
  const baseTopo = buildTopology({
    devices: [
      { type: "ROUTER", count: 1 },
      { type: "SWITCH", count: 1 },
      { type: "SERVER", count: 1 },
      { type: "PC", count: 2 },
    ],
    options: { vlan: true, routingProtocol: "STATIC" },
  });
  const basePlan = planNetwork(baseTopo, undefined, { vlan: true, routingProtocol: "STATIC" });

  it("applies Arabic & English Co-Pilot mutations with accurate before/after diff", () => {
    const added = applyCopilotInstruction(
      { topology: baseTopo, plan: basePlan, acls: [] },
      "أضف 3 كاميرات و firewall وفعّل OSPF",
    );
    expect(added.diff.addedDevices.filter((d) => d.type === "CAMERA")).toHaveLength(3);
    expect(added.diff.addedDevices.some((d) => d.type === "FIREWALL")).toBe(true);
    expect(added.nextState.plan.routing.protocol).toBe("OSPF");
    expect(added.diff.routingChange).toBe("STATIC -> OSPF");

    const removed = applyCopilotInstruction(added.nextState, "remove 2 cameras");
    expect(removed.diff.removedDevices).toHaveLength(2);
    expect(removed.nextState.topology.devices.filter((d) => d.type === "CAMERA")).toHaveLength(1);
  });

  it("runs live CLI commands including show ip interface brief, show vlan brief, and fault-aware ping", () => {
    const acls = generateZeroTrustAcls(basePlan);
    const showInt = executeCliCommand({ topology: baseTopo, plan: basePlan, acls }, "R1", "show ip interface brief");
    expect(showInt.ok).toBe(true);
    expect(showInt.output).toContain("GigabitEthernet0/0.10");

    const showVlan = executeCliCommand({ topology: baseTopo, plan: basePlan, acls }, "SW1", "show vlan brief");
    expect(showVlan.ok).toBe(true);
    expect(showVlan.output).toContain("USERS");

    const pingOk = executeCliCommand({ topology: baseTopo, plan: basePlan }, "PC1", "ping SRV1");
    expect(pingOk.ok).toBe(true);
    expect(pingOk.output).toContain("!!!!!");

    // Cut the link to R1 in Chaos Mode -> inter-VLAN ping fails live!
    const routerLink = baseTopo.connections.find((c) => c.from === "R1" || c.to === "R1")!;
    const pingFail = executeCliCommand(
      { topology: baseTopo, plan: basePlan, faults: { disabledDevices: [], disabledLinks: [routerLink.id] } },
      "PC1",
      "ping SRV1",
    );
    expect(pingFail.ok).toBe(false);
    expect(pingFail.output).toContain("0 percent");
  });

  it("renders valid Cisco IOS, MikroTik RouterOS, Juniper Junos, and Ansible Inventory with ACLs", () => {
    const acls = generateZeroTrustAcls(basePlan);
    const out = generateMultiVendorConfigs(baseTopo, basePlan, acls);
    expect(out.cisco.combined).toContain("ip access-list extended NETTOPO-ZERO-TRUST");
    expect(out.mikrotik).toContain("/interface vlan add");
    expect(out.mikrotik).toContain("/ip firewall filter add");
    expect(out.junos).toContain("set firewall family inet filter ZERO-TRUST");
    expect(out.ansibleInventory).toContain("ansible_host:");
  });
});
