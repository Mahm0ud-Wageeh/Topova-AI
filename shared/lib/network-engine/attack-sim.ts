import { assignAddressing } from "@/lib/network-engine/cisco";
import { tracePacket } from "@/lib/network-engine/simulator";
import type {
  AclRule,
  BuiltTopology,
  Device,
  DeviceType,
  FaultState,
  NetworkPlan,
} from "@/lib/network-engine/types";

const CRITICAL_TYPES: Set<DeviceType> = new Set(["SERVER", "ROUTER", "FIREWALL", "NVR"]);

export interface AttackStep {
  targetId: string;
  targetLabel: string;
  targetType: DeviceType;
  reachable: boolean;
  vector: string;
  severity: "critical" | "high" | "contained";
}

export interface AttackSimulationResult {
  entryDeviceId: string;
  entryLabel: string;
  totalCriticalAssets: number;
  exposedCriticalAssets: string[];
  compromisedDevices: string[];
  compromisedLinkIds: string[];
  blastRadiusPercent: number;
  contained: boolean;
  steps: AttackStep[];
  recommendation: string;
}

/**
 * Red-Team Lateral Movement Simulator:
 * Evaluates which critical assets and peer devices can be reached from a compromised
 * entry point across L2 broadcast domains and L3 inter-VLAN routing gated by ACLs.
 */
export function simulateAttackPath(
  topology: BuiltTopology,
  plan: NetworkPlan,
  entryDeviceId: string,
  acls: AclRule[] = [],
  faults?: FaultState,
): AttackSimulationResult {
  const byId = new Map<string, Device>(topology.devices.map((d) => [d.id, d]));
  const entry = byId.get(entryDeviceId) ?? topology.devices[0];
  if (!entry) {
    return {
      entryDeviceId,
      entryLabel: entryDeviceId,
      totalCriticalAssets: 0,
      exposedCriticalAssets: [],
      compromisedDevices: [],
      compromisedLinkIds: [],
      blastRadiusPercent: 0,
      contained: true,
      steps: [],
      recommendation: "Add devices to simulate lateral movement.",
    };
  }

  const addressing = assignAddressing(topology, plan);
  const entryVlan = addressing.byDevice[entry.id]?.vlanId;
  const hasFirewall = topology.devices.some((d) => d.type === "FIREWALL");
  const criticalDevices = topology.devices.filter(
    (d) => d.id !== entry.id && CRITICAL_TYPES.has(d.type),
  );

  const compromisedDevices = new Set<string>([entry.id]);
  const compromisedLinkIds = new Set<string>();
  const exposedCriticalAssets: string[] = [];
  const steps: AttackStep[] = [];

  for (const target of topology.devices) {
    if (target.id === entry.id) continue;
    const targetVlan = addressing.byDevice[target.id]?.vlanId;
    const isCritical = CRITICAL_TYPES.has(target.type);
    const sameSegment = addressing.mode === "flat" || entryVlan === targetVlan;

    // Test administrative/lateral movement port (SSH 22 / SMB 445)
    const probePort = target.type === "SERVER" || target.type === "NVR" ? 445 : 22;
    const trace = tracePacket(topology, plan, {
      sourceId: entry.id,
      destinationId: target.id,
      protocol: "TCP",
      port: probePort,
      acls,
      faults,
    });

    if (trace.reachable) {
      compromisedDevices.add(target.id);
      trace.traversedLinkIds.forEach((id) => compromisedLinkIds.add(id));
      if (isCritical) exposedCriticalAssets.push(target.id);
      steps.push({
        targetId: target.id,
        targetLabel: target.label,
        targetType: target.type,
        reachable: true,
        vector: sameSegment
          ? `Unrestricted L2 lateral reachability (${addressing.mode === "flat" ? "flat LAN" : `shared VLAN ${entryVlan}`})`
          : `Unfiltered L3 inter-VLAN route (VLAN ${entryVlan} -> VLAN ${targetVlan}, TCP/${probePort})`,
        severity: isCritical ? "critical" : "high",
      });
    } else if (isCritical) {
      steps.push({
        targetId: target.id,
        targetLabel: target.label,
        targetType: target.type,
        reachable: false,
        vector:
          trace.verdict === "blocked-by-acl"
            ? `Contained by Zero-Trust ACL (${trace.blockedByRuleId ?? "policy"})`
            : "Isolated — no active path",
        severity: "contained",
      });
    }
  }

  const totalCriticalAssets = criticalDevices.length;
  const blastRadiusPercent =
    totalCriticalAssets > 0
      ? Math.round((exposedCriticalAssets.length / totalCriticalAssets) * 100)
      : topology.devices.length > 1
        ? Math.round(((compromisedDevices.size - 1) / (topology.devices.length - 1)) * 100)
        : 0;

  const contained = exposedCriticalAssets.length === 0;
  let recommendation = "Zero-Trust segmentation successfully contains lateral movement from this node.";
  if (!contained) {
    if (addressing.mode === "flat") {
      recommendation =
        "Critical assets share a flat L2 subnet with endpoints. Enable VLAN segmentation, add a Firewall, and apply Zero-Trust ACLs.";
    } else if (!hasFirewall || acls.length === 0) {
      recommendation =
        "Inter-VLAN routing permits unrestricted administrative traffic. Apply Zero-Trust Inter-VLAN ACLs and perimeter firewall filtering.";
    } else {
      recommendation = `Tighten ACL rules restricting VLAN ${entryVlan ?? "source"} access to management/server ports.`;
    }
  }

  return {
    entryDeviceId: entry.id,
    entryLabel: entry.label,
    totalCriticalAssets,
    exposedCriticalAssets,
    compromisedDevices: [...compromisedDevices],
    compromisedLinkIds: [...compromisedLinkIds],
    blastRadiusPercent,
    contained,
    steps,
    recommendation,
  };
}
