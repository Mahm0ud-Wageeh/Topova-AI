import { describe, expect, it } from "vitest";
import { executeAgentTool, type MutableContext } from "../backend/lib/ai/agent-tools";
import { createDefaultAgentState } from "../backend/lib/ai/agent";

function ctx(): MutableContext {
  const s = createDefaultAgentState();
  return {
    ...s,
    faults: s.faults ?? { disabledDevices: [], disabledLinks: [] },
    mutated: false,
    toolCalls: [],
    thinkingSteps: [],
  };
}

describe("OR agent tools", () => {
  it("generate_topology attaches a deterministic verification block", () => {
    const c = ctx();
    const r = executeAgentTool(
      "generate_topology",
      { devices: [{ type: "ROUTER", count: 1 }, { type: "SWITCH", count: 2 }, { type: "PC", count: 6 }] },
      c,
      false,
    );
    const v = r.verification as { failed: number; issues: { check: string; oneClickFix?: { tool: string } }[] };
    expect(v.failed).toBeGreaterThan(0);
    expect(v.issues.find((i) => i.check === "n1-failover")?.oneClickFix?.tool).toBe("eliminate_spofs");
  });

  it("eliminate_spofs removes bridges and the follow-up N-1 check improves", () => {
    const c = ctx();
    executeAgentTool("generate_topology", { devices: [{ type: "ROUTER", count: 1 }, { type: "SWITCH", count: 3 }, { type: "PC", count: 3 }] }, c, false);
    const before = c.topology.connections.length;
    const r = executeAgentTool("eliminate_spofs", {}, c, false);
    expect(r.bridgesAfter).toBe(0);
    expect(c.topology.connections.length).toBeGreaterThan(before);
    expect(c.mutated).toBe(true);
  });

  it("optimize_architecture applies the chosen Pareto design", () => {
    const c = ctx();
    const r = executeAgentTool(
      "optimize_architecture",
      { pcs: 40, servers: 2, aps: 4, cameras: 4, phones: 10, budgetUsd: 60000, targetAvailability: 0.9999, apply: "max-resilience" },
      c,
      true,
    );
    expect(r.ok).toBe(true);
    expect(r.applied).toBe("max-resilience");
    expect(c.topology.devices.some((d) => d.type === "FIREWALL")).toBe(true);
  });

  it("optimize_hardware, pack_vlsm, lookup and capacity tools return exact data", () => {
    const c = ctx();
    expect(executeAgentTool("optimize_hardware", { ports: 48, poePorts: 20, poeWatts: 300 }, c, false).ok).toBe(true);
    const v = executeAgentTool("pack_vlsm", { parent: "10.0.0.0/16", requirements: [{ name: "A", hosts: 100 }, { name: "B", hosts: 20 }] }, c, false);
    expect((v.proof as { overlapFree: boolean }).overlapFree).toBe(true);
    const l = executeAgentTool("lookup_engineering_spec", { query: "OM4 40G distance" }, c, false);
    expect((l.matches as { id: string }[])[0].id).toBe("cabling");
    expect(executeAgentTool("analyze_capacity_n1", {}, c, false).ok).toBe(false); // no topology yet
  });
});
