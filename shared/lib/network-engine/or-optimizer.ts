/**
 * Topova Operations-Research optimizer.
 *
 * Pure, deterministic TypeScript: no randomness, no I/O, no LLM. Every function
 * returns the numbers (and where useful the proof steps) behind its decision.
 */
import {
  ACCESS_SWITCHES,
  FIREWALLS,
  ISP_AVAILABILITY,
  RELIABILITY,
  ROUTERS,
  availabilityOf,
  type HardwareSku,
} from "@/lib/network-engine/knowledge-base";
import { intToIp, ipToInt, maskFromPrefix, prefixForHosts } from "@/lib/network-engine/ip-planner";
import type { BuiltTopology, DeviceType } from "@/lib/network-engine/types";

// ===========================================================================
// 1. Max-Flow / Min-Cut (Edmonds-Karp)
// ===========================================================================

export interface FlowEdge {
  id: string;
  a: string;
  b: string;
  capacityMbps: number;
  /** When true the edge only carries flow a -> b. */
  directed?: boolean;
}

export interface MaxFlowResult {
  maxFlowMbps: number;
  /** Ids of the edges whose capacity sum equals the max flow (a minimum cut). */
  minCutEdgeIds: string[];
  minCutCapacityMbps: number;
  /** Nodes on the source side of the cut. */
  sourceSide: string[];
  augmentations: number;
}

const EPS = 1e-9;

export function maxFlow(
  edges: FlowEdge[],
  source: string,
  sink: string,
  removed?: { edgeIds?: Set<string>; nodeIds?: Set<string> },
): MaxFlowResult {
  const names: string[] = [];
  const nameIndex = new Map<string, number>();
  const idx = (name: string): number => {
    let n = nameIndex.get(name);
    if (n === undefined) {
      n = names.length;
      names.push(name);
      nameIndex.set(name, n);
    }
    return n;
  };
  const to: number[] = [];
  const cap: number[] = [];
  const owner: string[] = [];
  const nodeOf: string[] = []; // tail node of every arc
  const adj = new Map<string, number[]>();
  const link = (u: string, arc: number) => {
    const list = adj.get(u);
    if (list) list.push(arc);
    else adj.set(u, [arc]);
  };
  for (const e of edges) {
    if (removed?.edgeIds?.has(e.id)) continue;
    if (removed?.nodeIds?.has(e.a) || removed?.nodeIds?.has(e.b)) continue;
    const c = Math.max(0, e.capacityMbps);
    const i = to.length;
    to.push(idx(e.b), idx(e.a));
    cap.push(c, e.directed ? 0 : c);
    owner.push(e.id, e.id);
    nodeOf.push(e.a, e.b);
    link(e.a, i);
    link(e.b, i + 1);
  }

  if (source === sink || !adj.has(source) || !adj.has(sink)) {
    return { maxFlowMbps: 0, minCutEdgeIds: [], minCutCapacityMbps: 0, sourceSide: [source], augmentations: 0 };
  }

  const original = [...cap];
  let flow = 0;
  let augmentations = 0;
  for (;;) {
    const prevArc = new Map<string, number>();
    const seen = new Set<string>([source]);
    const queue = [source];
    for (let h = 0; h < queue.length && !seen.has(sink); h++) {
      const u = queue[h];
      for (const arc of adj.get(u) ?? []) {
        const v = names[to[arc]];
        if (cap[arc] > EPS && !seen.has(v)) {
          seen.add(v);
          prevArc.set(v, arc);
          queue.push(v);
        }
      }
    }
    if (!seen.has(sink)) {
      // `seen` is exactly the source side of a minimum cut.
      const cutIds: string[] = [];
      let cutCap = 0;
      for (let arc = 0; arc < to.length; arc += 2) {
        const a = nodeOf[arc];
        const b = nodeOf[arc + 1];
        const aIn = seen.has(a);
        const bIn = seen.has(b);
        if (aIn === bIn) continue;
        // capacity crossing from source side to sink side
        const crossing = aIn ? original[arc] : original[arc + 1];
        if (crossing > EPS) {
          cutIds.push(owner[arc]);
          cutCap += crossing;
        }
      }
      return {
        maxFlowMbps: flow,
        minCutEdgeIds: cutIds,
        minCutCapacityMbps: cutCap,
        sourceSide: [...seen].sort(),
        augmentations,
      };
    }
    let bottleneck = Infinity;
    for (let v = sink; v !== source; ) {
      const arc = prevArc.get(v) as number;
      bottleneck = Math.min(bottleneck, cap[arc]);
      v = nodeOf[arc];
    }
    for (let v = sink; v !== source; ) {
      const arc = prevArc.get(v) as number;
      cap[arc] -= bottleneck;
      cap[arc ^ 1] += bottleneck;
      v = nodeOf[arc];
    }
    flow += bottleneck;
    augmentations++;
  }
}

// ===========================================================================
// 2. Queueing theory (M/M/1, Kleinrock)
// ===========================================================================

export const DEFAULT_PACKET_BITS = 12_000; // 1500-byte frame
export const SPEED_TIERS_MBPS = [100, 1000, 10_000, 40_000];

export interface Mm1Result {
  utilization: number;
  arrivalPps: number;
  servicePps: number;
  stable: boolean;
  /** W = 1 / (mu - lambda) in milliseconds, null when rho >= 1. */
  delayMs: number | null;
  saturated: boolean;
  recommendedCapacityMbps: number | null;
}

export function mm1(loadMbps: number, capacityMbps: number, packetBits = DEFAULT_PACKET_BITS): Mm1Result {
  const lambda = (loadMbps * 1e6) / packetBits;
  const mu = (capacityMbps * 1e6) / packetBits;
  const rho = mu > 0 ? lambda / mu : Infinity;
  const stable = rho < 1;
  const saturated = rho >= 0.8;
  let recommended: number | null = null;
  if (saturated) {
    recommended = SPEED_TIERS_MBPS.find((t) => t > capacityMbps && loadMbps / t < 0.5) ?? SPEED_TIERS_MBPS[SPEED_TIERS_MBPS.length - 1];
  }
  return {
    utilization: round(rho, 4),
    arrivalPps: round(lambda, 2),
    servicePps: round(mu, 2),
    stable,
    delayMs: stable ? round((1 / (mu - lambda)) * 1000, 6) : null,
    saturated,
    recommendedCapacityMbps: recommended,
  };
}

