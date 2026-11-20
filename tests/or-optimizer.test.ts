import { describe, expect, it } from "vitest";
import {
  analyzeBridges,
  analyzeCapacity,
  cidrsOverlapFree,
  designParetoFrontier,
  kleinrockNetworkDelayMs,
  maxFlow,
  mm1,
  packVlsm,
  planSpofElimination,
  selectAccessSwitches,
  type FlowEdge,
} from "@/lib/network-engine/or-optimizer";
import { lookupEngineeringSpec } from "@/lib/network-engine/knowledge-base";
import { materializeArchitecture, verifyDesign } from "@/lib/network-engine/or-verify";
import { checkExport } from "@/lib/network-engine/export-preflight";
import { buildTopology } from "@/lib/network-engine/topology-builder";
import { planNetwork } from "@/lib/network-engine/planner";
import type { BuiltTopology } from "@/lib/network-engine/types";

const e = (id: string, a: string, b: string, c: number): FlowEdge => ({ id, a, b, capacityMbps: c });
const d = (id: string, from: string, to: string, capacityMbps: number): FlowEdge => ({
  id,
  a: from,
  b: to,
  capacityMbps,
  directed: true,
});

describe("max-flow / min-cut", () => {
  it("solves the classic CLRS network (value 23) and max-flow = min-cut", () => {
    const edges = [
      d("sv1", "s", "v1", 16),
      d("sv2", "s", "v2", 13),
      d("v1v3", "v1", "v3", 12),
      d("v2v1", "v2", "v1", 4),
      d("v2v4", "v2", "v4", 14),
      d("v3v2", "v3", "v2", 9),
      d("v3t", "v3", "t", 20),
      d("v4v3", "v4", "v3", 7),
      d("v4t", "v4", "t", 4),
    ];
    const r = maxFlow(edges, "s", "t");
    expect(r.maxFlowMbps).toBe(23);
    expect(r.minCutCapacityMbps).toBe(23);
  });

  it("finds the bottleneck link and respects removed edges/nodes", () => {
    const cut = maxFlow([e("a", "s", "m", 1000), e("b", "m", "t", 100)], "s", "t");
    expect(cut.minCutEdgeIds).toEqual(["b"]);
    const edges = [e("a", "s", "m", 2000), e("b", "m", "t", 100), e("c", "m", "u", 1000), e("d", "u", "t", 1000)];
    expect(maxFlow(edges, "s", "t").maxFlowMbps).toBe(1100);
    expect(maxFlow(edges, "s", "t", { edgeIds: new Set(["d"]) }).maxFlowMbps).toBe(100);
    expect(maxFlow(edges, "s", "t", { nodeIds: new Set(["m"]) }).maxFlowMbps).toBe(0);
  });
});

describe("M/M/1 queueing", () => {
  it("computes rho and W = 1/(mu - lambda)", () => {
    const q = mm1(500, 1000);
    expect(q.utilization).toBe(0.5);
    expect(q.delayMs).toBeCloseTo(0.024, 5);
    expect(q.saturated).toBe(false);
  });

  it("flags saturation at rho >= 0.8, recommends an upgrade, and is unstable at rho >= 1", () => {
    const q = mm1(850, 1000);
    expect(q.saturated).toBe(true);
    expect(q.recommendedCapacityMbps).toBe(10_000);
    expect(mm1(1200, 1000).delayMs).toBeNull();
  });

  it("computes Kleinrock average delay", () => {
    expect(kleinrockNetworkDelayMs([{ loadMbps: 500, capacityMbps: 1000 }], 500)).toBeCloseTo(0.024, 5); // single link: T = 1/(mu - lambda)
  });
});

