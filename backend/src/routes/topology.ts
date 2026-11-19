import {
  applyCopilotInstruction,
  buildTopology,
  generateZeroTrustAcls,
  planNetwork,
} from "@/lib/network-engine";
import type {
  AclRule,
  BuiltTopology,
  NetworkPlan,
} from "@/lib/network-engine/types";
import {
  aclsSchema,
  builtTopologySchema,
  networkPlanSchema,
  parseInputSchema,
  topologySchema,
} from "@/lib/validators/schemas";
import { parsePrompt } from "@server/ai";
import { Router } from "express";
import { z } from "zod";

const copilotSchema = z.object({
  instruction: z.string().trim().min(2).max(2000),
  topology: builtTopologySchema,
  plan: networkPlanSchema,
  acls: aclsSchema.optional(),
});

export function topologyRouter() {
  const router = Router();

  router.post("/generate", async (req, res, next) => {
    try {
      const body = req.body;
      let topology: BuiltTopology;
      let planOptions;
      if (body && typeof body === "object" && "text" in body) {
        const { text, lang } = parseInputSchema.parse(body);
        const intent = await parsePrompt(text, lang);
        topology = buildTopology(intent);
        planOptions = intent.options;
      } else {
        const parsed = topologySchema.parse(body);
        topology = buildTopology(parsed);
      }

      const network_plan = planNetwork(topology, undefined, planOptions);
      const acls = generateZeroTrustAcls(network_plan);
      res.json({
        devices: topology.devices,
        connections: topology.connections,
        layout: topology.layout,
        network_plan,
        acls,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/copilot", (req, res, next) => {
    try {
      const parsed = copilotSchema.parse(req.body);
      const proposal = applyCopilotInstruction(
        {
          topology: parsed.topology as BuiltTopology,
          plan: parsed.plan as NetworkPlan,
          acls: (parsed.acls ?? []) as AclRule[],
        },
        parsed.instruction,
      );
      res.json(proposal);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
