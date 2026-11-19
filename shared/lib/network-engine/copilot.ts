import { autoRemediateTopology, generateZeroTrustAcls } from "@/lib/network-engine/auditor";
import { ruleParse } from "@/lib/network-engine/parser/rule-parser";
import { planNetwork } from "@/lib/network-engine/planner";
import { cableFor, computeLayout } from "@/lib/network-engine/topology-builder";
import type {
  AclRule,
  BuiltTopology,
  Connection,
  Device,
  DeviceType,
  NetworkPlan,
} from "@/lib/network-engine/types";

const PREFIX: Record<DeviceType, string> = {
  ROUTER: "R",
  SWITCH: "SW",
  SERVER: "SRV",
  PC: "PC",
  FIREWALL: "FW",
  AP: "AP",
  PRINTER: "PRN",
  CAMERA: "CAM",
  NVR: "NVR",
  IP_PHONE: "PH",
};

const ENDPOINT_TYPES: Set<DeviceType> = new Set([
  "PC",
  "SERVER",
  "AP",
  "PRINTER",
  "CAMERA",
  "NVR",
  "IP_PHONE",
]);

export interface CopilotState {
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls: AclRule[];
}

export interface CopilotDiff {
  addedDevices: Device[];
  removedDevices: Device[];
  addedLinks: Connection[];
  removedLinks: Connection[];
  vlanChange?: string;
  routingChange?: string;
  aclDelta: number;
}

export interface CopilotProposal {
  summary: string;
  actions: string[];
  diff: CopilotDiff;
  nextState: CopilotState;
}

function nextIdFor(devices: Device[], type: DeviceType): string {
  const prefix = PREFIX[type];
  const existing = new Set(devices.map((d) => d.id));
  let idx = 1;
  while (existing.has(`${prefix}${idx}`)) idx++;
  return `${prefix}${idx}`;
}

/**
 * Deterministic Arabic/English conversational Co-Pilot engine.
 * Parses incremental instructions ("add 4 cameras", "احذف 2 PC", "اعزل الشبكات وفعّل OSPF",
 * "apply zero trust / harden / redundancy") and returns a structured diff preview + next state.
 */
