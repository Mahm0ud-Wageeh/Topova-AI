import type { Device, VlanEntry } from "@/lib/network-engine/types";
import { intToIp, ipToInt, maskFromPrefix } from "@/lib/network-engine/ip-planner";

function cidrParts(cidr: string) {
  const [net, rawPrefix] = cidr.split("/");
  const prefix = parseInt(rawPrefix, 10);
  const mask = maskFromPrefix(prefix);
  const wildcard = intToIp((~ipToInt(mask)) >>> 0);
  return { net, mask, wildcard };
}

export function suggestRouting(
  devices: Device[],
  vlans: VlanEntry[],
  preferred?: string,
): { protocol: string; routes: string[] } {
  const routers = devices.filter((d) => d.type === "ROUTER").length;

  // Heuristic: 1 router -> static; many -> OSPF (scales best of the free options)
  const protocol = preferred ?? (routers <= 1 ? "STATIC" : "OSPF");

  const routes = vlans.map((v) => {
    const { net, mask, wildcard } = cidrParts(v.subnet);
    switch (protocol) {
      case "STATIC":
        return `ip route ${net} ${mask} <next-hop>`;
      case "OSPF":
        return `network ${net} ${wildcard} area 0`;
      case "EIGRP":
        return `network ${net} ${wildcard}`;
      case "BGP":
        return `network ${net} mask ${mask}`;
      case "RIP":
        return `network ${net}`;
      default:
        return `ip route ${net} ${mask} <next-hop>`;
    }
  });
  return { protocol, routes };
}
