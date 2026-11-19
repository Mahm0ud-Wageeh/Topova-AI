import { auditSecurityResilience } from "@/lib/network-engine/auditor";
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
import { createDefaultAgentState, runNetworkAgentChat } from "@server/ai/agent";
import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { HttpError } from "../middleware/error-handler";
import type {
  AgentWorkMode,
  ConversationWorkspaceState,
  DataStore,
  StoredChatMessage,
} from "../storage/types";

const modeEnum = z.enum(["auto", "architect", "security", "executive"]);

const workspaceStateSchema = z.object({
  projectName: z.string().trim().max(120).optional(),
  topology: builtTopologySchema,
  plan: networkPlanSchema,
  acls: aclsSchema.optional(),
});

const createConversationSchema = z.object({
  title: z.string().trim().max(120).optional(),
  mode: modeEnum.optional(),
  workspaceState: workspaceStateSchema.optional(),
});

const patchConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    pinned: z.boolean().optional(),
    mode: modeEnum.optional(),
    workspaceState: workspaceStateSchema.optional(),
    expectedVersion: z.number().int().positive().optional(),
    note: z.string().max(200).optional(),
  })
  .refine(
    (value) => !value.workspaceState || value.expectedVersion !== undefined,
    {
      message: "Workspace edits require expectedVersion.",
      path: ["expectedVersion"],
    },
  );