/** Kleinrock average network delay T = (1/gamma) * sum(lambda_i / (mu_i - lambda_i)). */
export function kleinrockNetworkDelayMs(
  links: { loadMbps: number; capacityMbps: number }[],
  externalLoadMbps: number,
  packetBits = DEFAULT_PACKET_BITS,
): number | null {
  const gamma = (externalLoadMbps * 1e6) / packetBits;
  if (gamma <= 0) return 0;
  let sum = 0;
  for (const l of links) {
    const lambda = (l.loadMbps * 1e6) / packetBits;
    const mu = (l.capacityMbps * 1e6) / packetBits;
    if (lambda <= 0) continue;
    if (lambda >= mu) return null;
    sum += lambda / (mu - lambda);
  }
  return round((sum / gamma) * 1000, 6);
}

// ===========================================================================
// 3. Topology adapters: capacity, load, N-1
// ===========================================================================

const ENDPOINT_TYPES = new Set<DeviceType>(["PC", "SERVER", "PRINTER", "CAMERA", "NVR", "IP_PHONE", "AP"]);
const INFRA_TYPES = new Set<DeviceType>(["ROUTER", "SWITCH", "FIREWALL"]);

/** Planning demand toward the gateway, Mbps (override with device.meta.demandMbps). */
export const DEMAND_MBPS: Record<DeviceType, number> = {
  PC: 5,
  SERVER: 40,
  PRINTER: 1,
  CAMERA: 4,
  NVR: 20,
  IP_PHONE: 0.2,
  AP: 50,
  SWITCH: 0,
  ROUTER: 0,
  FIREWALL: 0,
};

export function deviceDemandMbps(device: BuiltTopology["devices"][number]): number {
  const o = device.meta?.demandMbps;
  return typeof o === "number" && o >= 0 ? o : DEMAND_MBPS[device.type];
}

export function linkCapacityMbps(topology: BuiltTopology, linkId: string): number {
  const c = topology.connections.find((x) => x.id === linkId);
  if (!c) return 0;
  const override = c.meta?.bandwidthMbps;
  if (typeof override === "number" && override > 0) return override;
  const a = topology.devices.find((d) => d.id === c.from);
  const b = topology.devices.find((d) => d.id === c.to);
  if (c.meta?.cableType === "Fiber") return 10_000;
  if (c.meta?.cableType === "Serial") return 100;
  const slow = (d?: { type: DeviceType }) => d && (d.type === "CAMERA" || d.type === "IP_PHONE" || d.type === "PRINTER");
  if (slow(a) || slow(b)) return 100;
  return 1000;
}

export function gatewayIds(topology: BuiltTopology): string[] {
  for (const t of ["ROUTER", "FIREWALL", "SWITCH"] as DeviceType[]) {
    const ids = topology.devices.filter((d) => d.type === t).map((d) => d.id);
    if (ids.length) return ids;
  }
  return topology.devices.slice(0, 1).map((d) => d.id);
}

const SRC = "__SRC__";
const SNK = "__SNK__";

export function topologyFlowEdges(topology: BuiltTopology): FlowEdge[] {
  const edges: FlowEdge[] = topology.connections.map((c) => ({
    id: c.id,
    a: c.from,
    b: c.to,
    capacityMbps: linkCapacityMbps(topology, c.id),
  }));
  for (const d of topology.devices) {
    const demand = deviceDemandMbps(d);
    if (demand > 0) edges.push({ id: `__demand_${d.id}`, a: SRC, b: d.id, capacityMbps: demand, directed: true });
  }
  for (const g of gatewayIds(topology)) {
    edges.push({ id: `__sink_${g}`, a: g, b: SNK, capacityMbps: 1e9, directed: true });
  }
  return edges;
}

export interface FailureScenario {
  kind: "link" | "node";
  id: string;
  label: string;
  servedMbps: number;
  requiredMbps: number;
  servedPercent: number;
  survives: boolean;
}

export interface CapacityAnalysis {
  totalDemandMbps: number;
  maxFlowMbps: number;
  /** True when every demand fits in the intact network. */
  feasible: boolean;
  bottleneckLinkIds: string[];
  minCutCapacityMbps: number;
  links: {
    id: string;
    from: string;
    to: string;
    capacityMbps: number;
    loadMbps: number;
    utilization: number;
    delayMs: number | null;
    saturated: boolean;
    recommendedCapacityMbps: number | null;
  }[];
  worstUtilization: number;
  kleinrockDelayMs: number | null;
  n1: { scenarios: FailureScenario[]; failing: FailureScenario[]; survivesAll: boolean };
  assumptions: string[];
}

/** Shortest-path (hop count) routing of every demand to the nearest gateway. */
export function routeLoads(topology: BuiltTopology): Map<string, number> {
  const adj = new Map<string, { to: string; linkId: string }[]>();
  for (const d of topology.devices) adj.set(d.id, []);
  for (const c of topology.connections) {
    adj.get(c.from)?.push({ to: c.to, linkId: c.id });
    adj.get(c.to)?.push({ to: c.from, linkId: c.id });
  }
  const gws = new Set(gatewayIds(topology));
  const load = new Map<string, number>();
  for (const d of topology.devices) {
    const demand = deviceDemandMbps(d);
    if (demand <= 0 || gws.has(d.id)) continue;
    const prev = new Map<string, { from: string; linkId: string }>();
    const seen = new Set([d.id]);
    const q = [d.id];
    let found: string | null = null;
    for (let h = 0; h < q.length && !found; h++) {
      for (const n of adj.get(q[h]) ?? []) {
        if (seen.has(n.to)) continue;
        seen.add(n.to);
        prev.set(n.to, { from: q[h], linkId: n.linkId });
        if (gws.has(n.to)) {
          found = n.to;
          break;
        }
        q.push(n.to);
      }
    }
    for (let v = found; v && v !== d.id; ) {
      const p = prev.get(v);
      if (!p) break;
      load.set(p.linkId, (load.get(p.linkId) ?? 0) + demand);
      v = p.from;
    }
  }
  return load;
}

