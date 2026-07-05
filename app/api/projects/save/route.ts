import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth";
import { route } from "@/lib/api/handler";
import { z } from "zod";

const saveProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  source: z.enum(["PROMPT", "MANUAL"]).default("PROMPT"),
  topology: z.object({
    devices: z.array(z.object({
      id: z.string(),
      label: z.string(),
      type: z.string(),
      meta: z.record(z.unknown()).optional(),
    })),
    connections: z.array(z.object({
      id: z.string(),
      from: z.string(),
      to: z.string(),
      meta: z.record(z.unknown()).optional(),
    })),
    layout: z.record(z.object({ x: z.number(), y: z.number() })).optional(),
  }),
  plan: z.object({
    ipPlan: z.record(z.unknown()),
    vlanPlan: z.array(z.record(z.unknown())),
    routing: z.record(z.unknown()),
    notes: z.array(z.string()).optional(),
  }),
});

// POST /api/projects/save -> create a project with full topology + plan
export function POST(req: NextRequest) {
  return route(async () => {
    const user = await requireUser();
    const body = saveProjectSchema.parse(await req.json());

    const project = await prisma.project.create({
      data: {
        name: body.name,
        description: body.description,
        source: body.source,
        ownerId: user.id,
        topology: {
          create: {
            layout: body.topology.layout ?? undefined,
            devices: {
              create: body.topology.devices.map((d) => ({
                label: d.label,
                type: d.type as any,
                meta: d.meta ? JSON.parse(JSON.stringify(d.meta)) : undefined,
              })),
            },
            connections: {
              create: body.topology.connections.map((c) => {
                const fromDevice = body.topology.devices.find((d) => d.id === c.from);
                const toDevice = body.topology.devices.find((d) => d.id === c.to);
                return {
                  fromId: fromDevice?.id ?? c.from,
                  toId: toDevice?.id ?? c.to,
                  meta: c.meta ? JSON.parse(JSON.stringify(c.meta)) : undefined,
                };
              }),
            },
          },
        },
        plan: {
          create: {
            ipPlan: JSON.parse(JSON.stringify(body.plan.ipPlan)),
            vlanPlan: JSON.parse(JSON.stringify(body.plan.vlanPlan)),
            routing: JSON.parse(JSON.stringify(body.plan.routing)),
            notes: body.plan.notes ?? [],
          },
        },
      },
      include: {
        topology: { include: { devices: true, connections: true } },
        plan: true,
      },
    });

    return { project };
  });
}