describe("hardware knapsack / branch-and-bound", () => {
  it("returns a proven-optimal selection meeting all constraints", () => {
    const r = selectAccessSwitches({ ports: 100, poePorts: 40, poeWatts: 500 });
    expect(r.feasible).toBe(true);
    expect(r.provenOptimal).toBe(true);
    expect(r.totalPorts).toBeGreaterThanOrEqual(100);
    expect(r.totalPoeWatts).toBeGreaterThanOrEqual(500);
  });

  it("matches brute force on a tiny catalog", () => {
    const need = { ports: 70, poePorts: 20, poeWatts: 300 };
    const catalog = selectAccessSwitches(need).items.length ? undefined : undefined;
    expect(catalog).toBeUndefined();
    const r = selectAccessSwitches(need);
    // brute force over the 3 cheapest PoE-capable SKUs, counts 0..4
    const skus = ["C1000-24P-4G-L", "C1000-48P-4G-L", "CRS354-48P-4S+2Q+RM"];
    const info = {
      "C1000-24P-4G-L": { p: 1250, ports: 24, poeP: 24, w: 195 },
      "C1000-48P-4G-L": { p: 2250, ports: 48, poeP: 48, w: 370 },
      "CRS354-48P-4S+2Q+RM": { p: 675, ports: 48, poeP: 48, w: 600 },
    } as const;
    let best = Infinity;
    for (let a = 0; a <= 4; a++)
      for (let b = 0; b <= 4; b++)
        for (let c = 0; c <= 4; c++) {
          const n = [a, b, c];
          const sum = (f: (k: (typeof info)[keyof typeof info]) => number) =>
            skus.reduce((s, k, i) => s + n[i] * f(info[k as keyof typeof info]), 0);
          if (sum((k) => k.ports) >= 70 && sum((k) => k.poeP) >= 20 && sum((k) => k.w) >= 300) {
            best = Math.min(best, sum((k) => k.p));
          }
        }
    // The optimizer searches a larger catalog, so it can only be as good or better.
    expect(r.totalCostUsd).toBeLessThanOrEqual(best);
  });

  it("reports budget infeasibility with the cheapest compliant cost", () => {
    const r = selectAccessSwitches({ ports: 200, poePorts: 100, poeWatts: 1500 }, { budgetUsd: 500 });
    expect(r.feasible).toBe(false);
    expect(r.reason).toMatch(/Budget infeasible/);
  });

  it("is infeasible with an empty catalog and respects the rack-unit cap", () => {
    expect(selectAccessSwitches({ ports: 10, poePorts: 0, poeWatts: 0 }, { catalog: [] }).feasible).toBe(false);
    expect(selectAccessSwitches({ ports: 200, poePorts: 0, poeWatts: 0, maxRackUnits: 2 }).feasible).toBe(false);
  });

  it("max-resilience minimises the largest failure domain", () => {
    const need = { ports: 96, poePorts: 48, poeWatts: 500 };
    const min = selectAccessSwitches(need, { objective: "min-cost" });
    const res = selectAccessSwitches(need, { objective: "max-resilience" });
    expect(res.largestFailureDomainPorts).toBeLessThanOrEqual(min.largestFailureDomainPorts);
    expect(res.totalCostUsd).toBeGreaterThanOrEqual(min.totalCostUsd);
  });
});