export function applyCopilotInstruction(
  current: CopilotState,
  instruction: string,
): CopilotProposal {
  const text = instruction.trim();
  const lower = text.toLowerCase().replace(/[أإآ]/g, "ا");

  let devices: Device[] = current.topology.devices.map((d) => ({ ...d }));
  let connections: Connection[] = current.topology.connections.map((c) => ({ ...c }));
  let acls: AclRule[] = current.acls.map((a) => ({ ...a }));
  const actions: string[] = [];

  const isRemove =
    /(?:^|\s)(?:remove|delete|drop|احذف|شيل|ازالة|حذف|امسح)(?:\s|$)/iu.test(lower);
  const wantsZeroTrust =
    /(?:zero[\s-]?trust|harden|remediat|secure|protect|acl|firewall policy|أمن|حماية|تحصين|عزل صفري|قواعد)/iu.test(
      lower,
    );
  const wantsRedundancy =
    /(?:redundan|ha\b|high availability|failover|backup router|احتياطي|تكرار|توافر)/iu.test(lower);

  const parsed = ruleParse(text);
  const addedDevices: Device[] = [];
  const removedDevices: Device[] = [];
  const addedLinks: Connection[] = [];
  const removedLinks: Connection[] = [];

  let nextEdgeNum =
    connections.reduce((max, c) => {
      const n = parseInt(c.id.replace(/\D+/g, ""), 10);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, connections.length) + 1;

  const connect = (from: string, to: string) => {
    if (from === to) return;
    if (connections.some((c) => (c.from === from && c.to === to) || (c.from === to && c.to === from))) {
      return;
    }
    const a = devices.find((d) => d.id === from);
    const b = devices.find((d) => d.id === to);
    const link: Connection = {
      id: `e${nextEdgeNum++}`,
      from,
      to,
      meta: { cableType: a && b ? cableFor(a.type, b.type) : "Straight-through" },
    };
    connections.push(link);
    addedLinks.push(link);
  };

  // 1. Handle device removals or additions
  if (parsed.devices.length > 0) {
    if (isRemove) {
      for (const item of parsed.devices) {
        const matching = devices.filter((d) => d.type === item.type);
        const toDrop = matching.slice(-item.count);
        const dropIds = new Set(toDrop.map((d) => d.id));
        if (toDrop.length > 0) {
          removedDevices.push(...toDrop);
          devices = devices.filter((d) => !dropIds.has(d.id));
          const droppedEdges = connections.filter((c) => dropIds.has(c.from) || dropIds.has(c.to));
          removedLinks.push(...droppedEdges);
          connections = connections.filter((c) => !dropIds.has(c.from) && !dropIds.has(c.to));
          actions.push(`Removed ${toDrop.length} ${item.type} device(s): ${toDrop.map((d) => d.label).join(", ")}.`);
        }
      }
    } else {
      for (const item of parsed.devices) {
        const cap = Math.min(item.count, Math.max(0, 500 - devices.length));
        const createdBatch: Device[] = [];
        for (let i = 0; i < cap; i++) {
          const id = nextIdFor(devices, item.type);
          const dev: Device = { id, label: id, type: item.type };
          devices.push(dev);
          addedDevices.push(dev);
          createdBatch.push(dev);

          // Auto-wire new device cleanly into the existing hierarchy
          const switches = devices.filter((d) => d.type === "SWITCH" && d.id !== dev.id);
          const firewalls = devices.filter((d) => d.type === "FIREWALL" && d.id !== dev.id);
          const routers = devices.filter((d) => d.type === "ROUTER" && d.id !== dev.id);

          if (ENDPOINT_TYPES.has(dev.type)) {
            const parent = switches[i % Math.max(1, switches.length)] ?? firewalls[0] ?? routers[0];
            if (parent) connect(parent.id, dev.id);
          } else if (dev.type === "SWITCH") {
            const parent = firewalls[0] ?? routers[0] ?? switches[0];
            if (parent) connect(parent.id, dev.id);
          } else if (dev.type === "FIREWALL") {
            if (routers[0]) connect(routers[0].id, dev.id);
            if (switches[0]) connect(dev.id, switches[0].id);
          } else if (dev.type === "ROUTER") {
            if (routers[0]) connect(routers[0].id, dev.id);
            if (firewalls[0]) connect(dev.id, firewalls[0].id);
            else if (switches[0]) connect(dev.id, switches[0].id);
          }
        }
        if (createdBatch.length > 0) {
          actions.push(`Added ${createdBatch.length} ${item.type} device(s): ${createdBatch.map((d) => d.label).join(", ")}.`);
        }
      }
    }
  }

  // 2. Redundancy shortcut if requested without explicit device count
  if (wantsRedundancy && parsed.devices.length === 0) {
    const routers = devices.filter((d) => d.type === "ROUTER");
    if (routers.length === 1) {
      const id = nextIdFor(devices, "ROUTER");
      const r2: Device = { id, label: id, type: "ROUTER" };
      devices.push(r2);
      addedDevices.push(r2);
      connect(routers[0].id, r2.id);
      const target = devices.find((d) => d.type === "FIREWALL") ?? devices.find((d) => d.type === "SWITCH");
      if (target) connect(r2.id, target.id);
      actions.push(`Added redundant gateway router (${r2.label}) with failover uplink.`);
    }
  }

  // 3. Recompute plan respecting VLAN / routing requests
  let nextTopology: BuiltTopology = {
    devices,
    connections,
    layout: computeLayout(devices, connections, "tree"),
  };

  const enableVlans =
    current.plan.vlanPlan.length > 0 || parsed.options.vlan || wantsZeroTrust;
  const routingProtocol = parsed.options.routingProtocol ?? current.plan.routing.protocol;
  let nextPlan = planNetwork(nextTopology, undefined, {
    vlan: enableVlans,
    routingProtocol,
  });

  // 4. Zero-Trust hardening / auto-remediation if requested
  if (wantsZeroTrust) {
    const hardened = autoRemediateTopology(nextTopology, nextPlan, acls);
    const prevIds = new Set(devices.map((d) => d.id));
    for (const d of hardened.topology.devices) {
      if (!prevIds.has(d.id)) addedDevices.push(d);
    }
    const prevLinkIds = new Set(connections.map((c) => c.id));
    for (const c of hardened.topology.connections) {
      if (!prevLinkIds.has(c.id)) addedLinks.push(c);
    }
    nextTopology = hardened.topology;
    nextPlan = hardened.plan;
    acls = hardened.acls;
    actions.push(...hardened.changesSummary);
  } else if (enableVlans && acls.length > 0) {
    // Refresh Zero-Trust ACLs to cover any newly introduced VLANs
    acls = generateZeroTrustAcls(nextPlan);
  }

  const vlanChange =
    current.plan.vlanPlan.length !== nextPlan.vlanPlan.length
      ? `${current.plan.vlanPlan.length} VLAN(s) -> ${nextPlan.vlanPlan.length} VLAN(s)`
      : undefined;
  const routingChange =
    current.plan.routing.protocol !== nextPlan.routing.protocol
      ? `${current.plan.routing.protocol} -> ${nextPlan.routing.protocol}`
      : undefined;

  if (vlanChange && !actions.some((a) => a.includes("VLAN"))) {
    actions.push(`Updated segmentation: ${vlanChange}.`);
  }
  if (routingChange) {
    actions.push(`Switched routing protocol: ${routingChange}.`);
  }

  const summary =
    actions.length > 0
      ? actions.join(" ")
      : "No structural changes matched that prompt. Try commands like 'Add 4 cameras and isolate them in VLAN' or 'Enable OSPF and add a firewall'.";

  return {
    summary,
    actions,
    diff: {
      addedDevices,
      removedDevices,
      addedLinks,
      removedLinks,
      vlanChange,
      routingChange,
      aclDelta: acls.length - current.acls.length,
    },
    nextState: {
      topology: nextTopology,
      plan: nextPlan,
      acls,
    },
  };
}
