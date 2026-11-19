// @vitest-environment node
import { describe, expect, it } from "vitest";
import { simulateAttackPath } from "@/lib/network-engine/attack-sim";
import { autoRemediateTopology } from "@/lib/network-engine/auditor";
import { planNetwork } from "@/lib/network-engine/planner";
import { buildTopology } from "@/lib/network-engine/topology-builder";
import { forecastTraffic } from "@/lib/network-engine/traffic";

describe("Red-Team Attack-Path & Traffic Load Forecaster", () => {
  it("exposes critical assets on a flat unfirewalled network and contains them after Zero-Trust remediation", () => {
    const flatTopo = buildTopology({
      devices: [
        { type: "ROUTER", count: 1 },
        { type: "SWITCH", count: 1 },
        { type: "SERVER", count: 1 },
        { type: "CAMERA", count: 2 },
        { type: "PC", count: 2 },
      ],
      options: { vlan: false },
    });
    const flatPlan = planNetwork(flatTopo);

    const before = simulateAttackPath(flatTopo, flatPlan, "CAM1");
    expect(before.contained).toBe(false);
    expect(before.exposedCriticalAssets).toContain("SRV1");
    expect(before.blastRadiusPercent).toBeGreaterThan(0);

    const fixed = autoRemediateTopology(flatTopo, flatPlan);
    const after = simulateAttackPath(fixed.topology, fixed.plan, "CAM1", fixed.acls);
    expect(after.contained).toBe(true);
    expect(after.exposedCriticalAssets).toHaveLength(0);
    expect(after.blastRadiusPercent).toBe(0);
  });

  it("forecasts link utilization and flags bottlenecks under heavy surveillance stress", () => {
    const topo = buildTopology({
      devices: [
        { type: "ROUTER", count: 1 },
        { type: "SWITCH", count: 1 },
        { type: "NVR", count: 1 },
        { type: "CAMERA", count: 12 },
      ],
      options: { vlan: true },
    });
    const plan = planNetwork(topo, undefined, { vlan: true });

    const normal = forecastTraffic(topo, plan, "surveillance", 1);
    const stress = forecastTraffic(topo, plan, "surveillance", 4);
    expect(stress.totalDemandMbps).toBeGreaterThan(normal.totalDemandMbps);
    expect(stress.congestedLinks).toBeGreaterThan(0);
    expect(stress.links.some((l) => l.status === "congested" && Boolean(l.recommendation))).toBe(true);
  });

  it("handles 0-link topologies cleanly without NaN or crashes", () => {
    const solo = { devices: [{ id: "R1", label: "R1", type: "ROUTER" as const }], connections: [] };
    const plan = planNetwork(solo);
    expect(simulateAttackPath(solo, plan, "R1").contained).toBe(true);
    expect(forecastTraffic(solo, plan, "office", 2).peakUtilizationPercent).toBe(0);
  });
});
