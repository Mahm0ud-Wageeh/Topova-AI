import { z } from "zod";
import { parseCidr } from "./ipv4";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const vlan = z.number().int().min(1).max(4094);
const cidr = z.string().max(18).refine((value) => parseCidr(value) !== null, {
  message: "Enter an aligned IPv4 network in CIDR notation, such as 10.50.0.0/24.",
});
const branchSegmentSchema = z.object({
  id,
  label: z.string().trim().min(1).max(48),
  vlanId: vlan,
  endpointAddresses: z.number().int().min(1).max(65533),
  accessPorts: z.number().int().min(0).max(96),
  minimumPrefix: z.number().int().min(16).max(30).optional(),
}).strict().refine((segment) => segment.accessPorts <= segment.endpointAddresses, {
  path: ["accessPorts"], message: "Access ports cannot exceed endpoint addresses.",
});

export const branchRequestSchema = z.object({
  schemaVersion: z.literal(1),
  parentCidr: cidr,
  portsPerSwitch: z.union([z.literal(24), z.literal(48)]),
  portReservePercent: z.number().int().min(0).max(100).optional(),
  segments: z.array(branchSegmentSchema).min(1).max(12),
}).strict().superRefine(({ segments }, ctx) => {
  const ids = new Set<string>();
  const vlans = new Set<number>();
  segments.forEach((segment, index) => {
    if (ids.has(segment.id)) ctx.addIssue({ code: "custom", path: ["segments", index, "id"], message: "Segment IDs must be unique." });
    if (vlans.has(segment.vlanId)) ctx.addIssue({ code: "custom", path: ["segments", index, "vlanId"], message: "VLAN IDs must be unique." });
    ids.add(segment.id);
    vlans.add(segment.vlanId);
  });
});

export type BranchRequest = z.infer<typeof branchRequestSchema>;

export const addressPlan = z.object({
  segmentId: id,
  cidr,
  gateway: z.string(),
  firstEndpoint: z.string(),
  lastEndpoint: z.string(),
  spareAddresses: z.number().int().nonnegative(),
}).strict();

export const topologyV1Schema = z.object({
  schemaVersion: z.literal(1),
  devices: z.array(z.object({
    id, kind: z.enum(["router", "switch"]),
    interfaces: z.array(z.object({ id, label: z.string().min(1).max(32) }).strict()).min(1).max(48),
  }).strict()).min(1).max(3),
  links: z.array(z.object({ id, fromInterfaceId: id, toInterfaceId: id }).strict()).max(2),
}).strict().superRefine(({ devices, links }, ctx) => {
  const deviceIds = new Set<string>();
  const owners = new Map<string, string>();
  const linkIds = new Set<string>();
  const connected = new Set<string>();
  devices.forEach((device, index) => {
    if (deviceIds.has(device.id)) ctx.addIssue({ code: "custom", path: ["devices", index, "id"], message: "Duplicate device ID." });
    deviceIds.add(device.id);
    device.interfaces.forEach((iface, port) => {
      if (owners.has(iface.id)) ctx.addIssue({ code: "custom", path: ["devices", index, "interfaces", port, "id"], message: "Duplicate interface ID." });
      owners.set(iface.id, device.id);
    });
  });
  links.forEach((link, index) => {
    if (linkIds.has(link.id)) ctx.addIssue({ code: "custom", path: ["links", index, "id"], message: "Duplicate link ID." });
    linkIds.add(link.id);
    for (const key of ["fromInterfaceId", "toInterfaceId"] as const) {
      const endpoint = link[key];
      if (!owners.has(endpoint) || connected.has(endpoint)) {
        ctx.addIssue({ code: "custom", path: ["links", index, key], message: "Link endpoint must reference an unused interface." });
      }
      connected.add(endpoint);
    }
    if (owners.get(link.fromInterfaceId) && owners.get(link.fromInterfaceId) === owners.get(link.toInterfaceId)) {
      ctx.addIssue({ code: "custom", path: ["links", index], message: "A link needs two different devices." });
    }
  });
});

export type TopologyV1 = z.infer<typeof topologyV1Schema>;
export type AddressAllocation = z.infer<typeof addressPlan>;

export type BranchAlternative = {
  id: "single-switch" | "two-switches";
  switchCount: 1 | 2;
  accessPortsUsed: number;
  switchPortsForUplinks: number;
  freeSwitchPorts: number;
} & (
  | { feasible: false; portShortfall: number }
  | { feasible: true; topology: TopologyV1; access: { segmentId: string; interfaceId: string }[] }
);

export type BranchPlan = {
  schemaVersion: 1;
  input: BranchRequest;
  addresses: AddressAllocation[];
  unallocatedAddresses: number;
  alternatives: BranchAlternative[];
  recommendation?: {
    alternativeId: BranchAlternative["id"] | null;
    reservePorts: number;
    reason: "capacity-and-reserve" | "limited-reserve" | "insufficient-capacity";
  };
};
