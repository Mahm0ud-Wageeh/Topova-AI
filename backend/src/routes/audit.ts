import {
  auditSecurityResilience,
  autoRemediateTopology,
} from "@/lib/network-engine";
import type {
  AclRule,
  BuiltTopology,
  FaultState,
  NetworkPlan,
} from "@/lib/network-engine/types";
import {
  aclsSchema,
  builtTopologySchema,
  networkPlanSchema,
} from "@/lib/validators/schemas";
import { Router } from "express";
import { z } from "zod";

const auditPayload = z.object({
  topology: builtTopologySchema,
  plan: networkPlanSchema,
  acls: aclsSchema.optional(),
  faults: z
    .object({
      disabledDevices: z.array(z.string()).default([]),
      disabledLinks: z.array(z.string()).default([]),
    })
    .optional(),
});

export function auditRouter() {
  const router = Router();

  router.post("/security", (req, res, next) => {
    try {
      const data = auditPayload.parse(req.body);
      res.json(
        auditSecurityResilience(
          data.topology as BuiltTopology,
          data.plan as NetworkPlan,
          (data.acls ?? []) as AclRule[],
          data.faults as FaultState | undefined,
        ),
      );
    } catch (err) {
      next(err);
    }
  });

  router.post("/auto-remediate", (req, res, next) => {
    try {
      const data = auditPayload.parse(req.body);
      res.json(
        autoRemediateTopology(
          data.topology as BuiltTopology,
          data.plan as NetworkPlan,
          (data.acls ?? []) as AclRule[],
        ),
      );
    } catch (err) {
      next(err);
    }
  });

  return router;
}
