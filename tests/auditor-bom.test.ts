// @vitest-environment node
import { describe, expect, it } from "vitest";
import { auditSecurityResilience, autoRemediateTopology, generateZeroTrustAcls } from "@/lib/network-engine/auditor";
import { estimateBomAndPoe } from "@/lib/network-engine/bom";
import { planNetwork } from "@/lib/network-engine/planner";
import { buildTopology } from "@/lib/network-engine/topology-builder";

describe("Zero-Trust Security Auditor, Auto-Remediation & BOM/PoE Estimator", () => {
  it("scores weak topologies low and boosts score dramatically after one-click Auto-Remediation", () => {
    const weakTopo = buildTopology({
      devices: [
        { type: "ROUTER", count: 1 },
        { type: "SWITCH", count: 1 },
        { type: "SERVER", count: 1 },
        { type: "PC", count: 4 },
        { type: "AP", count: 1 },
      ],
      options: { vlan: false },
    });
    const weakPlan = planNetwork(weakTopo);
    const before = auditSecurityResilience(weakTopo, weakPlan, []);
    expect(before.overallScore).toBeLessThan(75);
    expect(before.findings.some((f) => f.id === "find-no-firewall")).toBe(true);

    const fixed = autoRemediateTopology(weakTopo, weakPlan);
    expect(fixed.acls.length).toBeGreaterThan(0);
    expect(fixed.topology.devices.some((d) => d.type === "FIREWALL")).toBe(true);
    expect(fixed.topology.devices.filter((d) => d.type === "ROUTER").length).toBe(2);

    const after = auditSecurityResilience(fixed.topology, fixed.plan, fixed.acls);
    expect(after.overallScore).toBeGreaterThan(before.overallScore);
    expect(after.overallScore).toBeGreaterThanOrEqual(85);
  });

  it("generates Zero-Trust ACL rules protecting Servers, Wi-Fi, Cameras, and Management VLAN 99", () => {
    const topo = buildTopology({
      devices: [
        { type: "ROUTER", count: 1 },
        { type: "SWITCH", count: 1 },
        { type: "SERVER", count: 1 },
        { type: "PC", count: 2 },
        { type: "AP", count: 1 },
        { type: "CAMERA", count: 1 },
      ],
      options: { vlan: true },
    });
    const plan = planNetwork(topo, undefined, { vlan: true });
    const acls = generateZeroTrustAcls(plan);
    expect(acls.some((r) => r.sourceVlan === 60 && r.destinationVlan === 20 && r.action === "deny")).toBe(true);
    expect(acls.some((r) => r.destinationVlan === 99 && r.action === "deny")).toBe(true);
  });

  it("estimates PoE power budgets, detects overload, and compares 3 ascending cost tiers", () => {
    const topo = buildTopology({
      devices: [
        { type: "ROUTER", count: 1 },
        { type: "SWITCH", count: 1 },
        { type: "AP", count: 16 }, // 16 * 25.5W = 408W > 370W single switch budget!
        { type: "CAMERA", count: 4 },
      ],
      options: { vlan: true },
    });
    const report = estimateBomAndPoe(topo);
    expect(report.poe.requiredWatts).toBeGreaterThan(370);
    expect(report.poe.overloaded).toBe(true);

    const [budget, enterprise, ha] = report.tiers;
    expect(budget.totalUsd).toBeLessThan(enterprise.totalUsd);
    expect(enterprise.totalUsd).toBeLessThan(ha.totalUsd);
    expect(report.csv).toContain("Category,SKU,Description");
  });
});
