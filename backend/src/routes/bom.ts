import { estimateBomAndPoe } from "@/lib/network-engine";
import type { BuiltTopology } from "@/lib/network-engine/types";
import { builtTopologySchema } from "@/lib/validators/schemas";
import { Router } from "express";
import { z } from "zod";

const bomSchema = z.object({
  topology: builtTopologySchema,
});

export function bomRouter() {
  const router = Router();

  router.post("/estimate", (req, res, next) => {
    try {
      const data = bomSchema.parse(req.body);
      res.json(estimateBomAndPoe(data.topology as BuiltTopology));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
