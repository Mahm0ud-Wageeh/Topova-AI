import { planBranch } from "@/lib/design/branch";
import { reviewBranchChange } from "@/lib/design/change";
import { branchRequestSchema } from "@/lib/design/schema";
import { changeRequestSchema } from "@/lib/design/snapshot";
import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/error-handler";
import type { DataStore } from "../storage/types";

const createBranchDesignSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    input: branchRequestSchema,
  })
  .strict();

const appendBranchRevisionSchema = z
  .object({
    expectedHead: z.number().int().min(1).max(2_147_483_646),
    input: branchRequestSchema,
  })
  .strict();

export function branchRouter(store: DataStore) {
  const router = Router();

  router.post("/branch-plans", (req, res, next) => {
    try {
      const input = branchRequestSchema.parse(req.body);
      res.json(planBranch(input));
    } catch (err) {
      next(err);
    }
  });

  router.post("/branch-changes", (req, res, next) => {
    try {
      const input = changeRequestSchema.parse(req.body);
      res.json(reviewBranchChange(input));
    } catch (err) {
      next(err);
    }
  });

  router.get("/branch-designs", async (req, res, next) => {
    try {
      const designs = await store.listBranchDesigns(req.principal!.ownerId);
      res.json({ designs });
    } catch (err) {
      next(err);
    }
  });

  router.post("/branch-designs", async (req, res, next) => {
    try {
      const body = createBranchDesignSchema.parse(req.body);
      const design = await store.createBranchDesign(
        req.principal!.ownerId,
        body.name,
        body.input,
      );
      res.status(201).json({ design });
    } catch (err) {
      next(err);
    }
  });

  router.get("/branch-designs/:id", async (req, res, next) => {
    try {
      const rawRev = req.query.revision;
      let revisionNumber: number | undefined;
      if (rawRev !== undefined) {
        const str = String(rawRev);
        const parsed = Number(str);
        if (
          !/^[1-9]\d*$/.test(str) ||
          !Number.isInteger(parsed) ||
          parsed > 2_147_483_647
        ) {
          throw new HttpError(
            400,
            "INVALID_REVISION",
            "Enter a valid revision number.",
          );
        }
        revisionNumber = parsed;
      }
      const detail = await store.loadBranchDesign(
        req.principal!.ownerId,
        req.params.id,
        revisionNumber,
      );
      if (!detail)
        throw new HttpError(
          404,
          "DESIGN_NOT_FOUND",
          "Design or revision not found.",
        );
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.post("/branch-designs/:id", async (req, res, next) => {
    try {
      const body = appendBranchRevisionSchema.parse(req.body);
      const result = await store.appendBranchDesignRevision(
        req.principal!.ownerId,
        req.params.id,
        body.expectedHead,
        body.input,
      );
      if (result.outcome === "missing") {
        throw new HttpError(404, "DESIGN_NOT_FOUND", "Design not found.");
      }
      if (result.outcome === "stale") {
        throw new HttpError(
          409,
          "REVISION_CONFLICT",
          "A newer revision exists. Open it before saving.",
          {
            head: result.head,
          },
        );
      }
      res.status(201).json({ design: result.design });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