export function analyzeCapacity(topology: BuiltTopology): CapacityAnalysis {
  const edges = topologyFlowEdges(topology);
  const total = topology.devices.reduce((s, d) => s + deviceDemandMbps(d), 0);
  const base = maxFlow(edges, SRC, SNK);
  const loads = routeLoads(topology);
  const links = topology.connections.map((c) => {
    const capacityMbps = linkCapacityMbps(topology, c.id);
    const loadMbps = loads.get(c.id) ?? 0;
    const q = mm1(loadMbps, capacityMbps);
    return {
      id: c.id,
      from: c.from,
      to: c.to,
      capacityMbps,
      loadMbps: round(loadMbps, 3),
      utilization: q.utilization,
      delayMs: q.delayMs,
      saturated: q.saturated,
      recommendedCapacityMbps: q.recommendedCapacityMbps,
    };
  });

  const scenarios: FailureScenario[] = [];
  const demandOf = new Map(topology.devices.map((d) => [d.id, deviceDemandMbps(d)]));
  // Endpoints are single-homed by design, so losing their only access link or
  // access switch strands just them (the access blast radius). N-1 therefore
  // judges the transit fabric: those stranded endpoints are excluded from the
  // demand that must survive.
  const degree = new Map<string, number>();
  for (const c of topology.connections) {
    degree.set(c.from, (degree.get(c.from) ?? 0) + 1);
    degree.set(c.to, (degree.get(c.to) ?? 0) + 1);
  }
  const typeById = new Map(topology.devices.map((d) => [d.id, d.type]));
  const singleHomedEndpoint = (id: string) => ENDPOINT_TYPES.has(typeById.get(id) as DeviceType) && degree.get(id) === 1;
  for (const c of topology.connections) {
    const stranded = [c.from, c.to].filter(singleHomedEndpoint).reduce((s, id) => s + (demandOf.get(id) ?? 0), 0);
    const r = maxFlow(edges, SRC, SNK, { edgeIds: new Set([c.id]) });
    scenarios.push(scenario("link", c.id, `${c.from}↔${c.to}`, r.maxFlowMbps, total - stranded));
  }
  for (const d of topology.devices) {
    if (ENDPOINT_TYPES.has(d.type) || !INFRA_TYPES.has(d.type)) continue; // endpoint loss is not a transit failure
    const stranded = topology.connections
      .filter((c) => c.from === d.id || c.to === d.id)
      .map((c) => (c.from === d.id ? c.to : c.from))
      .filter(singleHomedEndpoint)
      .reduce((s, id) => s + (demandOf.get(id) ?? 0), 0);
    const r = maxFlow(edges, SRC, SNK, { nodeIds: new Set([d.id]) });
    scenarios.push(scenario("node", d.id, d.label || d.id, r.maxFlowMbps, total - (demandOf.get(d.id) ?? 0) - stranded));
  }
  const failing = scenarios.filter((s) => !s.survives);

  return {
    totalDemandMbps: round(total, 3),
    maxFlowMbps: round(base.maxFlowMbps, 3),
    feasible: base.maxFlowMbps + EPS >= total,
    bottleneckLinkIds: base.minCutEdgeIds.filter((id) => !id.startsWith("__")),
    minCutCapacityMbps: round(base.minCutCapacityMbps, 3),
    links,
    worstUtilization: links.reduce((m, l) => Math.max(m, l.utilization), 0),
    kleinrockDelayMs: kleinrockNetworkDelayMs(
      links.map((l) => ({ loadMbps: l.loadMbps, capacityMbps: l.capacityMbps })),
      total,
    ),
    n1: { scenarios, failing, survivesAll: failing.length === 0 },
    assumptions: [
      "Demand per device type from DEMAND_MBPS (override with device.meta.demandMbps).",
      "Link capacity: 1 Gbps copper, 10 Gbps fiber, 100 Mbps for camera/phone/printer/serial (override with connection.meta.bandwidthMbps).",
      "Traffic flows toward the gateway tier (routers, else firewalls); loads use shortest-path routing.",
      "M/M/1 with 1500-byte packets: rho = lambda/mu, W = 1/(mu - lambda).",
    ],
  };

  function scenario(kind: "link" | "node", id: string, label: string, served: number, required: number): FailureScenario {
    const pct = required <= EPS ? 100 : Math.min(100, (served / required) * 100);
    return {
      kind,
      id,
      label,
      servedMbps: round(served, 3),
      requiredMbps: round(required, 3),
      servedPercent: round(pct, 2),
      survives: served + 1e-6 >= required,
    };
  }
}

// ===========================================================================
// 4. Bridges, articulation points, minimum SPOF augmentation
// ===========================================================================

export interface GraphLink {
  id: string;
  a: string;
  b: string;
}

export interface BridgeAnalysis {
  bridges: string[];
  articulationPoints: string[];
  connectedComponents: number;
  twoEdgeComponents: string[][];
}

export function analyzeBridges(nodes: string[], links: GraphLink[]): BridgeAnalysis {
  const adj = new Map<string, { to: string; id: string }[]>();
  for (const n of nodes) adj.set(n, []);
  for (const l of links) {
    if (!adj.has(l.a) || !adj.has(l.b) || l.a === l.b) continue;
    adj.get(l.a)?.push({ to: l.b, id: l.id });
    adj.get(l.b)?.push({ to: l.a, id: l.id });
  }
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const bridges: string[] = [];
  const art = new Set<string>();
  let timer = 0;
  let components = 0;

  const dfs = (u: string, parentEdge: string | null) => {
    disc.set(u, ++timer);
    low.set(u, timer);
    let children = 0;
    for (const { to, id } of adj.get(u) ?? []) {
      if (id === parentEdge) continue;
      if (disc.has(to)) {
        low.set(u, Math.min(low.get(u) as number, disc.get(to) as number));
        continue;
      }
      children++;
      dfs(to, id);
      low.set(u, Math.min(low.get(u) as number, low.get(to) as number));
      if ((low.get(to) as number) > (disc.get(u) as number)) bridges.push(id);
      if (parentEdge !== null && (low.get(to) as number) >= (disc.get(u) as number)) art.add(u);
    }
    if (parentEdge === null && children > 1) art.add(u);
  };
  for (const n of nodes) {
    if (!disc.has(n)) {
      components++;
      dfs(n, null);
    }
  }

  const bridgeSet = new Set(bridges);
  const comp = new Map<string, number>();
  const groups: string[][] = [];
  for (const n of nodes) {
    if (comp.has(n)) continue;
    const g: string[] = [];
    const stack = [n];
    comp.set(n, groups.length);
    while (stack.length) {
      const u = stack.pop() as string;
      g.push(u);
      for (const { to, id } of adj.get(u) ?? []) {
        if (bridgeSet.has(id) || comp.has(to)) continue;
        comp.set(to, groups.length);
        stack.push(to);
      }
    }
    groups.push(g.sort());
  }
  return {
    bridges: bridges.sort(),
    articulationPoints: [...art].sort(),
    connectedComponents: components,
    twoEdgeComponents: groups,
  };
}

export interface AugmentationLink {
  from: string;
  to: string;
  costUsd: number;
  reason: string;
}

