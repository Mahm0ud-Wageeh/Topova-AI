import { assignAddressing } from "@/lib/network-engine/cisco";
import { TYPE_VLAN } from "@/lib/network-engine/vlan-planner";
import type {
  AclRule,
  BuiltTopology,
  Connection,
  Device,
  FaultState,
  NetworkPlan,
  PacketHop,
  PacketTraceRequest,
  PacketTraceResult,
  SpofAnalysis,
} from "@/lib/network-engine/types";

function activeGraph(topology: BuiltTopology, faults?: FaultState) {
  const disabledDevices = new Set(faults?.disabledDevices ?? []);
  const disabledLinks = new Set(faults?.disabledLinks ?? []);
  const devices = topology.devices.filter((d) => !disabledDevices.has(d.id));
  const activeIds = new Set(devices.map((d) => d.id));
  const links = topology.connections.filter(
    (c) => !disabledLinks.has(c.id) && activeIds.has(c.from) && activeIds.has(c.to),
  );
  const adj = new Map<string, { neighbor: string; link: Connection }[]>();
  for (const d of devices) adj.set(d.id, []);
  for (const c of links) {
    adj.get(c.from)!.push({ neighbor: c.to, link: c });
    adj.get(c.to)!.push({ neighbor: c.from, link: c });
  }
  return { devices, links, adj, disabledDevices, disabledLinks };
}

/**
 * Deterministic Tarjan algorithm for articulation points (SPOF devices)
 * and bridge edges (SPOF cables) plus Chaos Fault-Injection blast radius.
 */