const sendMessageSchema = z.object({
  requestId: z.string().min(8).max(100).optional(),
  expectedVersion: z.number().int().positive().optional(),
  message: z.string().trim().min(1, "Message is required.").max(4000),
  mode: modeEnum.optional(),
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
  state: z
    .object({
      projectName: z.string().trim().max(120).optional(),
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

function deriveTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  return cleaned.length > 48
    ? `${cleaned.slice(0, 48)}…`
    : cleaned || "محادثة جديدة";
}

function makeMsgId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(3).toString("hex")}`;
}

export function conversationsRouter(store: DataStore) {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const conversations = await store.listConversations(
        req.principal!.ownerId,
        q,
      );
      const page = z
        .object({
          offset: z.coerce.number().int().min(0).default(0),
          limit: z.coerce.number().int().min(1).max(100).default(30),
        })
        .parse(req.query);
      res.json({
        conversations: conversations.slice(
          page.offset,
          page.offset + page.limit,
        ),
        total: conversations.length,
        nextOffset:
          page.offset + page.limit < conversations.length
            ? page.offset + page.limit
            : null,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const parsed = createConversationSchema.parse(req.body ?? {});
      const ws = parsed.workspaceState
        ? ({
            projectName:
              parsed.workspaceState.projectName || "Network Architecture",
            topology: parsed.workspaceState.topology as BuiltTopology,
            plan: parsed.workspaceState.plan as NetworkPlan,
            acls: (parsed.workspaceState.acls ?? []) as AclRule[],
          } satisfies ConversationWorkspaceState)
        : undefined;
      const conversation = await store.createConversation(
        req.principal!.ownerId,
        {
          title: parsed.title,
          mode: parsed.mode,
          workspaceState: ws,
        },
      );
      res.status(201).json({ conversation });
    } catch (err) {
      next(err);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      const conversation = await store.getConversation(
        req.principal!.ownerId,
        req.params.id,
      );
      if (!conversation) {
        throw new HttpError(404, "NOT_FOUND", "Conversation not found.");
      }
      const page = z
        .object({
          before: z.coerce.number().int().min(0).optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        })
        .parse(req.query);
      const end = Math.min(
        page.before ?? conversation.messages.length,
        conversation.messages.length,
      );
      const start = Math.max(0, end - page.limit);
      res.json({
        conversation: {
          ...conversation,
          messages: conversation.messages.slice(start, end),
          olderBefore: start > 0 ? start : null,
          totalMessages: conversation.messages.length,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      const parsed = patchConversationSchema.parse(req.body ?? {});
      const ws = parsed.workspaceState
        ? ({
            projectName:
              parsed.workspaceState.projectName || "Network Architecture",
            topology: parsed.workspaceState.topology as BuiltTopology,
            plan: parsed.workspaceState.plan as NetworkPlan,
            acls: (parsed.workspaceState.acls ?? []) as AclRule[],
          } satisfies ConversationWorkspaceState)
        : undefined;
      const updated = await store.updateConversation(
        req.principal!.ownerId,
        req.params.id,
        {
          expectedVersion: parsed.expectedVersion,
          note: parsed.note,
          title: parsed.title,
          pinned: parsed.pinned,
          mode: parsed.mode,
          workspaceState: ws,
        },
      );
      if (!updated) {
        throw new HttpError(404, "NOT_FOUND", "Conversation not found.");
      }
      res.json({ conversation: updated });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      const ok = await store.deleteConversation(
        req.principal!.ownerId,
        req.params.id,
      );
      if (!ok) {
        throw new HttpError(404, "NOT_FOUND", "Conversation not found.");
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post("/:id/restore", async (req, res, next) => {
    try {
      const body = z
        .object({
          revision: z.number().int().positive(),
          expectedVersion: z.number().int().positive(),
        })
        .parse(req.body);
      const conversation = await store.restoreConversation(
        req.principal!.ownerId,
        req.params.id,
        body.revision,
        body.expectedVersion,
      );
      if (!conversation)
        throw new HttpError(404, "NOT_FOUND", "Conversation not found.");
      res.json({ conversation });
    } catch (error) {
      next(error);
    }
  });
  router.post("/:id/proposal", async (req, res, next) => {
    try {
      const body = z
        .object({
          proposalId: z.string(),
          accept: z.boolean(),
          expectedVersion: z.number().int().positive(),
        })
        .parse(req.body);
      const conversation = await store.reviewProposal(
        req.principal!.ownerId,
        req.params.id,
        body.proposalId,
        body.accept,
        body.expectedVersion,
      );
      if (!conversation)
        throw new HttpError(404, "NOT_FOUND", "Conversation not found.");
      res.json({ conversation });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/messages", async (req, res, next) => {
    try {
      const ownerId = req.principal!.ownerId;
      const existing = await store.getConversation(ownerId, req.params.id);
      if (!existing) {
        throw new HttpError(404, "NOT_FOUND", "Conversation not found.");
      }

      const parsed = sendMessageSchema.parse(req.body);
      if (
        parsed.requestId &&
        existing.completedRequests?.includes(parsed.requestId)
      ) {
        res.json({
          conversation: existing,
          assistantMessage: existing.messages.at(-1),
          result: { mutated: false },
        });
        return;
      }
      if (
        parsed.expectedVersion !== undefined &&
        parsed.expectedVersion !== (existing.version ?? 1)
      )
        throw new HttpError(
          409,
          "STALE_VERSION",
          "Reload the conversation before sending.",
        );
      if (existing.pendingProposal)
        throw new HttpError(
          409,
          "REVIEW_REQUIRED",
          "Accept or reject the pending design proposal first.",
        );
      const profile = await store.getProfile(ownerId, req.principal?.name);
      const mode: AgentWorkMode =
        parsed.mode ??
        existing.mode ??
        profile.preferences.defaultMode ??
        "auto";

      const effectiveState = parsed.state
        ? {
            topology: parsed.state.topology as BuiltTopology,
            plan: parsed.state.plan as NetworkPlan,
            acls: (parsed.state.acls ?? []) as AclRule[],
            faults: parsed.state.faults as FaultState | undefined,
          }
        : existing.workspaceState
          ? {
              topology: existing.workspaceState.topology,
              plan: existing.workspaceState.plan,
              acls: existing.workspaceState.acls,
            }
          : createDefaultAgentState();

      const controller = new AbortController();
      req.once("aborted", () => controller.abort());
      res.once("close", () => {
        if (!res.writableEnded) controller.abort();
      });

      const agentResult = await runNetworkAgentChat(
        {
          message: parsed.message,
          mode,
          lang: parsed.lang ?? "auto",
          attachments: parsed.attachments,
          profile,
          history: existing.messages
            .slice(-10)
            .map((m) => ({ role: m.role, content: m.content })),
          state: effectiveState,
        },
        controller.signal,
      );

      if (controller.signal.aborted) return;
      const now = new Date().toISOString();
      const userMsg: StoredChatMessage = {
        id: makeMsgId("u"),
        role: "user",
        content: parsed.message,
        createdAt: now,
        mode,
        attachments: parsed.attachments?.map((a) => ({
          name: a.name,
          size: a.content.length,
        })),
      };

      const nextWorkspace: ConversationWorkspaceState | undefined =
        agentResult.mutated && agentResult.nextState
          ? {
              projectName:
                parsed.state?.projectName ||
                existing.workspaceState?.projectName ||
                deriveTitle(parsed.message),
              topology: agentResult.nextState.topology,
              plan: agentResult.nextState.plan,
              acls: agentResult.nextState.acls,
            }
          : existing.workspaceState;

      const requiresReview = Boolean(
        existing.workspaceState && agentResult.mutated && nextWorkspace,
      );
      let topologySummary: StoredChatMessage["topologySummary"];
      if (agentResult.mutated && agentResult.nextState) {
        const audit =
          agentResult.audit ??
          auditSecurityResilience(
            agentResult.nextState.topology,
            agentResult.nextState.plan,
            agentResult.nextState.acls,
          );
        topologySummary = {
          devices: agentResult.nextState.topology.devices.length,
          links: agentResult.nextState.topology.connections.length,
          vlans: agentResult.nextState.plan.vlanPlan.length,
          routing: agentResult.nextState.plan.routing.protocol,
          score: audit.overallScore,
          grade: audit.grade,
        };
      }

      const assistantMsg: StoredChatMessage = {
        id: makeMsgId("a"),
        role: "assistant",
        content: requiresReview
          ? `${parsed.lang === "ar" ? "تعديلات مقترحة بانتظار مراجعتك." : "Proposed changes awaiting your review."}\n\n${agentResult.reply}`
          : agentResult.reply,
        createdAt: new Date().toISOString(),
        mode,
        thinkingSteps: agentResult.thinkingSteps,
        toolCalls: agentResult.toolCalls,
        followUpSuggestions: agentResult.followUpSuggestions,
        clarifyingQuestions: agentResult.clarifyingQuestions,
        cliOutput: agentResult.cliOutput,
        hasTopologyUpdate: agentResult.mutated && !requiresReview,
        topologySummary,
      };

      const shouldAutoTitle =
        existing.messages.length === 0 &&
        (existing.title === "محادثة جديدة" || existing.title === "New Chat");

      const proposal =
        requiresReview && nextWorkspace
          ? { id: makeMsgId("proposal"), state: nextWorkspace, createdAt: now }
          : undefined;
      if (nextWorkspace) workspaceStateSchema.parse(nextWorkspace);
      const updated = await store.appendConversationMessages(
        ownerId,
        existing.id,
        [userMsg, assistantMsg],
        {
          title: shouldAutoTitle ? deriveTitle(parsed.message) : undefined,
          mode,
          workspaceState: requiresReview ? undefined : nextWorkspace,
          pendingProposal: proposal,
          expectedVersion: existing.version ?? 1,
          requestId: parsed.requestId,
        },
      );

      if (!updated)
        throw new HttpError(404, "NOT_FOUND", "Conversation no longer exists.");
      res.json({
        conversation: updated,
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        result: agentResult,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