export interface SpofPlan {
  before: BridgeAnalysis;
  after: BridgeAnalysis;
  addedLinks: AugmentationLink[];
  totalCostUsd: number;
  /** ceil(L/2) where L = leaves of the bridge tree: the Eswaran-Tarjan lower bound. */
  lowerBoundLinks: number;
  proof: string[];
}

const ENDPOINT_COST = 15;
const FIBER_PAIR_COST = 180;

export function augmentationLinkCostUsd(a: DeviceType, b: DeviceType): number {
  return INFRA_TYPES.has(a) && INFRA_TYPES.has(b) ? FIBER_PAIR_COST : ENDPOINT_COST;
}

/**
 * Minimum number of new links that leaves the graph 2-edge-connected (no
 * bridges). Leaves of the bridge tree are paired in DFS order (i with
 * i + floor(L/2)), which covers every bridge with ceil(L/2) links, matching the
 * Eswaran-Tarjan lower bound. Endpoints inside each pair of components are
 * chosen to minimise cost. The result is re-verified by recomputing bridges.
 */
export function planSpofElimination(topology: BuiltTopology): SpofPlan {
  // Only the infrastructure fabric (routers, switches, firewalls) is hardened:
  // single-homed endpoints are an accepted access blast radius, and linking
  // PCs to each other would be nonsense.
  const infra = topology.devices.filter((d) => INFRA_TYPES.has(d.type));
  const scope = infra.length >= 2 ? infra : topology.devices;
  const scopeIds = new Set(scope.map((d) => d.id));
  const nodes = scope.map((d) => d.id);
  const typeOf = new Map(topology.devices.map((d) => [d.id, d.type]));
  let links: GraphLink[] = topology.connections
    .filter((c) => scopeIds.has(c.from) && scopeIds.has(c.to))
    .map((c) => ({ id: c.id, a: c.from, b: c.to }));
  const before = analyzeBridges(nodes, links);
  const added: AugmentationLink[] = [];
  const proof: string[] = [];

  const pickPair = (g1: string[], g2: string[]): [string, string] => {
    let best: [string, string] | null = null;
    let bestScore = Infinity;
    for (const x of g1) {
      for (const y of g2) {
        const cost = augmentationLinkCostUsd(typeOf.get(x) as DeviceType, typeOf.get(y) as DeviceType);
        // prefer infrastructure endpoints (they have uplink ports), then cheapest
        const penalty = (INFRA_TYPES.has(typeOf.get(x) as DeviceType) ? 0 : 1000) + (INFRA_TYPES.has(typeOf.get(y) as DeviceType) ? 0 : 1000);
        const score = penalty + cost;
        if (score < bestScore || (score === bestScore && best && `${x}|${y}` < `${best[0]}|${best[1]}`)) {
          bestScore = score;
          best = [x, y];
        }
      }
    }
    return best as [string, string];
  };
  const addLink = (x: string, y: string, reason: string) => {
    const id = `opt-${added.length + 1}`;
    links = [...links, { id, a: x, b: y }];
    added.push({
      from: x,
      to: y,
      costUsd: augmentationLinkCostUsd(typeOf.get(x) as DeviceType, typeOf.get(y) as DeviceType),
      reason,
    });
  };

  // Step 1: connect disconnected components.
  let state = analyzeBridges(nodes, links);
  if (state.connectedComponents > 1) {
    const comps = componentsOf(nodes, links);
    for (let i = 1; i < comps.length; i++) {
      const [x, y] = pickPair(comps[0], comps[i]);
      addLink(x, y, "connect isolated island");
    }
    proof.push(`Connected ${comps.length} islands with ${comps.length - 1} link(s).`);
    state = analyzeBridges(nodes, links);
  }

  // Step 2: pair the leaves of the bridge tree.
  let leavesCount = 0;
  if (state.bridges.length > 0) {
    const bridgeSet = new Set(state.bridges);
    const compOf = new Map<string, number>();
    state.twoEdgeComponents.forEach((g, i) => g.forEach((n) => compOf.set(n, i)));
    const treeAdj = new Map<number, number[]>();
    state.twoEdgeComponents.forEach((_, i) => treeAdj.set(i, []));
    for (const l of links) {
      if (!bridgeSet.has(l.id)) continue;
      const ca = compOf.get(l.a) as number;
      const cb = compOf.get(l.b) as number;
      treeAdj.get(ca)?.push(cb);
      treeAdj.get(cb)?.push(ca);
    }
    const leafOrder: number[] = [];
    const visited = new Set<number>();
    const walk = (u: number) => {
      visited.add(u);
      const nb = treeAdj.get(u) ?? [];
      if (nb.length === 1) leafOrder.push(u);
      for (const v of nb) if (!visited.has(v)) walk(v);
    };
    for (const i of treeAdj.keys()) if (!visited.has(i)) walk(i);
    leavesCount = leafOrder.length;
    const half = Math.floor(leavesCount / 2);
    for (let i = 0; i < Math.ceil(leavesCount / 2); i++) {
      const [x, y] = pickPair(state.twoEdgeComponents[leafOrder[i]], state.twoEdgeComponents[leafOrder[i + half]]);
      addLink(x, y, "close bridge-tree leaf pair");
    }
    proof.push(`Bridge tree has L=${leavesCount} leaves; pairing leaf i with i+floor(L/2) needs ceil(L/2)=${Math.ceil(leavesCount / 2)} links (Eswaran-Tarjan optimum).`);
  }

  // Step 3: safety net, re-verify and patch any residual bridge.
  for (let guard = 0; guard < nodes.length; guard++) {
    const check = analyzeBridges(nodes, links);
    if (check.bridges.length === 0) break;
    const [g1, g2] = (() => {
      const l = links.find((x) => x.id === check.bridges[0]) as GraphLink;
      const grp = (n: string) => check.twoEdgeComponents.find((g) => g.includes(n)) as string[];
      return [grp(l.a), grp(l.b)];
    })();
    const other = check.twoEdgeComponents.find((g) => g !== g1 && g !== g2) ?? g2;
    const [x, y] = pickPair(g1, other === g1 ? g2 : other);
    addLink(x, y, "residual bridge patch");
  }

  // Step 4: vertex redundancy. A bridge-free graph can still have an articulation
  // point (one device whose loss splits the fabric). For each one, re-attach every
  // component that lost its gateway path to a component that still has a gateway.
  // This repair is greedy (cheapest endpoints per link), not proven minimal.
  const gateways = new Set(
    scope.filter((d) => d.type === "ROUTER").map((d) => d.id),
  );
  if (gateways.size === 0) scope.filter((d) => d.type === "FIREWALL").forEach((d) => gateways.add(d.id));
  const skipped = new Set<string>();
  let articulationLinks = 0;
  for (let guard = 0; guard < nodes.length * 2; guard++) {
    const state2 = analyzeBridges(nodes, links);
    const v = state2.articulationPoints.find((a) => !skipped.has(a));
    if (!v) break;
    const rest = nodes.filter((n) => n !== v);
    const comps = componentsOf(
      rest,
      links.filter((l) => l.a !== v && l.b !== v),
    );
    const anchor = comps.find((g) => g.some((n) => gateways.has(n)));
    const orphans = comps.filter((g) => g !== anchor);
    if (!anchor || orphans.length === 0) {
      skipped.add(v);
      continue;
    }
    for (const g of orphans) {
      const [x, y] = pickPair(g, anchor);
      addLink(x, y, `dual-home around ${v}`);
      articulationLinks++;
    }
  }
  if (articulationLinks > 0) {
    proof.push(`Added ${articulationLinks} link(s) so no single device (articulation point) can cut the fabric off from its gateways (greedy, cheapest endpoints).`);
  }

  const after = analyzeBridges(nodes, links);
  proof.push(`Re-verification: bridges after augmentation = ${after.bridges.length}, remaining articulation points = ${after.articulationPoints.length}.`);
  return {
    before,
    after,
    addedLinks: added,
    totalCostUsd: added.reduce((s, l) => s + l.costUsd, 0),
    lowerBoundLinks: Math.ceil(leavesCount / 2),
    proof,
  };
}

