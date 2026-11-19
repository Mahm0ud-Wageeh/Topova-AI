import { z } from "zod";
import { parseAddress, parseCidr } from "./ipv4";
import { topologyV1Schema, type BranchAlternative, type BranchPlan } from "./schema";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const vlan = z.number().int().min(1).max(4094);
const cidr = z.string().max(18).refine((value) => parseCidr(value) !== null, "Expected an aligned IPv4 network.");
const subnet = z.object({
  segmentId: id, label: z.string().trim().min(1).max(48), vlanId: vlan, cidr,
  gateway: z.string().max(15).refine((value) => parseAddress(value) !== null, "Expected an IPv4 address."),
}).strict();
const tagging = z.object({ linkId: id, vlanIds: z.array(vlan).max(32) }).strict();
const access = z.object({ segmentId: id, interfaceId: id }).strict();

export const snapshotSchema = z.object({
  format: z.literal("nettopo-branch-snapshot"),
  schemaVersion: z.literal(1),
  parentCidr: cidr,
  topology: topologyV1Schema,
  subnets: z.array(subnet).min(1).max(32),
  access: z.array(access).max(96),
  tagging: z.array(tagging).max(2),
  reservedVlans: z.array(vlan).max(4094).optional(),
}).strict().superRefine((snapshot, ctx) => {
  const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
  const parent = parseCidr(snapshot.parentCidr);
  if (!parent) return;
  const ids = new Set<string>();
  const vlans = new Set<number>();
  const blocks: { start: number; end: number }[] = [];
  snapshot.subnets.forEach((segment, index) => {
    const block = parseCidr(segment.cidr);
    if (ids.has(segment.segmentId) || vlans.has(segment.vlanId)) issue(["subnets", index], "Segment and VLAN IDs must be unique.");
    ids.add(segment.segmentId);
    vlans.add(segment.vlanId);
    if (!block) return;
    if (block.prefix > 30 || block.start < parent.start || block.end > parent.end ||
        blocks.some((other) => block.start <= other.end && other.start <= block.end)) {
      issue(["subnets", index, "cidr"], "Subnet must be within the parent, usable as a LAN, and non-overlapping.");
    }
    blocks.push(block);
    const gw = parseAddress(segment.gateway);
    if (gw === null || gw <= block.start || gw >= block.end) issue(["subnets", index, "gateway"], "Gateway must be a usable address inside the subnet.");
  });
  const accessInterfaces = new Set(snapshot.topology.devices.filter((device) => device.kind === "switch").flatMap(
    (device) => device.interfaces.map((iface) => iface.id),
  ));
  const linkIds = new Set(snapshot.topology.links.map((link) => link.id));
  for (const link of snapshot.topology.links) {
    accessInterfaces.delete(link.fromInterfaceId);
    accessInterfaces.delete(link.toInterfaceId);
  }
  snapshot.access.forEach((entry, index) => {
    if (!ids.has(entry.segmentId) || !accessInterfaces.delete(entry.interfaceId)) {
      issue(["access", index], "Access assignment needs a known segment and an unused switch port.");
    }
  });
  if (snapshot.topology.devices.filter((device) => device.kind === "router").length !== 1) {
    issue(["topology", "devices"], "This format supports exactly one router.");
  }
  snapshot.tagging.forEach((entry, index) => {
    if (!linkIds.delete(entry.linkId) || new Set(entry.vlanIds).size !== entry.vlanIds.length) {
      issue(["tagging", index], "Each known trunk needs one list of distinct VLAN IDs.");
    }
  });
});

export type BranchSnapshot = z.infer<typeof snapshotSchema>;

export function createSnapshot(plan: BranchPlan, alternative: Extract<BranchAlternative, { feasible: true }>): BranchSnapshot {
  const segments = new Map(plan.input.segments.map((segment) => [segment.id, segment]));
  return {
    format: "nettopo-branch-snapshot", schemaVersion: 1, parentCidr: plan.input.parentCidr,
    topology: alternative.topology, access: alternative.access,
    subnets: plan.addresses.map(({ segmentId, cidr, gateway }) => {
      const segment = segments.get(segmentId)!;
      return { segmentId, label: segment.label, vlanId: segment.vlanId, cidr, gateway };
    }),
    tagging: alternative.topology.links.map((link) => ({
      linkId: link.id, vlanIds: plan.input.segments.map((segment) => segment.vlanId).sort((a, b) => a - b),
    })),
  };
}

export const changeRequestSchema = z.object({
  snapshot: snapshotSchema,
  segment: z.object({
    id, label: z.string().trim().min(1).max(48), vlanId: vlan,
    endpointAddresses: z.number().int().min(1).max(65533),
    accessPorts: z.number().int().min(1).max(48),
    switchId: id,
  }).strict().refine((segment) => segment.accessPorts <= segment.endpointAddresses, "Access ports must not exceed endpoint addresses."),
}).strict();

export type BranchChange = z.infer<typeof changeRequestSchema>;
