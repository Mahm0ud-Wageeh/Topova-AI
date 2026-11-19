import type { NetworkPlan, ParsedIntent, Topology } from "@/lib/network-engine/types";
import { allocateSubnets, intToIp, ipToInt, maskFromPrefix } from "@/lib/network-engine/ip-planner";
import { planVlans } from "@/lib/network-engine/vlan-planner";
import { suggestRouting } from "@/lib/network-engine/routing";
import { securityNotes } from "@/lib/network-engine/security";

const VALID_PROTOCOLS = new Set(["OSPF", "EIGRP", "RIP", "BGP", "STATIC"]);

function subnetDetailsFromCidr(cidr: string): { mask: string; range: string } {
  const [ip, rawPrefix] = cidr.split("/");
  const prefix = parseInt(rawPrefix, 10);
  const network = ipToInt(ip);
  const size = 2 ** (32 - prefix);
  return {
    mask: maskFromPrefix(prefix),
    range: `${intToIp(network + 1)} - ${intToIp(network + size - 2)}`,
  };
}

export function planNetwork(
  topology: Topology,
  base = "192.168.0.0",
  options?: Partial<ParsedIntent["options"]>,
): NetworkPlan {
  const { devices } = topology;
  const useVlans =
    Boolean(options?.vlan) ||
    (devices.some((d) => d.type === "PC") && devices.some((d) => d.type === "SERVER"));

  const vlanBase = base === "192.168.0.0" ? "10.0.0.0" : base;
  const vlanPlan = useVlans ? planVlans(devices, vlanBase) : [];

  // IP plan: per-VLAN subnets, or a single subnet sized to total devices + gateway
  let ipPlan: NetworkPlan["ipPlan"];
  if (vlanPlan.length) {
    ipPlan = {
      base: `${vlanBase}/16`,
      subnets: vlanPlan.map((v) => {
        const { mask, range } = subnetDetailsFromCidr(v.subnet);
        return {
          name: `${v.name} (VLAN ${v.id})`,
          cidr: v.subnet,
          mask,
          range,
        };
      }),
    };
  } else {
    const subnets = allocateSubnets(base, [{ name: "LAN", hosts: Math.max(devices.length + 1, 2) }]);
    const flatPrefix = subnets[0]?.cidr.split("/")[1] ?? "24";
    ipPlan = {
      base: `${base}/${flatPrefix}`,
      subnets,
    };
  }

  const preferred = options?.routingProtocol?.toUpperCase();
  const routing = suggestRouting(
    devices,
    vlanPlan,
    preferred && VALID_PROTOCOLS.has(preferred) ? preferred : undefined,
  );
  const notes = securityNotes(devices);

  return { ipPlan, vlanPlan, routing, notes };
}