function componentsOf(nodes: string[], links: GraphLink[]): string[][] {
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n, []));
  for (const l of links) {
    adj.get(l.a)?.push(l.b);
    adj.get(l.b)?.push(l.a);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of nodes) {
    if (seen.has(n)) continue;
    const g: string[] = [];
    const st = [n];
    seen.add(n);
    while (st.length) {
      const u = st.pop() as string;
      g.push(u);
      for (const v of adj.get(u) ?? []) {
        if (seen.has(v)) continue;
        seen.add(v);
        st.push(v);
      }
    }
    out.push(g);
  }
  return out;
}

// ===========================================================================
// 5. VLSM packing with proofs
// ===========================================================================

export interface VlsmRequirement {
  name: string;
  hosts: number;
}

export interface VlsmAllocation {
  name: string;
  cidr: string;
  mask: string;
  network: number;
  size: number;
  requestedHosts: number;
  plannedHosts: number;
  usableHosts: number;
  utilizationPercent: number;
  firstUsable: string;
  lastUsable: string;
}

export interface VlsmPlan {
  feasible: boolean;
  parent: string;
  headroomPercent: number;
  allocations: VlsmAllocation[];
  addressesAllocated: number;
  parentSize: number;
  parentUtilizationPercent: number;
  hostUtilizationPercent: number;
  wastedAddresses: number;
  proof: { overlapFree: boolean; aligned: boolean; containedInParent: boolean; steps: string[] };
  shortfallAddresses: number;
}

export function parseCidr(cidr: string): { network: number; prefix: number } | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(cidr.trim());
  if (!m) return null;
  const oct = m.slice(1, 5).map(Number);
  const prefix = Number(m[5]);
  if (oct.some((o) => o > 255) || prefix > 32) return null;
  const ip = ipToInt(oct.join("."));
  const size = 2 ** (32 - prefix);
  return { network: Math.floor(ip / size) * size, prefix };
}

/** True when no two CIDR blocks intersect (sorted-interval sweep). */
export function cidrsOverlapFree(cidrs: string[]): { ok: boolean; conflicts: [string, string][] } {
  const blocks = cidrs
    .map((c) => ({ c, p: parseCidr(c) }))
    .filter((x): x is { c: string; p: { network: number; prefix: number } } => x.p !== null)
    .map((x) => ({ c: x.c, start: x.p.network, end: x.p.network + 2 ** (32 - x.p.prefix) }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const conflicts: [string, string][] = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length && blocks[j].start < blocks[i].end; j++) {
      conflicts.push([blocks[i].c, blocks[j].c]);
    }
  }
  return { ok: conflicts.length === 0, conflicts };
}

export function packVlsm(parentCidr: string, requirements: VlsmRequirement[], headroomPercent = 30): VlsmPlan {
  const parent = parseCidr(parentCidr);
  if (!parent) throw new RangeError(`Invalid parent CIDR: ${parentCidr}`);
  const headroom = Math.max(0, Math.min(100, headroomPercent));
  const parentSize = 2 ** (32 - parent.prefix);
  const sized = requirements.map((r) => {
    const planned = Math.max(1, Math.ceil(r.hosts * (1 + headroom / 100)));
    const prefix = prefixForHosts(planned);
    return { r, planned, prefix, size: 2 ** (32 - prefix) };
  });
  sized.sort((a, b) => b.size - a.size || a.r.name.localeCompare(b.r.name));

  let cursor = parent.network;
  const allocations: VlsmAllocation[] = [];
  let needed = 0;
  for (const s of sized) {
    const network = Math.ceil(cursor / s.size) * s.size;
    needed = network + s.size - parent.network;
    cursor = network + s.size;
    allocations.push({
      name: s.r.name,
      cidr: `${intToIp(network)}/${s.prefix}`,
      mask: maskFromPrefix(s.prefix),
      network,
      size: s.size,
      requestedHosts: s.r.hosts,
      plannedHosts: s.planned,
      usableHosts: s.size - 2,
      utilizationPercent: round((s.r.hosts / (s.size - 2)) * 100, 1),
      firstUsable: intToIp(network + 1),
      lastUsable: intToIp(network + s.size - 2),
    });
  }
  const containedInParent = allocations.every((a) => a.network >= parent.network && a.network + a.size <= parent.network + parentSize);
  const aligned = allocations.every((a) => a.network % a.size === 0);
  const overlap = cidrsOverlapFree(allocations.map((a) => a.cidr));
  const allocated = allocations.reduce((s, a) => s + a.size, 0);
  const hostsReq = allocations.reduce((s, a) => s + a.requestedHosts, 0);
  const usable = allocations.reduce((s, a) => s + a.usableHosts, 0);
  const feasible = containedInParent && needed <= parentSize;

  return {
    feasible,
    parent: `${intToIp(parent.network)}/${parent.prefix}`,
    headroomPercent: headroom,
    allocations,
    addressesAllocated: allocated,
    parentSize,
    parentUtilizationPercent: round((allocated / parentSize) * 100, 2),
    hostUtilizationPercent: usable > 0 ? round((hostsReq / usable) * 100, 2) : 0,
    wastedAddresses: allocated - hostsReq - allocations.length * 2,
    shortfallAddresses: Math.max(0, needed - parentSize),
    proof: {
      overlapFree: overlap.ok,
      aligned,
      containedInParent,
      steps: [
        `Each requirement r_i is inflated by ${headroom}% headroom then rounded to the smallest 2^k block with 2^k - 2 >= hosts.`,
        "Blocks are placed largest-first. Every size is a power of two, so a block placed after larger ones starts on its own alignment boundary; no gaps arise except trailing space.",
        `Interval sweep over ${allocations.length} blocks found ${overlap.conflicts.length} overlaps (overlap-free: ${overlap.ok}).`,
        `Alignment check network % size == 0 for all blocks: ${aligned}. Contained in ${intToIp(parent.network)}/${parent.prefix}: ${containedInParent}.`,
      ],
    },
  };
}

