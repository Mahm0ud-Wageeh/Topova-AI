import { Router } from "express";
import { z } from "zod";
import type { DataStore } from "../storage/types";

const accentEnum = z.enum(["blue", "cyan", "emerald", "violet"]);
const modeEnum = z.enum(["auto", "architect", "security", "executive"]);
const routingEnum = z.enum(["OSPF", "EIGRP", "BGP", "STATIC"]);

const profilePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  roleTitle: z.string().trim().max(80).optional(),
  organization: z.string().trim().max(100).optional(),
  bio: z.string().trim().max(400).optional(),
  avatarColor: accentEnum.optional(),
  customInstructions: z.string().trim().max(1500).optional(),
  memoryNotes: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
  preferences: z
    .object({
      defaultMode: modeEnum.optional(),
      defaultRouting: routingEnum.optional(),
      autoVlan: z.boolean().optional(),
      autoApplyCanvas: z.boolean().optional(),
      showThinkingByDefault: z.boolean().optional(),
      accentTheme: accentEnum.optional(),
    })
    .optional(),
});

export function profileRouter(store: DataStore) {
  const router = Router();

  router.get("/", async (req, res, next) => {
    try {
      const ownerId = req.principal!.ownerId;
      const [profile, stats] = await Promise.all([
        store.getProfile(ownerId, req.principal?.name),
        store.getProfileStats(ownerId),
      ]);
      res.json({
        profile,
        stats,
        account: {
          isGuest: req.principal!.isGuest,
          email: req.principal?.email ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch("/", async (req, res, next) => {
    try {
      const parsed = profilePatchSchema.parse(req.body ?? {});
      const ownerId = req.principal!.ownerId;
      const profile = await store.upsertProfile(
        ownerId,
        parsed,
        req.principal?.name,
      );
      const stats = await store.getProfileStats(ownerId);
      res.json({
        profile,
        stats,
        account: {
          isGuest: req.principal!.isGuest,
          email: req.principal?.email ?? null,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
