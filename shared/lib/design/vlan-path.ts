import type { BranchSnapshot } from "./snapshot";

type Link = BranchSnapshot["topology"]["links"][number];

export function pathsToRouter({ devices, links }: BranchSnapshot["topology"]) {
  const router = devices.find((device) => device.kind === "router")!;
  const owners = new Map(devices.flatMap((device) => device.interfaces.map((iface) => [iface.id, device.id] as const)));
  const paths = new Map<string, Link[]>([[router.id, []]]);
  const queue = [router.id];
  for (const deviceId of queue) {
    for (const link of links) {
      const from = owners.get(link.fromInterfaceId);
      const to = owners.get(link.toInterfaceId);
      const next = from === deviceId ? to : to === deviceId ? from : undefined;
      if (!next || paths.has(next)) continue;
      paths.set(next, [link, ...paths.get(deviceId)!]);
      queue.push(next);
    }
  }
  return paths;
}

type TagState = "allowed" | "blocked" | "unknown";

export function compareVlanPaths(baseline: BranchSnapshot, candidate: BranchSnapshot, addedSegmentId: string) {
  const paths = pathsToRouter(baseline.topology);
  const segments = new Map(candidate.subnets.map((subnet) => [subnet.segmentId, subnet]));
  const beforeTags = new Map(baseline.tagging.map((entry) => [entry.linkId, entry.vlanIds]));
  const afterTags = new Map(candidate.tagging.map((entry) => [entry.linkId, entry.vlanIds]));
  const accessByPort = new Map(candidate.access.map((entry) => [entry.interfaceId, entry.segmentId]));
  function state(path: Link[] | undefined, vlanId: number, tags: typeof beforeTags): TagState {
    if (!path || path.length === 0) return "unknown";
    if (path.some((link) => tags.has(link.id) && !tags.get(link.id)!.includes(vlanId))) return "blocked";
    if (path.some((link) => !tags.has(link.id))) return "unknown";
    return "allowed";
  }
  return candidate.topology.devices.filter((device) => device.kind === "switch").flatMap((device) => {
    const segmentIds = new Set(device.interfaces.map((iface) => accessByPort.get(iface.id)));
    segmentIds.delete(undefined);
    const path = paths.get(device.id);
    return [...segmentIds].map((segmentId) => {
      const { vlanId } = segments.get(segmentId!)!;
      return {
        switchId: device.id, vlanId,
        before: segmentId === addedSegmentId ? "not-present" as const : state(path, vlanId, beforeTags),
        after: state(path, vlanId, afterTags),
        links: path?.map(({ id }) => id) ?? [],
      };
    });
  });
}
