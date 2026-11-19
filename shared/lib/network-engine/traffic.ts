import { tracePacket } from "@/lib/network-engine/simulator";
import type {
  BuiltTopology,
  CableType,
  DeviceType,
  FaultState,
  NetworkPlan,
} from "@/lib/network-engine/types";

export type TrafficProfile = "office" | "surveillance" | "voip" | "cloud-backup";

export interface LinkTrafficMetric {
  linkId: string;
  from: string;
  to: string;
  cableType: CableType;
  loadMbps: number;
  capacityMbps: number;
  utilizationPercent: number;
  status: "healthy" | "elevated" | "congested";
  recommendation?: string;
}

export interface TrafficForecastResult {
  profile: TrafficProfile;
  multiplier: number;
  totalDemandMbps: number;
  peakUtilizationPercent: number;
  congestedLinks: number;
  elevatedLinks: number;
  links: LinkTrafficMetric[];
}

const BASE_MBPS: Record<TrafficProfile, Partial<Record<DeviceType, number>>> = {
  office: { PC: 18, AP: 140, CAMERA: 8, IP_PHONE: 0.2, PRINTER: 2, SERVER: 40, NVR: 15 },
  surveillance: { PC: 10, AP: 80, CAMERA: 28, IP_PHONE: 0.2, PRINTER: 1, SERVER: 25, NVR: 60 },
  voip: { PC: 15, AP: 120, CAMERA: 6, IP_PHONE: 2.5, PRINTER: 1, SERVER: 35, NVR: 10 },
  "cloud-backup": { PC: 45, AP: 220, CAMERA: 12, IP_PHONE: 0.2, PRINTER: 2, SERVER: 280, NVR: 40 },
};

function linkCapacityMbps(cable: CableType): number {
  switch (cable) {
    case "Fiber":
      return 10_000;
    case "Serial":
      return 100;
    case "Console":
      return 10;
    case "Crossover":
    case "Straight-through":
    default:
      return 1_000;
  }
}

/**
 * Computes aggregate per-link Mbps utilization across shortest active paths
 * from endpoints to servers (east-west) and gateway routers (north-south).
 */
export function forecastTraffic(
  topology: BuiltTopology,
  plan: NetworkPlan,
  profile: TrafficProfile = "office",
  multiplier = 1,
  faults?: FaultState,
): TrafficForecastResult {
  const safeMult = Math.max(0.25, Math.min(10, Number(multiplier) || 1));
  const disabledLinks = new Set(faults?.disabledLinks ?? []);
  const disabledDevices = new Set(faults?.disabledDevices ?? []);
  const loadByLink = new Map<string, number>();
  for (const c of topology.connections) loadByLink.set(c.id, 0);

  const primaryRouter = topology.devices.find(
    (d) => d.type === "ROUTER" && !disabledDevices.has(d.id),
  );
  const primaryServer = topology.devices.find(
    (d) => (d.type === "SERVER" || d.type === "NVR") && !disabledDevices.has(d.id),
  );

  let totalDemandMbps = 0;
  const profileRates = BASE_MBPS[profile] ?? BASE_MBPS.office;

  for (const device of topology.devices) {
    if (disabledDevices.has(device.id)) continue;
    const baseRate = profileRates[device.type] ?? 0;
    if (baseRate <= 0) continue;
    const demand = baseRate * safeMult;
    totalDemandMbps += demand;

    // Route east-west traffic to server/NVR (40%) and north-south to router (60%), or 100% to whichever exists.
    const targets: { id: string; weight: number }[] = [];
    if (device.type === "CAMERA" && primaryServer && primaryServer.id !== device.id) {
      targets.push({ id: primaryServer.id, weight: 0.85 });
      if (primaryRouter) targets.push({ id: primaryRouter.id, weight: 0.15 });
    } else {
      if (primaryServer && primaryServer.id !== device.id) {
        targets.push({ id: primaryServer.id, weight: primaryRouter ? 0.4 : 1 });
      }
      if (primaryRouter && primaryRouter.id !== device.id) {
        targets.push({ id: primaryRouter.id, weight: primaryServer && primaryServer.id !== device.id ? 0.6 : 1 });
      }
    }

    for (const target of targets) {
      const trace = tracePacket(topology, plan, {
        sourceId: device.id,
        destinationId: target.id,
        protocol: "TCP",
        port: 443,
        faults,
      });
      if (!trace.reachable) continue;
      for (const linkId of trace.traversedLinkIds) {
        loadByLink.set(linkId, (loadByLink.get(linkId) ?? 0) + demand * target.weight);
      }
    }
  }

  let peakUtilizationPercent = 0;
  let congestedLinks = 0;
  let elevatedLinks = 0;

  const links: LinkTrafficMetric[] = topology.connections.map((c) => {
    const cableType = (c.meta?.cableType as CableType) ?? "Straight-through";
    const capacityMbps = linkCapacityMbps(cableType);
    const loadMbps = disabledLinks.has(c.id) ? 0 : Number((loadByLink.get(c.id) ?? 0).toFixed(1));
    const utilizationPercent = capacityMbps > 0 ? Math.min(999, Math.round((loadMbps / capacityMbps) * 100)) : 0;
    if (utilizationPercent > peakUtilizationPercent) peakUtilizationPercent = utilizationPercent;

    let status: LinkTrafficMetric["status"] = "healthy";
    let recommendation: string | undefined;
    if (utilizationPercent >= 80) {
      status = "congested";
      congestedLinks++;
      recommendation =
        capacityMbps <= 1000
          ? "Upgrade uplink to 10G Fiber SFP+ or aggregate 2x1G via LACP EtherChannel."
          : "Add redundant 10G load-balanced uplink.";
    } else if (utilizationPercent >= 50) {
      status = "elevated";
      elevatedLinks++;
      recommendation = "Monitor peak bursts; plan LACP EtherChannel headroom.";
    }

    return {
      linkId: c.id,
      from: c.from,
      to: c.to,
      cableType,
      loadMbps,
      capacityMbps,
      utilizationPercent,
      status,
      recommendation,
    };
  });

  return {
    profile,
    multiplier: safeMult,
    totalDemandMbps: Number(totalDemandMbps.toFixed(1)),
    peakUtilizationPercent,
    congestedLinks,
    elevatedLinks,
    links,
  };
}
