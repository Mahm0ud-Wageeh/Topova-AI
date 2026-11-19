import type { Device, DeviceType, VlanEntry } from "@/lib/network-engine/types";
import { allocateSubnets, type SubnetRequirement } from "@/lib/network-engine/ip-planner";

// Single source of truth mapping every device role to its VLAN.
export const VLAN_DEFS: { id: number; name: string; types: DeviceType[] }[] = [
  { id: 10, name: "USERS", types: ["PC", "IP_PHONE"] },
  { id: 20, name: "SERVERS", types: ["SERVER", "NVR"] },
  { id: 30, name: "PRINTERS", types: ["PRINTER"] },
  { id: 40, name: "CAMERAS", types: ["CAMERA"] },
  { id: 60, name: "WIFI", types: ["AP"] },
  { id: 99, name: "MGMT", types: ["ROUTER", "SWITCH", "FIREWALL"] },
];

export const TYPE_VLAN: Record<DeviceType, number> = Object.fromEntries(
  VLAN_DEFS.flatMap((v) => v.types.map((t) => [t, v.id] as const)),
) as Record<DeviceType, number>;

export function planVlans(devices: Device[], base = "10.0.0.0"): VlanEntry[] {
  const reqs: SubnetRequirement[] = [];
  const active = VLAN_DEFS.filter((v) => devices.some((d) => v.types.includes(d.type)));

  for (const v of active) {
    const count = devices.filter((d) => v.types.includes(d.type)).length;
    // Reserve +1 usable IP for the router gateway so hosts never overflow onto broadcast.
    reqs.push({ name: `VLAN${v.id}-${v.name}`, hosts: Math.max(count + 1, 2) });
  }

  const subnets = allocateSubnets(base, reqs);
  const byName = new Map(subnets.map((s) => [s.name, s]));
  return active.map((v) => {
    const allocated = byName.get(`VLAN${v.id}-${v.name}`)!;
    return { id: v.id, name: v.name, subnet: allocated.cidr };
  });
}