// ===========================================================================
// 6. Budget-constrained hardware selection (exact branch-and-bound knapsack)
// ===========================================================================

export interface HardwareNeed {
  ports: number;
  poePorts: number;
  poeWatts: number;
  maxRackUnits?: number;
}

export interface HardwareSelection {
  feasible: boolean;
  objective: "min-cost" | "max-resilience";
  items: { sku: string; vendor: string; quantity: number; unitUsd: number; totalUsd: number }[];
  totalCostUsd: number;
  totalPorts: number;
  totalPoeWatts: number;
  totalRackUnits: number;
  largestFailureDomainPorts: number;
  /** True when the search space was exhausted, so the optimum is proven. */
  provenOptimal: boolean;
  nodesExplored: number;
  budgetUsd: number | null;
  reason?: string;
}

const priceOf = (s: HardwareSku) => Math.round((s.priceUsd.min + s.priceUsd.max) / 2);
const NODE_LIMIT = 400_000;

interface SolveResult {
  counts: number[];
  cost: number;
  nodes: number;
  exhaustive: boolean;
}

function solveMinCost(skus: HardwareSku[], need: HardwareNeed, budget: number): SolveResult | null {
  const n = skus.length;
  const price = skus.map(priceOf);
  const perPort = skus.map((s, i) => price[i] / s.ports);
  const perPoeW = skus.map((s, i) => (s.poeBudgetW > 0 ? price[i] / s.poeBudgetW : Infinity));
  const perPoePort = skus.map((s, i) => (s.poePorts > 0 ? price[i] / s.poePorts : Infinity));
  const sufMin = (arr: number[]) => {
    const out = new Array<number>(n + 1).fill(Infinity);
    for (let i = n - 1; i >= 0; i--) out[i] = Math.min(out[i + 1], arr[i]);
    return out;
  };
  const sPort = sufMin(perPort);
  const sW = sufMin(perPoeW);
  const sPp = sufMin(perPoePort);
  const maxCount = skus.map((s) => {
    const byPorts = Math.ceil(need.ports / s.ports);
    const byW = s.poeBudgetW > 0 ? Math.ceil(need.poeWatts / s.poeBudgetW) : 0;
    const byPp = s.poePorts > 0 ? Math.ceil(need.poePorts / s.poePorts) : 0;
    return Math.max(byPorts, byW, byPp, 1) + 1;
  });

  let best: SolveResult | null = null;
  let nodes = 0;
  let exhaustive = true;
  const counts = new Array<number>(n).fill(0);

  const dfs = (i: number, cost: number, ports: number, watts: number, poeP: number, ru: number) => {
    if (++nodes > NODE_LIMIT) {
      exhaustive = false;
      return;
    }
    const remPorts = Math.max(0, need.ports - ports);
    const remW = Math.max(0, need.poeWatts - watts);
    const remPp = Math.max(0, need.poePorts - poeP);
    if (remPorts === 0 && remW === 0 && remPp === 0) {
      if (cost <= budget && (!best || cost < best.cost)) best = { counts: [...counts], cost, nodes, exhaustive };
      return;
    }
    if (i >= n) return;
    const lb = Math.max(
      remPorts > 0 ? remPorts * sPort[i] : 0,
      remW > 0 ? remW * sW[i] : 0,
      remPp > 0 ? remPp * sPp[i] : 0,
    );
    if (!Number.isFinite(lb)) return;
    if (cost + lb > budget + EPS || (best && cost + lb >= best.cost - EPS)) return;
    const s = skus[i];
    for (let c = maxCount[i]; c >= 0; c--) {
      const nextRu = ru + c * s.rackUnits;
      if (need.maxRackUnits !== undefined && nextRu > need.maxRackUnits) continue;
      counts[i] = c;
      dfs(i + 1, cost + c * price[i], ports + c * s.ports, watts + c * s.poeBudgetW, poeP + c * s.poePorts, nextRu);
      if (nodes > NODE_LIMIT) break;
    }
    counts[i] = 0;
  };
  dfs(0, 0, 0, 0, 0, 0);
  if (!best) return null;
  const b = best as SolveResult;
  return { ...b, nodes, exhaustive };
}

export function selectAccessSwitches(
  need: HardwareNeed,
  opts: { budgetUsd?: number; objective?: "min-cost" | "max-resilience"; catalog?: HardwareSku[] } = {},
): HardwareSelection {
  const objective = opts.objective ?? "min-cost";
  const catalog = (opts.catalog ?? ACCESS_SWITCHES).slice().sort((a, b) => a.sku.localeCompare(b.sku));
  const budget = opts.budgetUsd ?? Infinity;
  const emptyNeed = need.ports <= 0 && need.poeWatts <= 0 && need.poePorts <= 0;

  let solved: SolveResult | null = null;
  let skus = catalog;
  let totalNodes = 0;
  let exhaustive = true;

  if (objective === "min-cost") {
    solved = solveMinCost(catalog, need, budget);
    if (solved) {
      totalNodes = solved.nodes;
      exhaustive = solved.exhaustive;
    }
  } else {
    // Minimise the failure domain: smallest port-count cap for which a feasible plan exists.
    const caps = [...new Set(catalog.map((s) => s.ports))].sort((a, b) => a - b);
    for (const cap of caps) {
      const subset = catalog.filter((s) => s.ports <= cap);
      const r = solveMinCost(subset, need, budget);
      if (r) {
        solved = r;
        skus = subset;
        totalNodes += r.nodes;
        exhaustive = r.exhaustive;
        break;
      }
    }
  }

  if (!solved || emptyNeed) {
    const cheapest = solveMinCost(catalog, need, Infinity);
    const base: HardwareSelection = {
      feasible: emptyNeed,
      objective,
      items: [],
      totalCostUsd: 0,
      totalPorts: 0,
      totalPoeWatts: 0,
      totalRackUnits: 0,
      largestFailureDomainPorts: 0,
      provenOptimal: true,
      nodesExplored: totalNodes,
      budgetUsd: Number.isFinite(budget) ? budget : null,
    };
    if (!emptyNeed) {
      base.reason = cheapest
        ? `Budget infeasible: the cheapest compliant bill of materials costs $${cheapest.cost.toLocaleString("en-US")} (> $${budget.toLocaleString("en-US")}).`
        : "No combination in the catalog satisfies the port / PoE / rack constraints.";
    }
    return base;
  }

  const items = skus
    .map((s, i) => ({ s, q: solved.counts[i] }))
    .filter((x) => x.q > 0)
    .map(({ s, q }) => ({ sku: s.sku, vendor: s.vendor, quantity: q, unitUsd: priceOf(s), totalUsd: priceOf(s) * q }));
  const used = items.map((it) => catalog.find((c) => c.sku === it.sku) as HardwareSku);
  return {
    feasible: true,
    objective,
    items,
    totalCostUsd: items.reduce((t, i) => t + i.totalUsd, 0),
    totalPorts: items.reduce((t, i, k) => t + i.quantity * used[k].ports, 0),
    totalPoeWatts: items.reduce((t, i, k) => t + i.quantity * used[k].poeBudgetW, 0),
    totalRackUnits: items.reduce((t, i, k) => t + i.quantity * used[k].rackUnits, 0),
    largestFailureDomainPorts: Math.max(...used.map((u) => u.ports)),
    provenOptimal: exhaustive,
    nodesExplored: totalNodes,
    budgetUsd: Number.isFinite(budget) ? budget : null,
  };
}

