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
import { getAgentStatus, runNetworkAgentChat } from "@server/ai/agent";
import { Router } from "express";
import { z } from "zod";
import type { DataStore } from "../storage/types";

const agentChatSchema = z.object({
  message: z.string().trim().min(1, "Message is required.").max(4000),
  mode: z.enum(["auto", "architect", "security", "executive"]).optional(),
  lang: z.enum(["ar", "en", "auto"]).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        mimeType: z.string().max(80).optional(),
        content: z.string().max(64_000),
      }),
    )
    .max(3)
    .optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(20)
    .optional(),
  state: z
    .object({
      topology: builtTopologySchema,
      plan: networkPlanSchema,
      acls: aclsSchema.optional(),
      faults: z
        .object({
          disabledDevices: z.array(z.string()),
          disabledLinks: z.array(z.string()),
        })
        .optional(),
    })
    .optional(),
});

export function agentRouter(store?: DataStore) {
  const router = Router();

  router.get("/status", (_req, res) => {
    res.json(getAgentStatus());
  });

  router.post("/chat", async (req, res, next) => {
    try {
      const parsed = agentChatSchema.parse(req.body);
      const controller = new AbortController();
      req.once("aborted", () => controller.abort());
      res.once("close", () => {
        if (!res.writableEnded) controller.abort();
      });

      const profile =
        store && req.principal
          ? await store.getProfile(req.principal.ownerId, req.principal.name)
          : undefined;

      const response = await runNetworkAgentChat(
        {
          message: parsed.message,
          mode: parsed.mode,
          lang: parsed.lang ?? "auto",
          attachments: parsed.attachments,
          profile,
          history: parsed.history,
          state: parsed.state
            ? {
                topology: parsed.state.topology as BuiltTopology,
                plan: parsed.state.plan as NetworkPlan,
                acls: (parsed.state.acls ?? []) as AclRule[],
                faults: parsed.state.faults as FaultState | undefined,
              }
            : undefined,
        },
        controller.signal,
      );

      if (!controller.signal.aborted) res.json(response);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
