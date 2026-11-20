/**
 * Closed-loop verification: Plan -> Optimize -> Verify -> Deliver.
 * Runs every deterministic check on a topology and returns pass/warn/fail
 * results with a concrete one-click remediation for each failure.
 */
import { auditSecurityResilience, generateZeroTrustAcls } from "@/lib/network-engine/auditor";
import { estimateBomAndPoe } from "@/lib/network-engine/bom";
import {
  analyzeBridges,
  analyzeCapacity,
  cidrsOverlapFree,
  planSpofElimination,
  type ArchitectureCandidate,
} from "@/lib/network-engine/or-optimizer";
import { planNetwork } from "@/lib/network-engine/planner";
import { buildTopology, cableFor, computeLayout } from "@/lib/network-engine/topology-builder";
import type {
  AclRule,
  BuiltTopology,
  FaultState,
  NetworkPlan,
} from "@/lib/network-engine/types";

export type CheckStatus = "pass" | "warn" | "fail";

export interface VerificationCheck {
  id: "connectivity" | "vlsm-overlap" | "n1-failover" | "poe" | "queueing" | "security" | "budget";
  status: CheckStatus;
  title: string;
  detail: string;
  /** A natural-language instruction the Agent can pass to `modify_topology` / a tool to fix it. */
  remediation?: { label: string; instruction: string; tool: "modify_topology" | "auto_remediate_network" | "eliminate_spofs" };
}

export interface VerificationReport {
  ok: boolean;
  passed: number;
  warned: number;
  failed: number;
  checks: VerificationCheck[];
}

