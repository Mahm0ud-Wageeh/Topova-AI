import { z } from "zod";
import { parseAddress, parseCidr } from "../design/ipv4";

export const deviceTypeSchema = z.enum([
  "ROUTER",
  "SWITCH",
  "SERVER",
  "PC",
  "FIREWALL",
  "AP",
  "PRINTER",
  "CAMERA",
  "NVR",
  "IP_PHONE",
]);

export const deviceSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(64),
  type: deviceTypeSchema,
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const connectionSchema = z.object({
  id: z.string().min(1).max(64),
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64),
  meta: z.record(z.string(), z.unknown()).optional(),
});

const topologyFields = z.object({
  devices: z.array(deviceSchema).max(500, "Too many devices"),
  connections: z.array(connectionSchema).max(2000),
});

function validateGraph(
  value: z.infer<typeof topologyFields>,
  ctx: z.RefinementCtx,
) {
  const ids = new Set<string>();
  value.devices.forEach((device, index) => {
    if (ids.has(device.id))
      ctx.addIssue({
        code: "custom",
        path: ["devices", index, "id"],
        message: "Device IDs must be unique.",
      });
    ids.add(device.id);
  });
  const links = new Set<string>();
  const pairs = new Set<string>();
  value.connections.forEach((link, index) => {
    const pair = [link.from, link.to].sort().join("\0");
    if (links.has(link.id) || pairs.has(pair))
      ctx.addIssue({
        code: "custom",
        path: ["connections", index],
        message: "Duplicate link.",
      });
    if (!ids.has(link.from) || !ids.has(link.to) || link.from === link.to)
      ctx.addIssue({
        code: "custom",
        path: ["connections", index],
        message: "Links must join two existing, distinct devices.",
      });
    links.add(link.id);
    pairs.add(pair);
  });
}
export const topologySchema = topologyFields.superRefine(validateGraph);
export const builtTopologySchema = topologyFields
  .extend({
    layout: z
      .record(
        z.string(),
        z.object({ x: z.number().finite(), y: z.number().finite() }),
      )
      .optional(),
  })
  .superRefine(validateGraph);

export const cidrSchema = z
  .string()
  .max(32)
  .refine(
    (value) => parseCidr(value) !== null,
    "Use an aligned IPv4 CIDR, such as 10.0.0.0/24.",
  );
export const aclSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  action: z.enum(["permit", "deny"]),
  protocol: z.enum(["ip", "tcp", "udp", "icmp"]),
  sourceVlan: z.union([z.number().int().min(1).max(4094), z.literal("any")]),
  destinationVlan: z.union([
    z.number().int().min(1).max(4094),
    z.literal("any"),
  ]),
  port: z.number().int().min(1).max(65535).optional(),
  description: z.string().max(1000),
});
export const aclsSchema = z.array(aclSchema).max(2000);
export const networkPlanSchema = z
  .object({
    ipPlan: z.object({
      base: cidrSchema,
      subnets: z
        .array(
          z.object({
            name: z.string().max(120),
            cidr: cidrSchema,
            mask: z
              .string()
              .refine(
                (value) => parseAddress(value) !== null,
                "Invalid IPv4 mask.",
              ),
            range: z.string().max(100),
          }),
        )
        .max(500),
    }),
    vlanPlan: z
      .array(
        z.object({
          id: z.number().int().min(1).max(4094),
          name: z.string().max(120),
          subnet: cidrSchema,
        }),
      )
      .max(500),
    routing: z.object({
      protocol: z.enum(["OSPF", "EIGRP", "RIP", "BGP", "STATIC"]),
      routes: z.array(z.string().max(1000)).max(2000),
    }),
    notes: z.array(z.string().max(2000)).max(500).optional(),
  })
  .superRefine((plan, ctx) => {
    const ids = plan.vlanPlan.map((vlan) => vlan.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        path: ["vlanPlan"],
        message: "VLAN IDs must be unique.",
      });
    const blocks = plan.ipPlan.subnets.map((subnet) => parseCidr(subnet.cidr));
    const parent = parseCidr(plan.ipPlan.base);
    blocks.forEach((block, index) => {
      if (!block) return;
      if (parent && (block.start < parent.start || block.end > parent.end))
        ctx.addIssue({
          code: "custom",
          path: ["ipPlan", "subnets", index],
          message: "Subnet is outside the parent address pool.",
        });
      if (
        blocks.some(
          (other, j) =>
            j < index &&
            other &&
            block.start <= other.end &&
            other.start <= block.end,
        )
      )
        ctx.addIssue({
          code: "custom",
          path: ["ipPlan", "subnets", index],
          message: "Subnets overlap.",
        });
    });
  });
export const workspaceStateSchema = z.object({
  projectName: z.string().trim().min(1).max(120),
  topology: builtTopologySchema,
  plan: networkPlanSchema,
  acls: aclsSchema.default([]),
});

export const parseInputSchema = z.object({
  text: z.string().min(2, "Describe your network").max(4000),
  lang: z.enum(["ar", "en", "auto"]).default("auto"),
});

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  source: z.enum(["PROMPT", "MANUAL"]).default("MANUAL"),
  prompt: z.string().max(4000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  source: z.enum(["PROMPT", "MANUAL"]).optional(),
  prompt: z.string().max(4000).optional(),
});

export const exportSchema = z.object({
  projectId: z.string(),
  format: z.enum(["png", "pdf", "json"]),
});