// ===========================================================================
// 7. Multi-objective Pareto frontier (cost vs latency vs resilience)
// ===========================================================================

export interface DesignRequirements {
  pcs: number;
  servers: number;
  aps: number;
  cameras: number;
  phones: number;
  printers?: number;
  budgetUsd: number;
  /** e.g. 0.999 or 0.9999 */
  targetAvailability: number;
  /** Peak aggregate traffic through the core in Mbps; derived from device counts when omitted. */
  peakTrafficMbps?: number;
  /** Fraction of spare access ports kept for growth. */
  growthHeadroom?: number;
  /** Restrict the catalog to these vendors (e.g. ["Cisco"] for a Packet Tracer lab). */
  vendors?: HardwareSku["vendor"][];
}

export type ArchitectureKind = "min-cost" | "balanced" | "max-resilience";

export interface ArchitectureCandidate {
  id: string;
  coreRouters: number;
  firewalls: number;
  ispLinks: number;
  uplinkMbps: number;
  router: string;
  firewall: string;
  accessSwitches: HardwareSelection["items"];
  accessSwitchCount: number;
  costUsd: number;
  latencyMs: number;
  availability: number;
  downtimeMinPerYear: number;
  bottleneckUtilization: number;
  survivesN1: boolean;
  meetsSla: boolean;
  /** Arguments a generate_topology call would use to materialise this design. */
  topologyArgs: { devices: { type: DeviceType; count: number }[]; vlan: true; routingProtocol: "OSPF" };
}

export interface ParetoResult {
  feasible: boolean;
  requirements: DesignRequirements & { peakTrafficMbps: number };
  derived: { accessPorts: number; poePorts: number; poeWatts: number };
  candidatesEvaluated: number;
  frontier: ArchitectureCandidate[];
  picks: Partial<Record<ArchitectureKind, ArchitectureCandidate>>;
  reason?: string;
  formulas: string[];
}

const SFP_PAIR_USD = 120;

export function derivePeakTrafficMbps(req: DesignRequirements): number {
  return round(
    req.pcs * DEMAND_MBPS.PC +
      req.servers * DEMAND_MBPS.SERVER +
      req.aps * DEMAND_MBPS.AP +
      req.cameras * DEMAND_MBPS.CAMERA +
      req.phones * DEMAND_MBPS.IP_PHONE +
      (req.printers ?? 0) * DEMAND_MBPS.PRINTER,
    2,
  );
}

const dominates = (a: ArchitectureCandidate, b: ArchitectureCandidate) =>
  a.costUsd <= b.costUsd &&
  a.latencyMs <= b.latencyMs &&
  a.downtimeMinPerYear <= b.downtimeMinPerYear &&
  (a.costUsd < b.costUsd || a.latencyMs < b.latencyMs || a.downtimeMinPerYear < b.downtimeMinPerYear);