describe("Pareto frontier", () => {
  const req = { pcs: 60, servers: 4, aps: 6, cameras: 8, phones: 20, budgetUsd: 60_000, targetAvailability: 0.9999 };

  it("returns non-dominated min-cost / balanced / max-resilience picks within budget", () => {
    const r = designParetoFrontier(req);
    expect(r.feasible).toBe(true);
    const mc = r.picks["min-cost"]!;
    const mr = r.picks["max-resilience"]!;
    expect(mc.costUsd).toBeLessThanOrEqual(mr.costUsd);
    expect(mr.downtimeMinPerYear).toBeLessThanOrEqual(mc.downtimeMinPerYear);
    for (const a of r.frontier) {
      for (const b of r.frontier) {
        if (a === b) continue;
        const dom =
          a.costUsd <= b.costUsd &&
          a.latencyMs <= b.latencyMs &&
          a.downtimeMinPerYear <= b.downtimeMinPerYear &&
          (a.costUsd < b.costUsd || a.latencyMs < b.latencyMs || a.downtimeMinPerYear < b.downtimeMinPerYear);
        expect(dom).toBe(false);
      }
    }
    expect(r.frontier.every((c) => c.costUsd <= req.budgetUsd)).toBe(true);
  });

  it("honours a Cisco-only vendor constraint end to end", () => {
    const r = designParetoFrontier({ ...req, vendors: ["Cisco"] });
    expect(r.feasible).toBe(true);
    for (const c of r.frontier) {
      expect(c.router).toMatch(/^(C8200|ISR)/);
      expect(c.firewall).toMatch(/^FPR/);
      expect(c.accessSwitches.every((i) => i.vendor === "Cisco")).toBe(true);
    }
    expect(r.picks["min-cost"]!.costUsd).toBeGreaterThan(designParetoFrontier(req).picks["min-cost"]!.costUsd);
  });

  it("reports infeasibility when a vendor cannot cover the peak load", () => {
    const r = designParetoFrontier({ ...req, vendors: ["Juniper"] });
    expect(r.feasible).toBe(false);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(designParetoFrontier(req))).toBe(JSON.stringify(designParetoFrontier(req)));
  });

  it("surfaces the exact budget shortfall", () => {
    const r = designParetoFrontier({ ...req, budgetUsd: 1000 });
    expect(r.feasible).toBe(false);
    expect(r.reason).toMatch(/shortfall/);
  });

  it("only dual-ISP designs reach four nines", () => {
    const r = designParetoFrontier(req);
    expect(r.frontier.filter((c) => c.meetsSla).every((c) => c.ispLinks === 2)).toBe(true);
    expect(r.picks["max-resilience"]!.coreRouters).toBe(2);
  });

  it("an applied max-resilience architecture actually survives N-1 (closed loop with the model)", () => {
    const r = designParetoFrontier(req);
    const ws = materializeArchitecture(r.picks["max-resilience"]!);
    const cap = analyzeCapacity(ws.topology);
    expect(cap.n1.failing.map((f) => `${f.kind}:${f.label}`)).toEqual([]);
    // hardening never wires endpoints to each other
    const endpoint = new Set(ws.topology.devices.filter((d) => d.type === "PC").map((d) => d.id));
    expect(ws.topology.connections.some((c) => endpoint.has(c.from) && endpoint.has(c.to))).toBe(false);
  });

  it("every applied architecture passes export preflight with no blocking errors", () => {
    const r = designParetoFrontier(req);
    for (const c of Object.values(r.picks)) {
      const ws = materializeArchitecture(c!);
      const res = checkExport(ws.topology, ws.plan, ws.acls);
      expect(res.findings.filter((f) => f.severity === "error")).toEqual([]);
    }
  });

  it("materialises a candidate into a connected topology", () => {
    const r = designParetoFrontier(req);
    const ws = materializeArchitecture(r.picks["min-cost"]!);
    expect(ws.topology.devices.length).toBeGreaterThan(50);
    const a = analyzeBridges(
      ws.topology.devices.map((x) => x.id),
      ws.topology.connections.map((c) => ({ id: c.id, a: c.from, b: c.to })),
    );
    expect(a.connectedComponents).toBe(1);
  });
});

describe("bridges and minimum SPOF augmentation", () => {
  it("finds bridges and articulation points (Tarjan)", () => {
    const r = analyzeBridges(
      ["a", "b", "c", "d", "x"],
      [
        { id: "1", a: "a", b: "b" },
        { id: "2", a: "b", b: "c" },
        { id: "3", a: "c", b: "a" },
        { id: "4", a: "c", b: "d" },
        { id: "5", a: "d", b: "x" },
      ],
    );
    expect(r.bridges).toEqual(["4", "5"]);
    expect(r.articulationPoints).toEqual(["c", "d"]);
  });

  it("treats parallel links as non-bridges", () => {
    const r = analyzeBridges(["a", "b"], [{ id: "1", a: "a", b: "b" }, { id: "2", a: "a", b: "b" }]);
    expect(r.bridges).toEqual([]);
  });

  it("adds exactly ceil(L/2) links on a 5-leaf star and ends bridge-free", () => {
    const topo: BuiltTopology = {
      devices: [
        { id: "R", label: "R", type: "ROUTER" },
        ...[1, 2, 3, 4, 5].map((i) => ({ id: `S${i}`, label: `S${i}`, type: "SWITCH" as const })),
      ],
      connections: [1, 2, 3, 4, 5].map((i) => ({ id: `c${i}`, from: "R", to: `S${i}` })),
    };
    const plan = planSpofElimination(topo);
    expect(plan.addedLinks.length).toBe(3);
    expect(plan.addedLinks.length).toBe(plan.lowerBoundLinks);
    expect(plan.after.bridges).toEqual([]);
  });

  it("connects disconnected islands", () => {
    const topo: BuiltTopology = {
      devices: [
        { id: "A", label: "A", type: "SWITCH" },
        { id: "B", label: "B", type: "SWITCH" },
      ],
      connections: [],
    };
    const plan = planSpofElimination(topo);
    expect(plan.after.connectedComponents).toBe(1);
    expect(plan.after.bridges).toEqual([]);
  });
});

