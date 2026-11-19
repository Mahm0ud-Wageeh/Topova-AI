import type { AclRule, NetworkPlan } from "@/lib/network-engine/types";
import {
  aclsSchema,
  builtTopologySchema,
  networkPlanSchema,
} from "@/lib/validators/schemas";
import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/error-handler";
import type { DataStore } from "../storage/types";

const createProjectPayload = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  source: z.enum(["PROMPT", "MANUAL"]).default("PROMPT"),
  prompt: z.string().max(4000).optional(),
  note: z.string().max(200).optional(),
  topology: builtTopologySchema,
  plan: networkPlanSchema,
  acls: aclsSchema.optional(),
});

const patchProjectPayload = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  note: z.string().max(200).optional(),
  topology: builtTopologySchema.optional(),
  plan: networkPlanSchema.optional(),
  acls: aclsSchema.optional(),
});

export function projectsRouter(store: DataStore) {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const projects = await store.listProjects(req.principal!.ownerId);
      res.json({ projects });
    } catch (err) {
      next(err);
    }
  });

  const handleSave = async (
    req: Parameters<Parameters<typeof router.post>[1]>[0],
    res: Parameters<Parameters<typeof router.post>[1]>[1],
    next: Parameters<Parameters<typeof router.post>[1]>[2],
  ) => {
    try {
      const body = createProjectPayload.parse(req.body);
      const project = await store.createProject(req.principal!.ownerId, {
        name: body.name,
        description: body.description,
        source: body.source,
        prompt: body.prompt,
        note: body.note,
        devices: body.topology.devices,
        connections: body.topology.connections,
        layout: body.topology.layout,
        network_plan: body.plan as NetworkPlan,
        acls: (body.acls ?? []) as AclRule[],
      });
      res.status(201).json({ project });
    } catch (err) {
      next(err);
    }
  };

  router.post("/", handleSave);
  router.post("/save", handleSave);

  router.get("/:id", async (req, res, next) => {
    try {
      const project = await store.getProject(
        req.principal!.ownerId,
        req.params.id,
      );
      if (!project) throw new HttpError(404, "NOT_FOUND", "Project not found.");
      res.json({ project });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const body = patchProjectPayload.parse(req.body);
      const updated = await store.updateProject(
        req.principal!.ownerId,
        req.params.id,
        {
          name: body.name,
          description: body.description,
          devices: body.topology?.devices,
          connections: body.topology?.connections,
          layout: body.topology?.layout,
          network_plan: body.plan as NetworkPlan | undefined,
          acls: body.acls as AclRule[] | undefined,
        },
        body.note,
      );
      if (!updated) throw new HttpError(404, "NOT_FOUND", "Project not found.");
      res.json({ project: updated });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/revisions", async (req, res, next) => {
    try {
      const body = patchProjectPayload.parse(req.body);
      const updated = await store.updateProject(
        req.principal!.ownerId,
        req.params.id,
        {
          devices: body.topology?.devices,
          connections: body.topology?.connections,
          layout: body.topology?.layout,
          network_plan: body.plan as NetworkPlan | undefined,
          acls: body.acls as AclRule[] | undefined,
        },
        body.note || "Manual snapshot",
      );
      if (!updated) throw new HttpError(404, "NOT_FOUND", "Project not found.");
      res.status(201).json({ project: updated });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const deleted = await store.deleteProject(
        req.principal!.ownerId,
        req.params.id,
      );
      if (!deleted) throw new HttpError(404, "NOT_FOUND", "Project not found.");
      res.json({ deleted: 1 });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
