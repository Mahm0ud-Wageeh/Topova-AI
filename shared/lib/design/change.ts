import { createHash } from "node:crypto";
import { blockSize, formatAddress, parseCidr } from "./ipv4";
import type { BranchChange } from "./snapshot";
import { compareVlanPaths, pathsToRouter } from "./vlan-path";

export class BranchChangeError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export function reviewBranchChange({ snapshot, segment }: BranchChange) {
  const { topology } = snapshot;
  const baselineDigest = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  if (snapshot.subnets.length >= 32) throw new BranchChangeError("SEGMENT_LIMIT", "The snapshot format supports at most 32 segments.");
  if (segment.vlanId === 1 || (segment.vlanId >= 1002 && segment.vlanId <= 1005)) {
    throw new BranchChangeError("RESERVED_VLAN", "Choose a VLAN ID outside the reserved ranges (1 and 1002-1005).");
  }
  if (snapshot.subnets.some((item) => item.vlanId === segment.vlanId || item.segmentId === segment.id) ||
      snapshot.tagging.some((tag) => tag.vlanIds.includes(segment.vlanId)) ||
      snapshot.reservedVlans?.includes(segment.vlanId)) {
    throw new BranchChangeError("DUPLICATE_SEGMENT", "The segment ID or VLAN is already in use.");
  }
  const target = topology.devices.find((device) => device.id === segment.switchId && device.kind === "switch");
  if (!target) throw new BranchChangeError("UNKNOWN_SWITCH", "Select a switch from the baseline.");
  const route = pathsToRouter(topology).get(target.id);
  const tagging = new Map(snapshot.tagging.map((entry) => [entry.linkId, entry.vlanIds]));
  if (!route || route.some((link) => !tagging.has(link.id))) {
    return { status: "insufficient-evidence" as const, baselineDigest,
      findings: [{ rule: "VLAN-01", status: "unknown" as const, message: "The selected switch needs a known trunk path and VLAN lists to the router." }] };
  }
  if (route.some((link) => tagging.get(link.id)!.length >= 32)) {
    throw new BranchChangeError("SEGMENT_LIMIT", "A trunk has reached the VLAN limit of the snapshot format.");
  }
  const occupied = new Set([
    ...snapshot.access.map(({ interfaceId }) => interfaceId),
    ...topology.links.flatMap((link) => [link.fromInterfaceId, link.toInterfaceId]),
  ]);
  const free = target.interfaces.map((iface) => iface.id).filter((iface) => !occupied.has(iface));
  if (free.length < segment.accessPorts) {
    throw new BranchChangeError("PORT_CAPACITY", `The selected switch has ${free.length} free ports, but the segment needs ${segment.accessPorts}.`);
  }
  const pool = parseCidr(snapshot.parentCidr)!;
  const size = blockSize(segment.endpointAddresses);
  const align = (start: number) => Math.ceil(start / size) * size;
  let start = align(pool.start);
  for (const block of snapshot.subnets.map((subnet) => parseCidr(subnet.cidr)!).sort((a, b) => a.start - b.start)) {
    if (start + size - 1 < block.start) break;
    if (start <= block.end) start = align(block.end + 1);
  }
  if (start + size - 1 > pool.end) throw new BranchChangeError("NO_FREE_SUBNET", "No aligned block fits without moving an existing subnet.");

  const addedSubnet = {
    segmentId: segment.id, label: segment.label, vlanId: segment.vlanId,
    cidr: `${formatAddress(start)}/${32 - Math.log2(size)}`, gateway: formatAddress(start + 1),
  };
  const addedAccess = free.slice(0, segment.accessPorts).map((interfaceId) => ({ segmentId: segment.id, interfaceId }));
  const updatedTrunks = route.map((link) => {
    const before = tagging.get(link.id)!;
    return { linkId: link.id, before, after: [...before, segment.vlanId].sort((a, b) => a - b) };
  });
  const updated = new Map(updatedTrunks.map((entry) => [entry.linkId, entry.after]));
  const candidate = {
    ...snapshot, subnets: [...snapshot.subnets, addedSubnet], access: [...snapshot.access, ...addedAccess],
    tagging: snapshot.tagging.map((entry) => ({ ...entry, vlanIds: updated.get(entry.linkId) ?? entry.vlanIds })),
  };
  return {
    status: "candidate" as const, baselineDigest, candidate,
    vlanPaths: compareVlanPaths(snapshot, candidate, segment.id),
    diff: { addedSubnet, addedAccess, updatedTrunks, existingSubnetsChanged: 0, existingAccessChanged: 0,
      remainingPortsOnSwitch: free.length - addedAccess.length },
    rollback: {
      removeAccess: addedAccess, restoreTrunks: updatedTrunks.map(({ linkId, before }) => ({ linkId, vlanIds: before })),
      removeSubnet: addedSubnet,
    },
    findings: [
      { rule: "CHG-01", status: "pass" as const, message: "Existing subnet and access assignments are unchanged in the candidate." },
      { rule: "POL-01", status: "unknown" as const, message: "Traffic and policy behavior have not been verified." },
    ],
  };
}

export type BranchChangeReport = ReturnType<typeof reviewBranchChange>;