export function analyzeSpof(
  topology: BuiltTopology,
  plan: NetworkPlan,
  faults?: FaultState,
): SpofAnalysis {
  if (topology.devices.length === 0) {
    return {
      criticalDevices: [],
      criticalLinks: [],
      unreachableDevices: [],
      affectedVlans: [],
      connectedRatio: 1,
      redundancyScore: 100,
      suggestions: [],
    };
  }

  const { devices, adj, disabledDevices } = activeGraph(topology, faults);
  const addressing = assignAddressing(topology, plan);

  // Tarjan DFS for articulation points & bridges on active graph
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const articulation = new Set<string>();
  const bridges = new Set<string>();
  let time = 0;

  const dfs = (u: string) => {
    disc.set(u, ++time);
    low.set(u, time);
    let children = 0;

    for (const { neighbor: v, link } of adj.get(u) ?? []) {
      if (!disc.has(v)) {
        children++;
        parent.set(v, u);
        dfs(v);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));

        if (parent.get(u) === null && children > 1) {
          articulation.add(u);
        }
        if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) {
          articulation.add(u);
        }
        if (low.get(v)! > disc.get(u)!) {
          bridges.add(link.id);
        }
      } else if (v !== parent.get(u)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  };

  for (const d of devices) {
    if (!disc.has(d.id)) {
      parent.set(d.id, null);
      dfs(d.id);
    }
  }

  // Only flag infrastructure bridges (links between non-leaf devices) as SPOF cables
  const degree = new Map<string, number>();
  for (const d of devices) degree.set(d.id, (adj.get(d.id) ?? []).length);
  const criticalLinks = topology.connections
    .filter((c) => bridges.has(c.id) && (degree.get(c.from) ?? 0) > 1 && (degree.get(c.to) ?? 0) > 1)
    .map((c) => c.id);

  // Reachability from core gateway (active Router -> Firewall -> Switch -> first active)
  const core =
    devices.find((d) => d.type === "ROUTER") ??
    devices.find((d) => d.type === "FIREWALL") ??
    devices.find((d) => d.type === "SWITCH") ??
    devices[0];

  const reachableFromCore = new Set<string>();
  if (core) {
    const queue = [core.id];
    reachableFromCore.add(core.id);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const { neighbor } of adj.get(cur) ?? []) {
        if (!reachableFromCore.has(neighbor)) {
          reachableFromCore.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  const unreachableDevices = topology.devices
    .filter((d) => !reachableFromCore.has(d.id))
    .map((d) => d.id);

  const affectedVlans = [
    ...new Set(
      unreachableDevices
        .map((id) => addressing.byDevice[id]?.vlanId)
        .filter((v): v is number => typeof v === "number"),
    ),
  ].sort((a, b) => a - b);

  const connectedRatio =
    topology.devices.length > 0
      ? Number((reachableFromCore.size / topology.devices.length).toFixed(2))
      : 1;

  const criticalDevices = [...articulation];
  const routers = topology.devices.filter((d) => d.type === "ROUTER" && !disabledDevices.has(d.id));
  let redundancyScore = 100;
  if (routers.length <= 1 && topology.devices.length > 2) redundancyScore -= 25;
  redundancyScore -= Math.min(35, criticalDevices.length * 10);
  redundancyScore -= Math.min(20, criticalLinks.length * 10);
  redundancyScore -= Math.round((1 - connectedRatio) * 40);
  redundancyScore = Math.max(0, Math.min(100, redundancyScore));

  const suggestions: string[] = [];
  if (routers.length <= 1 && topology.devices.length > 2) {
    suggestions.push("Add a secondary edge router with HSRP/VRRP to eliminate the single gateway SPOF.");
  }
  if (criticalLinks.length > 0) {
    suggestions.push(
      `Add redundant uplink/EtherChannel paths to remove ${criticalLinks.length} critical bridge link(s).`,
    );
  }
  if (unreachableDevices.length > 0) {
    suggestions.push(
      `${unreachableDevices.length} device(s) are currently isolated from the core gateway.`,
    );
  }

  return {
    criticalDevices,
    criticalLinks,
    unreachableDevices,
    affectedVlans,
    connectedRatio,
    redundancyScore,
    suggestions,
  };
}

function evaluateAcls(
  acls: AclRule[],
  srcVlan: number | undefined,
  dstVlan: number | undefined,
  protocol: "ICMP" | "TCP" | "UDP",
  port?: number,
): { allowed: boolean; matchedRule?: AclRule } {
  if (!acls.length || srcVlan === undefined || dstVlan === undefined || srcVlan === dstVlan) {
    return { allowed: true };
  }
  const protoLower = protocol.toLowerCase();
  for (const rule of acls) {
    const srcMatch = rule.sourceVlan === "any" || rule.sourceVlan === srcVlan;
    const dstMatch = rule.destinationVlan === "any" || rule.destinationVlan === dstVlan;
    const protoMatch = rule.protocol === "ip" || rule.protocol === protoLower;
    const portMatch = rule.port === undefined || (port !== undefined && rule.port === port);
    if (srcMatch && dstMatch && protoMatch && portMatch) {
      return { allowed: rule.action === "permit", matchedRule: rule };
    }
  }
  return { allowed: true };
}

/**
 * Traces a packet hop-by-hop across the active topology, computing L2 VLAN tagging,
 * L3 routing gateway transitions, TTL decrements, latency, and ACL inspection verdicts.
 */
export function tracePacket(
  topology: BuiltTopology,
  plan: NetworkPlan,
  req: PacketTraceRequest,
): PacketTraceResult {
  const { adj, disabledDevices } = activeGraph(topology, req.faults);
  const byId = new Map<string, Device>(topology.devices.map((d) => [d.id, d]));
  const srcDev = byId.get(req.sourceId);
  const dstDev = byId.get(req.destinationId);

  if (!srcDev || !dstDev) {
    return {
      reachable: false,
      verdict: "unreachable",
      summary: "Source or destination device was not found in the topology.",
      totalLatencyMs: 0,
      hops: [],
      traversedLinkIds: [],
    };
  }

  const addressing = assignAddressing(topology, plan);
  const srcAddr = addressing.byDevice[srcDev.id];
  const dstAddr = addressing.byDevice[dstDev.id];
  const srcIp = srcAddr?.interfaces[0]?.ip ?? "0.0.0.0";
  const dstIp = dstAddr?.interfaces[0]?.ip ?? "0.0.0.0";
  const srcVlan = srcAddr?.vlanId ?? (addressing.mode === "vlan" ? TYPE_VLAN[srcDev.type] : undefined);
  const dstVlan = dstAddr?.vlanId ?? (addressing.mode === "vlan" ? TYPE_VLAN[dstDev.type] : undefined);

  if (disabledDevices.has(srcDev.id) || disabledDevices.has(dstDev.id)) {
    return {
      reachable: false,
      verdict: "fault-dropped",
      summary: `${disabledDevices.has(srcDev.id) ? srcDev.label : dstDev.label} is offline due to an injected fault.`,
      totalLatencyMs: 0,
      hops: [
        {
          step: 1,
          deviceId: srcDev.id,
          label: srcDev.label,
          type: srcDev.type,
          layer: "L3",
          vlanTag: srcVlan,
          ttl: 64,
          srcIp,
          dstIp,
          action: "drop",
          reason: "Endpoint interface is administratively down (fault injected).",
          latencyMs: 0,
        },
      ],
      traversedLinkIds: [],
    };
  }

  if (srcDev.id === dstDev.id) {
    return {
      reachable: true,
      verdict: "delivered",
      summary: `Loopback packet delivered locally on ${srcDev.label} (${srcIp}).`,
      totalLatencyMs: 0.1,
      hops: [
        {
          step: 1,
          deviceId: srcDev.id,
          label: srcDev.label,
          type: srcDev.type,
          layer: "L3",
          vlanTag: srcVlan,
          ttl: 64,
          srcIp,
          dstIp,
          action: "deliver",
          reason: "Local loopback interface delivery.",
          latencyMs: 0.1,
        },
      ],
      traversedLinkIds: [],
    };
  }

  // BFS shortest active path
  const prev = new Map<string, { from: string; link: Connection }>();
  const visited = new Set<string>([srcDev.id]);
  const queue = [srcDev.id];
  let found = false;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === dstDev.id) {
      found = true;
      break;
    }
    for (const edge of adj.get(cur) ?? []) {
      if (!visited.has(edge.neighbor)) {
        visited.add(edge.neighbor);
        prev.set(edge.neighbor, { from: cur, link: edge.link });
        queue.push(edge.neighbor);
      }
    }
  }

  if (!found) {
    const hasFaults =
      (req.faults?.disabledDevices.length ?? 0) > 0 || (req.faults?.disabledLinks.length ?? 0) > 0;
    return {
      reachable: false,
      verdict: hasFaults ? "fault-dropped" : "unreachable",
      summary: hasFaults
        ? `No active path from ${srcDev.label} to ${dstDev.label} after fault injection.`
        : `No physical path exists between ${srcDev.label} and ${dstDev.label}.`,
      totalLatencyMs: 0,
      hops: [
        {
          step: 1,
          deviceId: srcDev.id,
          label: srcDev.label,
          type: srcDev.type,
          layer: "L3",
          vlanTag: srcVlan,
          ttl: 64,
          srcIp,
          dstIp,
          action: "drop",
          reason: "Destination host unreachable — no route/link available.",
          latencyMs: 0,
        },
      ],
      traversedLinkIds: [],
    };
  }

  // Reconstruct path
  const pathNodes: { device: Device; incomingLink?: Connection }[] = [];
  let cursor: string | undefined = dstDev.id;
  while (cursor) {
    const edge = prev.get(cursor);
    pathNodes.unshift({ device: byId.get(cursor)!, incomingLink: edge?.link });
    cursor = edge?.from;
  }

  const interVlan =
    addressing.mode === "vlan" && srcVlan !== undefined && dstVlan !== undefined && srcVlan !== dstVlan;

  // For inter-VLAN traffic that doesn't physically pass through a ROUTER/FIREWALL (e.g. both PCs on same switch),
  // model the router-on-a-stick L3 gateway hairpin if a reachable router exists!
  const needsGatewayHairpin =
    interVlan && !pathNodes.some((n) => n.device.type === "ROUTER" || n.device.type === "FIREWALL");

  if (needsGatewayHairpin) {
    const router = topology.devices.find((d) => d.type === "ROUTER" && !disabledDevices.has(d.id));
    if (!router) {
      return {
        reachable: false,
        verdict: "fault-dropped",
        summary: `Inter-VLAN routing from VLAN ${srcVlan} to VLAN ${dstVlan} failed — no active gateway router.`,
        totalLatencyMs: 0,
        hops: [
          {
            step: 1,
            deviceId: srcDev.id,
            label: srcDev.label,
            type: srcDev.type,
            layer: "L3",
            vlanTag: srcVlan,
            ttl: 64,
            srcIp,
            dstIp,
            action: "drop",
            reason: `Gateway for VLAN ${srcVlan} is unavailable.`,
            latencyMs: 0,
          },
        ],
        traversedLinkIds: [],
      };
    }
    // Check router reachability from source
    const rPrev = new Map<string, { from: string; link: Connection }>();
    const rVis = new Set<string>([srcDev.id]);
    const rQ = [srcDev.id];
    let routerFound = false;
    while (rQ.length > 0) {
      const c = rQ.shift()!;
      if (c === router.id) {
        routerFound = true;
        break;
      }
      for (const e of adj.get(c) ?? []) {
        if (!rVis.has(e.neighbor)) {
          rVis.add(e.neighbor);
          rPrev.set(e.neighbor, { from: c, link: e.link });
          rQ.push(e.neighbor);
        }
      }
    }
    if (!routerFound) {
      return {
        reachable: false,
        verdict: "fault-dropped",
        summary: `Inter-VLAN packet dropped: ${srcDev.label} cannot reach gateway ${router.label}.`,
        totalLatencyMs: 0,
        hops: [
          {
            step: 1,
            deviceId: srcDev.id,
            label: srcDev.label,
            type: srcDev.type,
            layer: "L3",
            vlanTag: srcVlan,
            ttl: 64,
            srcIp,
            dstIp,
            action: "drop",
            reason: `Uplink trunk to ${router.label} is down.`,
            latencyMs: 0,
          },
        ],
        traversedLinkIds: [],
      };
    }
    // Build src -> router -> dst hairpin
    const toRouter: { device: Device; incomingLink?: Connection }[] = [];
    let rc: string | undefined = router.id;
    while (rc) {
      const e = rPrev.get(rc);
      toRouter.unshift({ device: byId.get(rc)!, incomingLink: e?.link });
      rc = e?.from;
    }
    const dPrev = new Map<string, { from: string; link: Connection }>();
    const dVis = new Set<string>([router.id]);
    const dQ = [router.id];
    while (dQ.length > 0) {
      const c = dQ.shift()!;
      if (c === dstDev.id) break;
      for (const e of adj.get(c) ?? []) {
        if (!dVis.has(e.neighbor)) {
          dVis.add(e.neighbor);
          dPrev.set(e.neighbor, { from: c, link: e.link });
          dQ.push(e.neighbor);
        }
      }
    }
    const fromRouter: { device: Device; incomingLink?: Connection }[] = [];
    let dc: string | undefined = dstDev.id;
    while (dc && dc !== router.id) {
      const e = dPrev.get(dc);
      fromRouter.unshift({ device: byId.get(dc)!, incomingLink: e?.link });
      dc = e?.from;
    }
    pathNodes.length = 0;
    pathNodes.push(...toRouter, ...fromRouter);
  }

  const hops: PacketHop[] = [];
  const traversedLinkIds: string[] = [];
  let ttl = 64;
  let currentVlan = srcVlan;
  let totalLatencyMs = 0;
  let aclChecked = false;

  for (let i = 0; i < pathNodes.length; i++) {
    const { device, incomingLink } = pathNodes[i];
    if (incomingLink) traversedLinkIds.push(incomingLink.id);
    const isFirst = i === 0;
    const isLast = i === pathNodes.length - 1;
    const hopLatency = isFirst
      ? 0.2
      : device.type === "FIREWALL"
        ? 1.8
        : device.type === "ROUTER"
          ? 1.2
          : 0.4;
    totalLatencyMs = Number((totalLatencyMs + hopLatency).toFixed(1));

    if (isFirst) {
      hops.push({
        step: i + 1,
        deviceId: device.id,
        label: device.label,
        type: device.type,
        layer: "L3",
        vlanTag: currentVlan,
        ttl,
        srcIp,
        dstIp,
        action: "originate",
        reason: `Originate ${req.protocol}${req.port ? `:${req.port}` : ""} frame from ${srcIp}${currentVlan ? ` (VLAN ${currentVlan})` : ""}.`,
        latencyMs: hopLatency,
      });
      continue;
    }

    if (device.type === "FIREWALL" || device.type === "ROUTER") {
      ttl = Math.max(1, ttl - 1);
      if (!aclChecked && interVlan && (req.acls?.length ?? 0) > 0) {
        aclChecked = true;
        const evalRes = evaluateAcls(req.acls!, srcVlan, dstVlan, req.protocol, req.port);
        if (!evalRes.allowed) {
          hops.push({
            step: i + 1,
            deviceId: device.id,
            label: device.label,
            type: device.type,
            incomingLinkId: incomingLink?.id,
            layer: device.type === "FIREWALL" ? "FW" : "L3",
            vlanTag: currentVlan,
            ttl,
            srcIp,
            dstIp,
            action: "drop",
            reason: `Blocked by ACL "${evalRes.matchedRule?.name}": ${evalRes.matchedRule?.description}`,
            latencyMs: hopLatency,
          });
          return {
            reachable: false,
            verdict: "blocked-by-acl",
            summary: `Packet blocked at ${device.label} by Zero-Trust ACL (${evalRes.matchedRule?.name}).`,
            totalLatencyMs,
            hops,
            traversedLinkIds: [...new Set(traversedLinkIds)],
            blockedByRuleId: evalRes.matchedRule?.id,
          };
        }
      }

      if (interVlan && currentVlan !== dstVlan) {
        const fromV = currentVlan;
        currentVlan = dstVlan;
        hops.push({
          step: i + 1,
          deviceId: device.id,
          label: device.label,
          type: device.type,
          incomingLinkId: incomingLink?.id,
          layer: device.type === "FIREWALL" ? "FW" : "L3",
          vlanTag: currentVlan,
          ttl,
          srcIp,
          dstIp,
          action: device.type === "FIREWALL" ? "inspect" : "route",
          reason: `L3 Inter-VLAN routing: re-tagged dot1Q VLAN ${fromV} -> VLAN ${currentVlan} (TTL=${ttl}).`,
          latencyMs: hopLatency,
        });
      } else {
        hops.push({
          step: i + 1,
          deviceId: device.id,
          label: device.label,
          type: device.type,
          incomingLinkId: incomingLink?.id,
          layer: device.type === "FIREWALL" ? "FW" : "L3",
          vlanTag: currentVlan,
          ttl,
          srcIp,
          dstIp,
          action: isLast ? "deliver" : device.type === "FIREWALL" ? "inspect" : "route",
          reason: isLast
            ? `Delivered to ${device.label} (${dstIp}).`
            : device.type === "FIREWALL"
              ? `Stateful firewall inspection passed (TTL=${ttl}).`
              : `L3 route lookup forwarded toward ${dstIp} (TTL=${ttl}).`,
          latencyMs: hopLatency,
        });
      }
      continue;
    }

    if (isLast) {
      hops.push({
        step: i + 1,
        deviceId: device.id,
        label: device.label,
        type: device.type,
        incomingLinkId: incomingLink?.id,
        layer: "L2",
        vlanTag: currentVlan,
        ttl,
        srcIp,
        dstIp,
        action: "deliver",
        reason: `Frame delivered to ${device.label} (${dstIp})${currentVlan ? ` on VLAN ${currentVlan}` : ""}.`,
        latencyMs: hopLatency,
      });
    } else {
      hops.push({
        step: i + 1,
        deviceId: device.id,
        label: device.label,
        type: device.type,
        incomingLinkId: incomingLink?.id,
        layer: "L2",
        vlanTag: currentVlan,
        ttl,
        srcIp,
        dstIp,
        action: "forward",
        reason: currentVlan
          ? `L2 switch forwarded frame on 802.1Q VLAN ${currentVlan}.`
          : "L2 switch forwarded Ethernet frame.",
        latencyMs: hopLatency,
      });
    }
  }

  return {
    reachable: true,
    verdict: "delivered",
    summary: `${req.protocol} packet delivered from ${srcDev.label} to ${dstDev.label} in ${hops.length} hop(s) (${totalLatencyMs} ms).`,
    totalLatencyMs,
    hops,
    traversedLinkIds: [...new Set(traversedLinkIds)],
  };
}
