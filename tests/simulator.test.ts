// @vitest-environment node
import { describe, expect, it } from "vitest";
import { planNetwork } from "@/lib/network-engine/planner";
import { analyzeSpof, tracePacket } from "@/lib/network-engine/simulator";
import { buildTopology, computeLayout } from "@/lib/network-engine/topology-builder";
import type { AclRule } from "@/lib/network-engine/types";

describe("Packet Flow, Chaos Fault Injection & Tarjan SPOF simulator", () => {
  const topo = buildTopology({
    devices: [
      { type: "ROUTER", count: 1 },
      { type: "SWITCH", count: 1 },
      { type: "SERVER", count: 1 },
      { type: "PC", count: 2 },
    ],
    options: { vlan: true, routingProtocol: "OSPF" },
  });
  const plan = planNetwork(topo, undefined, { vlan: true, routingProtocol: "OSPF" });

  it("identifies articulation points and bridge links via Tarjan algorithm", () => {
    const spof = analyzeSpof(topo, plan);
    expect(spof.criticalDevices).toContain("SW1");
    expect(spof.redundancyScore).toBeLessThan(80);
    expect(spof.connectedRatio).toBe(1);
    expect(spof.suggestions.length).toBeGreaterThan(0);
  });

  it("traces inter-VLAN packets through the router-on-a-stick gateway and decrements TTL", () => {
    const trace = tracePacket(topo, plan, {
      sourceId: "PC1",
      destinationId: "SRV1",
      protocol: "TCP",
      port: 443,
    });
    expect(trace.reachable).toBe(true);
    expect(trace.verdict).toBe("delivered");
    expect(trace.hops.some((h) => h.deviceId === "R1" && h.action === "route")).toBe(true);
    expect(trace.hops[trace.hops.length - 1].ttl).toBe(63);
  });

  it("enforces Zero-Trust ACL rules during packet tracing", () => {
    const denyRule: AclRule = {
      id: "deny-users-servers",
      name: "BLOCK-USERS-TO-SERVERS",
      action: "deny",
      protocol: "tcp",
      sourceVlan: 10,
      destinationVlan: 20,
      port: 22,
      description: "Block SSH from Users VLAN to Servers VLAN",
    };
    const trace = tracePacket(topo, plan, {
      sourceId: "PC1",
      destinationId: "SRV1",
      protocol: "TCP",
      port: 22,
      acls: [denyRule],
    });
    expect(trace.reachable).toBe(false);
    expect(trace.verdict).toBe("blocked-by-acl");
    expect(trace.blockedByRuleId).toBe("deny-users-servers");
  });

  it("models Chaos Mode link cuts with accurate blast radius and dropped packets", () => {
    const routerLink = topo.connections.find((c) => c.from === "R1" || c.to === "R1")!;
    const spof = analyzeSpof(topo, plan, { disabledDevices: [], disabledLinks: [routerLink.id] });
    expect(spof.unreachableDevices).toContain("PC1");
    expect(spof.unreachableDevices).toContain("SRV1");
    expect(spof.connectedRatio).toBeLessThan(0.5);

    const trace = tracePacket(topo, plan, {
      sourceId: "PC1",
      destinationId: "SRV1",
      protocol: "ICMP",
      faults: { disabledDevices: [], disabledLinks: [routerLink.id] },
    });
    expect(trace.reachable).toBe(false);
    expect(trace.verdict).toBe("fault-dropped");
  });

  it("handles empty/single-device topologies and computes all 3 layout modes safely", () => {
    const empty = { devices: [], connections: [] };
    const emptyPlan = planNetwork(empty);
    expect(analyzeSpof(empty, emptyPlan).connectedRatio).toBe(1);
    expect(Object.keys(computeLayout(topo.devices, topo.connections, "tree"))).toHaveLength(topo.devices.length);
    expect(Object.keys(computeLayout(topo.devices, topo.connections, "radial"))).toHaveLength(topo.devices.length);
    expect(Object.keys(computeLayout(topo.devices, topo.connections, "tiered"))).toHaveLength(topo.devices.length);
  });
});