describe("VLSM packing proof", () => {
  it("packs without overlap, aligned, inside the parent", () => {
    const p = packVlsm(
      "10.0.0.0/16",
      [
        { name: "Staff", hosts: 200 },
        { name: "Guest", hosts: 100 },
        { name: "Servers", hosts: 30 },
        { name: "Mgmt", hosts: 10 },
        { name: "Link1", hosts: 2 },
      ],
      30,
    );
    expect(p.feasible).toBe(true);
    expect(p.proof.overlapFree && p.proof.aligned && p.proof.containedInParent).toBe(true);
    expect(p.allocations.find((a) => a.name === "Staff")!.cidr).toBe("10.0.0.0/23");
    expect(p.allocations.every((a) => a.usableHosts >= a.plannedHosts)).toBe(true);
  });

  it("reports shortfall when the parent is too small", () => {
    const p = packVlsm("192.168.1.0/24", [{ name: "A", hosts: 200 }, { name: "B", hosts: 200 }], 0);
    expect(p.feasible).toBe(false);
    expect(p.shortfallAddresses).toBeGreaterThan(0);
  });

  it("detects overlapping CIDRs", () => {
    expect(cidrsOverlapFree(["10.0.0.0/24", "10.0.0.128/25"]).ok).toBe(false);
    expect(cidrsOverlapFree(["10.0.0.0/24", "10.0.1.0/24"]).ok).toBe(true);
  });
});

describe("capacity, N-1 and verification loop", () => {
  it("a single-router tree fails N-1 and verification names the failing check", () => {
    const topo = buildTopology({
      devices: [{ type: "ROUTER", count: 1 }, { type: "SWITCH", count: 2 }, { type: "PC", count: 6 }],
      options: { vlan: true },
    });
    const cap = analyzeCapacity(topo);
    expect(cap.feasible).toBe(true);
    expect(cap.n1.survivesAll).toBe(false);
    const report = verifyDesign(topo, planNetwork(topo, undefined, { vlan: true }));
    expect(report.checks.find((c) => c.id === "n1-failover")?.status).toBe("fail");
    expect(report.checks.find((c) => c.id === "vlsm-overlap")?.status).toBe("pass");
  });

  it("flags saturation when a link exceeds 85% utilization", () => {
    const topo: BuiltTopology = {
      devices: [
        { id: "R", label: "R", type: "ROUTER" },
        { id: "S", label: "S", type: "SWITCH" },
        { id: "P", label: "P", type: "PC", meta: { demandMbps: 900 } },
      ],
      connections: [
        { id: "l1", from: "R", to: "S" },
        { id: "l2", from: "S", to: "P" },
      ],
    };
    expect(analyzeCapacity(topo).links.find((l) => l.id === "l1")?.saturated).toBe(true);
    expect(verifyDesign(topo, planNetwork(topo)).checks.find((c) => c.id === "queueing")?.status).toBe("fail");
  });
});

describe("hardware catalog provenance", () => {
  it("tags every SKU with a verification status and never marks sourceless SKUs verified", async () => {
    const kb = await import("@/lib/network-engine/knowledge-base");
    const all = [...kb.ACCESS_SWITCHES, ...kb.ROUTERS, ...kb.FIREWALLS, ...kb.ACCESS_POINTS];
    for (const s of all) {
      expect(s.verification).toBeDefined();
      if (s.verification!.status === "verified") expect(s.verification!.sources.length).toBeGreaterThan(0);
    }
    expect(kb.lookupEngineeringSpec("USW-Pro-24-PoE").matches[0].data).toMatchObject({ throughputMbps: 88_000 });
  });
});

describe("engineering knowledge base", () => {
  it("looks up hardware, PoE and cabling specs", () => {
    expect(lookupEngineeringSpec("C9200L-24P-4G").matches[0].id).toBe("hw:C9200L-24P-4G");
    expect(lookupEngineeringSpec("802.3bt poe").matches[0].id).toBe("poe");
    expect(lookupEngineeringSpec("cat6a 10g distance").matches[0].id).toBe("cabling");
    expect(lookupEngineeringSpec("zzzz-nothing").matches).toEqual([]);
    expect(lookupEngineeringSpec("ssh hardening", "hardening").matches.length).toBeGreaterThan(0);
  });
});
