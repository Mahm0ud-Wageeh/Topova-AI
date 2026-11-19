import { blockSize, formatAddress, parseCidr } from "./ipv4";
import {
  topologyV1Schema,
  type BranchAlternative,
  type BranchPlan,
  type BranchRequest,
  type TopologyV1,
} from "./schema";

export class PoolCapacityError extends Error {
  constructor(readonly requiredAddresses: number, readonly availableAddresses: number) {
    super(`The segments require ${requiredAddresses} addresses (including network, broadcast and gateway); the parent provides ${availableAddresses}.`);
  }
}

function alternative(input: BranchRequest, switchCount: 1 | 2): BranchAlternative {
  const ports = input.portsPerSwitch;
  const switchPortsForUplinks = switchCount === 1 ? 1 : 3;
  const accessPortsUsed = input.segments.reduce((total, segment) => total + segment.accessPorts, 0);
  const free = switchCount * ports - switchPortsForUplinks - accessPortsUsed;
  const summary = {
    id: switchCount === 1 ? "single-switch" as const : "two-switches" as const,
    switchCount, accessPortsUsed, switchPortsForUplinks, freeSwitchPorts: Math.max(0, free),
  };
  if (free < 0) return { ...summary, feasible: false, portShortfall: -free };

  const devices: TopologyV1["devices"] = [
    { id: "r1", kind: "router", interfaces: [{ id: "r1-uplink", label: "Uplink 1" }] },
    ...Array.from({ length: switchCount }, (_, index) => ({
      id: `sw${index + 1}`,
      kind: "switch" as const,
      interfaces: Array.from({ length: ports }, (_, port) => ({
        id: `sw${index + 1}-p${port + 1}`, label: `Port ${port + 1}`,
      })),
    })),
  ];
  const links = [{ id: "router-trunk", fromInterfaceId: "r1-uplink", toInterfaceId: `sw1-p${ports}` }];
  if (switchCount === 2) links.push({
    id: "switch-trunk", fromInterfaceId: `sw1-p${ports - 1}`, toInterfaceId: `sw2-p${ports}`,
  });
  const uplinks = new Set(links.flatMap((link) => [link.fromInterfaceId, link.toInterfaceId]));
  const accessPorts = devices.slice(1).flatMap((device) => device.interfaces)
    .filter((iface) => !uplinks.has(iface.id));
  let offset = 0;
  const access = [...input.segments].sort((a, b) => a.vlanId - b.vlanId).flatMap((segment) => {
    const assigned = accessPorts.slice(offset, offset + segment.accessPorts);
    offset += segment.accessPorts;
    return assigned.map((iface) => ({ segmentId: segment.id, interfaceId: iface.id }));
  });
  return { ...summary, feasible: true, topology: topologyV1Schema.parse({ schemaVersion: 1, devices, links }), access };
}

export function planBranch(input: BranchRequest): BranchPlan {
  const pool = parseCidr(input.parentCidr);
  if (!pool) throw new TypeError("The parent CIDR must be validated.");
  const requests = input.segments.map((segment) => ({
    segment,
    // Reserve a network address, a broadcast address, and one gateway per LAN.
    size: blockSize(segment.endpointAddresses, segment.minimumPrefix),
  })).sort((a, b) => b.size - a.size || a.segment.vlanId - b.segment.vlanId);
  const requiredAddresses = requests.reduce((total, request) => total + request.size, 0);
  if (requiredAddresses > pool.size) throw new PoolCapacityError(requiredAddresses, pool.size);

  let start = pool.start;
  const addresses = requests.map(({ segment, size }) => {
    const allocation = {
      segmentId: segment.id,
      cidr: `${formatAddress(start)}/${32 - Math.log2(size)}`,
      gateway: formatAddress(start + 1),
      firstEndpoint: formatAddress(start + 2),
      lastEndpoint: formatAddress(start + size - 2),
      spareAddresses: size - 3 - segment.endpointAddresses,
    };
    start += size;
    return allocation;
  });
  const alternatives = [alternative(input, 1), alternative(input, 2)];
  const requestedPorts = input.segments.reduce((total, segment) => total + segment.accessPorts, 0);
  const reservePorts = Math.ceil(requestedPorts * (input.portReservePercent ?? 20) / 100);
  const withReserve = alternatives.find((option) => option.feasible && option.freeSwitchPorts >= reservePorts);
  const firstFeasible = alternatives.find((option) => option.feasible);
  return {
    schemaVersion: 1,
    input,
    addresses,
    unallocatedAddresses: pool.size - requiredAddresses,
    alternatives,
    recommendation: {
      alternativeId: withReserve?.id ?? firstFeasible?.id ?? null,
      reservePorts,
      reason: withReserve ? "capacity-and-reserve" : firstFeasible ? "limited-reserve" : "insufficient-capacity",
    },
  };
}