export function verifyDesign(
  topology: BuiltTopology,
  plan: NetworkPlan,
  acls: AclRule[] = [],
  opts: { faults?: FaultState; budgetUsd?: number } = {},
): VerificationReport {
  const checks: VerificationCheck[] = [];
  const nodes = topology.devices.map((d) => d.id);
  const links = topology.connections.map((c) => ({ id: c.id, a: c.from, b: c.to }));

  if (nodes.length === 0) {
    return { ok: true, passed: 0, warned: 0, failed: 0, checks: [] };
  }

  // 1. Graph connectivity
  const bridges = analyzeBridges(nodes, links);
  if (bridges.connectedComponents > 1) {
    checks.push({
      id: "connectivity",
      status: "fail",
      title: "Graph connectivity",
      detail: `${bridges.connectedComponents} disconnected islands found; devices cannot reach each other.`,
      remediation: { label: "Reconnect islands at minimum cost", instruction: "connect isolated islands", tool: "eliminate_spofs" },
    });
  } else {
    checks.push({
      id: "connectivity",
      status: "pass",
      title: "Graph connectivity",
      detail: `All ${nodes.length} devices form one connected component (${bridges.bridges.length} bridge link(s), ${bridges.articulationPoints.length} articulation point(s)).`,
    });
  }

  // 2. VLSM overlap proof
  const cidrs = plan.ipPlan.subnets.map((s) => s.cidr);
  const overlap = cidrsOverlapFree(cidrs);
  checks.push(
    overlap.ok
      ? { id: "vlsm-overlap", status: "pass", title: "Subnet overlap proof", detail: `${cidrs.length} subnets, interval sweep found 0 overlaps.` }
      : {
          id: "vlsm-overlap",
          status: "fail",
          title: "Subnet overlap proof",
          detail: `Overlapping CIDRs: ${overlap.conflicts.map((c) => c.join(" ∩ ")).join("; ")}.`,
          remediation: { label: "Re-pack subnets with VLSM", instruction: "enable vlan", tool: "modify_topology" },
        },
  );

  // 3 + 5. Capacity: N-1 and queueing
  const cap = analyzeCapacity(topology);
  const hasInfra = topology.devices.some((d) => d.type === "ROUTER" || d.type === "SWITCH" || d.type === "FIREWALL");
  if (!hasInfra) {
    checks.push({ id: "n1-failover", status: "warn", title: "N-1 failover", detail: "No infrastructure devices to fail." });
  } else if (cap.n1.survivesAll) {
    checks.push({
      id: "n1-failover",
      status: "pass",
      title: "N-1 failover",
      detail: `All ${cap.n1.scenarios.length} single-link / single-device failures keep 100% of demand (${cap.totalDemandMbps} Mbps) flowing.`,
    });
  } else {
    const worst = cap.n1.failing.slice().sort((a, b) => a.servedPercent - b.servedPercent)[0];
    checks.push({
      id: "n1-failover",
      status: "fail",
      title: "N-1 failover",
      detail: `${cap.n1.failing.length}/${cap.n1.scenarios.length} failure scenarios drop traffic. Worst: losing ${worst.kind} ${worst.label} serves only ${worst.servedPercent}% (${worst.servedMbps}/${worst.requiredMbps} Mbps).`,
      remediation: {
        label: "Add minimum-cost redundant links",
        instruction: "add redundant router",
        tool: "eliminate_spofs",
      },
    });
  }

  const hot = cap.links.filter((l) => l.utilization >= 0.8);
  const over = cap.links.filter((l) => l.utilization > 0.85);
  if (over.length) {
    const w = over.slice().sort((a, b) => b.utilization - a.utilization)[0];
    checks.push({
      id: "queueing",
      status: "fail",
      title: "Queueing bottleneck",
      detail: `Link ${w.from}↔${w.to} runs at rho=${w.utilization} (${w.loadMbps}/${w.capacityMbps} Mbps)${w.delayMs === null ? ", unstable (rho>=1)" : `, W=${w.delayMs} ms`}. Upgrade to ${w.recommendedCapacityMbps ?? "a faster"} Mbps.`,
      remediation: { label: "Upgrade bottleneck uplinks to fiber", instruction: "add redundant router", tool: "modify_topology" },
    });
  } else if (hot.length) {
    checks.push({ id: "queueing", status: "warn", title: "Queueing bottleneck", detail: `${hot.length} link(s) at rho >= 0.80; worst rho=${cap.worstUtilization}.` });
  } else {
    checks.push({ id: "queueing", status: "pass", title: "Queueing bottleneck", detail: `Worst link utilization rho=${cap.worstUtilization} (< 0.80); Kleinrock mean delay ${cap.kleinrockDelayMs ?? 0} ms.` });
  }

  // 4. PoE
  const bom = estimateBomAndPoe(topology, plan);
  checks.push(
    bom.poe.overloaded
      ? {
          id: "poe",
          status: "fail",
          title: "PoE wattage budget",
          detail: `Requires ${bom.poe.requiredWatts} W but only ${bom.poe.availableWatts} W available (${bom.poe.utilizationPercent}%).`,
          remediation: { label: "Add a PoE access switch", instruction: "add 1 switch", tool: "modify_topology" },
        }
      : {
          id: "poe",
          status: bom.poe.utilizationPercent >= 85 ? "warn" : "pass",
          title: "PoE wattage budget",
          detail: `${bom.poe.requiredWatts} W of ${bom.poe.availableWatts} W (${bom.poe.utilizationPercent}%).`,
        },
  );

  // 6. Security
  const audit = auditSecurityResilience(topology, plan, acls, opts.faults);
  checks.push({
    id: "security",
    status: audit.overallScore >= 80 ? "pass" : audit.overallScore >= 60 ? "warn" : "fail",
    title: "Security score",
    detail: `${audit.overallScore}/100 (grade ${audit.grade}), ${audit.findings.length} finding(s).`,
    remediation:
      audit.overallScore >= 80 ? undefined : { label: "Apply Zero-Trust hardening", instruction: "auto-remediate", tool: "auto_remediate_network" },
  });

  // 7. Budget
  if (opts.budgetUsd !== undefined) {
    const ent = bom.tiers.find((t) => t.id === "enterprise") ?? bom.tiers[0];
    const total = ent?.totalUsd ?? 0;
    checks.push(
      total <= opts.budgetUsd
        ? { id: "budget", status: "pass", title: "Budget cap", detail: `Enterprise BOM $${total.toLocaleString("en-US")} <= cap $${opts.budgetUsd.toLocaleString("en-US")}.` }
        : {
            id: "budget",
            status: "fail",
            title: "Budget cap",
            detail: `Enterprise BOM $${total.toLocaleString("en-US")} exceeds cap $${opts.budgetUsd.toLocaleString("en-US")} by $${(total - opts.budgetUsd).toLocaleString("en-US")}.`,
          },
    );
  }

  const failed = checks.filter((c) => c.status === "fail").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  return { ok: failed === 0, passed: checks.length - failed - warned, warned, failed, checks };
}

/** Materialise a Pareto candidate into a full workspace state (topology + plan + ACLs). */
export function materializeArchitecture(candidate: ArchitectureCandidate): {
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls: AclRule[];
} {
  const topology = buildTopology({
    devices: candidate.topologyArgs.devices,
    options: { vlan: true, routingProtocol: candidate.topologyArgs.routingProtocol },
  });
  // The builder emits a tree; wire the redundancy the Pareto model assumed
  // (second core / firewall, dual-homed access) with minimum-cost links.
  if (candidate.coreRouters >= 2 || candidate.firewalls >= 2) {
    const fix = planSpofElimination(topology);
    const byId = new Map(topology.devices.map((d) => [d.id, d]));
    topology.connections = [
      ...topology.connections,
      ...fix.addedLinks.map((l, i) => {
        const a = byId.get(l.from);
        const b = byId.get(l.to);
        return {
          id: `ha${i + 1}`,
          from: l.from,
          to: l.to,
          meta: { cableType: a && b ? cableFor(a.type, b.type) : ("Fiber" as const) },
        };
      }),
    ];
  }
  topology.layout = computeLayout(topology.devices, topology.connections, "tiered");
  const plan = planNetwork(topology, undefined, { vlan: true, routingProtocol: "OSPF" });
  return { topology, plan, acls: generateZeroTrustAcls(plan) };
}