export function designParetoFrontier(req: DesignRequirements): ParetoResult {
  const peak = req.peakTrafficMbps ?? derivePeakTrafficMbps(req);
  const headroom = req.growthHeadroom ?? 0.2;
  const wired = req.pcs + req.servers + req.aps + req.cameras + req.phones + (req.printers ?? 0);
  const accessPorts = Math.ceil(wired * (1 + headroom));
  const poePorts = req.aps + req.cameras + req.phones;
  const poeWatts = round(req.aps * 25.5 + req.cameras * 12.95 + req.phones * 7, 2);
  const requirementsOut = { ...req, peakTrafficMbps: peak };
  const formulas = [
    "Availability (series): A = Π A_i; parallel pair: 1 - (1 - A)^2; A_device = MTBF / (MTBF + MTTR)",
    "Queueing: rho = lambda / mu, W = 1 / (mu - lambda) per hop (M/M/1, 1500 B packets)",
    "Downtime = (1 - A) x 525,600 min/year",
    "Pareto: A dominates B iff A is <= B on cost, latency and downtime and < on at least one",
  ];

  const base = {
    requirements: requirementsOut,
    derived: { accessPorts, poePorts, poeWatts },
    formulas,
  };

  const vendorOk = (s: HardwareSku) => !req.vendors?.length || req.vendors.includes(s.vendor);
  const switchCatalog = ACCESS_SWITCHES.filter(vendorOk);
  const switchSel = selectAccessSwitches({ ports: accessPorts, poePorts, poeWatts }, { objective: "min-cost", catalog: switchCatalog });
  const switchSelResilient = selectAccessSwitches({ ports: accessPorts, poePorts, poeWatts }, { objective: "max-resilience", catalog: switchCatalog });
  if (!switchSel.feasible) {
    return { ...base, feasible: false, candidatesEvaluated: 0, frontier: [], picks: {}, reason: switchSel.reason };
  }

  const routerOptions = ROUTERS.filter((r) => vendorOk(r) && r.throughputMbps >= peak).sort((a, b) => priceOf(a) - priceOf(b));
  const fwOptions = FIREWALLS.filter((f) => vendorOk(f) && f.throughputMbps >= peak).sort((a, b) => priceOf(a) - priceOf(b));
  if (!routerOptions.length || !fwOptions.length) {
    return {
      ...base,
      feasible: false,
      candidatesEvaluated: 0,
      frontier: [],
      picks: {},
      reason: `No catalog router/firewall sustains ${peak} Mbps of peak traffic.`,
    };
  }
  const router = routerOptions[0];
  const firewall = fwOptions[0];

  const aSw = availabilityOf(RELIABILITY.switch);
  const aRt = availabilityOf(RELIABILITY.router);
  const aFw = availabilityOf(RELIABILITY.firewall);
  const par = (a: number, k: number) => 1 - (1 - a) ** k;

  const candidates: ArchitectureCandidate[] = [];
  for (const cores of [1, 2]) {
    for (const fws of [1, 2]) {
      for (const isps of [1, 2]) {
        for (const uplink of [1000, 10_000]) {
          for (const resilientAccess of [false, true]) {
            const sel = resilientAccess ? switchSelResilient : switchSel;
            if (!sel.feasible) continue;
            const accessCount = sel.items.reduce((s, i) => s + i.quantity, 0);
            const uplinkCost = uplink === 10_000 ? accessCount * cores * SFP_PAIR_USD : accessCount * cores * 15;
            const cost =
              sel.totalCostUsd + cores * priceOf(router) + fws * priceOf(firewall) + uplinkCost + (isps - 1) * 150;
            // Core load split across active/active routers; a failed core carries everything (N-1).
            const perCoreLoad = peak / cores;
            const hopUtil = perCoreLoad / uplink;
            const q = mm1(perCoreLoad, uplink);
            const hops = 3; // access -> core -> edge
            const latency = q.delayMs === null ? Infinity : round(q.delayMs * hops + 0.03, 6);
            const A = aSw * par(aRt, cores) * par(aFw, fws) * par(ISP_AVAILABILITY, isps);
            const survives = cores >= 2 && fws >= 2 && isps >= 2 && peak / uplink < 1;
            if (!Number.isFinite(latency)) continue;
            candidates.push({
              id: `c${cores}-f${fws}-i${isps}-u${uplink / 1000}g-${resilientAccess ? "r" : "m"}`,
              coreRouters: cores,
              firewalls: fws,
              ispLinks: isps,
              uplinkMbps: uplink,
              router: router.sku,
              firewall: firewall.sku,
              accessSwitches: sel.items,
              accessSwitchCount: accessCount,
              costUsd: Math.round(cost),
              latencyMs: latency,
              availability: A,
              downtimeMinPerYear: round((1 - A) * 525_600, 2),
              bottleneckUtilization: round(hopUtil, 4),
              survivesN1: survives,
              meetsSla: A >= req.targetAvailability,
              topologyArgs: {
                devices: [
                  { type: "ROUTER", count: cores },
                  { type: "FIREWALL", count: fws },
                  // Lab/simulation model: keep <= 20 endpoints per access switch so the
                  // Packet Tracer 2960 limit (26 ports incl. uplinks) holds after redundancy links.
                  { type: "SWITCH", count: Math.max(accessCount, Math.ceil(wired / 20)) },
                  ...(req.pcs ? [{ type: "PC" as const, count: req.pcs }] : []),
                  ...(req.servers ? [{ type: "SERVER" as const, count: req.servers }] : []),
                  ...(req.aps ? [{ type: "AP" as const, count: req.aps }] : []),
                  ...(req.cameras ? [{ type: "CAMERA" as const, count: req.cameras }] : []),
                  ...(req.phones ? [{ type: "IP_PHONE" as const, count: req.phones }] : []),
                  ...(req.printers ? [{ type: "PRINTER" as const, count: req.printers }] : []),
                ],
                vlan: true,
                routingProtocol: "OSPF",
              },
            });
          }
        }
      }
    }
  }

  const withinBudget = candidates.filter((c) => c.costUsd <= req.budgetUsd);
  if (withinBudget.length === 0) {
    const cheapest = candidates.slice().sort((a, b) => a.costUsd - b.costUsd)[0];
    return {
      ...base,
      feasible: false,
      candidatesEvaluated: candidates.length,
      frontier: [],
      picks: {},
      reason: cheapest
        ? `Budget infeasible: cheapest compliant architecture costs $${cheapest.costUsd.toLocaleString("en-US")}; shortfall $${(cheapest.costUsd - req.budgetUsd).toLocaleString("en-US")}.`
        : "No architecture satisfies the constraints.",
    };
  }

  const frontier = withinBudget
    .filter((c) => !withinBudget.some((o) => o !== c && dominates(o, c)))
    .sort((a, b) => a.costUsd - b.costUsd || a.id.localeCompare(b.id));

  const slaOk = frontier.filter((c) => c.meetsSla);
  const minCost = (slaOk.length ? slaOk : frontier)[0];
  const maxRes = frontier
    .slice()
    .sort((a, b) => a.downtimeMinPerYear - b.downtimeMinPerYear || a.costUsd - b.costUsd)[0];

  const range = (f: (c: ArchitectureCandidate) => number) => {
    const v = frontier.map(f);
    return { min: Math.min(...v), span: Math.max(...v) - Math.min(...v) || 1 };
  };
  const rc = range((c) => c.costUsd);
  const rl = range((c) => c.latencyMs);
  const rd = range((c) => c.downtimeMinPerYear);
  const dist = (c: ArchitectureCandidate) =>
    Math.hypot((c.costUsd - rc.min) / rc.span, (c.latencyMs - rl.min) / rl.span, (c.downtimeMinPerYear - rd.min) / rd.span);
  const balancedPool = (slaOk.length ? slaOk : frontier).filter((c) => c !== minCost && c !== maxRes);
  const balanced = (balancedPool.length ? balancedPool : frontier.filter((c) => c !== minCost && c !== maxRes))
    .slice()
    .sort((a, b) => dist(a) - dist(b) || a.costUsd - b.costUsd)[0];

  const picks: ParetoResult["picks"] = { "min-cost": minCost, "max-resilience": maxRes };
  if (balanced) picks.balanced = balanced;

  return {
    ...base,
    feasible: true,
    candidatesEvaluated: candidates.length,
    frontier,
    picks,
    reason: slaOk.length ? undefined : `No in-budget architecture reaches ${(req.targetAvailability * 100).toFixed(3)}% availability; best is ${(maxRes.availability * 100).toFixed(4)}%.`,
  };
}

// ===========================================================================

function round(n: number, digits: number): number {
  if (!Number.isFinite(n)) return n;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
