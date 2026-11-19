import { branchRequestSchema } from "@/lib/design/schema";
import {
  generateCiscoCmlYaml,
  generateGns3Project,
} from "@/lib/network-engine/cisco-formats";
import { checkExport } from "@/lib/network-engine/export-preflight";
import type {
  AclRule,
  BuiltTopology,
  NetworkPlan,
} from "@/lib/network-engine/types";
import {
  aclsSchema,
  builtTopologySchema,
  networkPlanSchema,
} from "@/lib/validators/schemas";
import { createCiscoPackage } from "@server/cisco-export";
import {
  createMultiVendorLabPack,
  createPacketTracerZip,
} from "@server/lab-pack";
import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../middleware/error-handler";

const ciscoBranchSchema = z
  .object({
    input: branchRequestSchema,
    alternativeId: z.enum(["single-switch", "two-switches"]),
    profile: z.enum(["ios-gigabit", "packet-tracer-2960"]),
  })
  .strict();

const labPackSchema = z.object({
  name: z.string().trim().max(80).optional(),
  acknowledgeWarnings: z.boolean().default(false),
  topology: builtTopologySchema,
  plan: networkPlanSchema,
  acls: aclsSchema.optional(),
});

function wantsJsonEnvelope(acceptHeader: string | undefined): boolean {
  return (acceptHeader ?? "")
    .toLowerCase()
    .split(",")
    .some((part) => part.split(";")[0].trim() === "application/json");
}

function safeSlug(name?: string): string {
  return (name?.trim() || "nettopo-lab")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

export function exportsRouter() {
  const router = Router();

  router.post("/cisco-exports", (req, res, next) => {
    try {
      const { input, alternativeId, profile } = ciscoBranchSchema.parse(
        req.body,
      );
      const zip = createCiscoPackage(input, alternativeId, profile);
      const filename = `nettopo-${alternativeId}-${profile}.zip`;
      if (wantsJsonEnvelope(req.header("accept"))) {
        res.json({
          filename,
          encoding: "base64",
          archive: Buffer.from(zip).toString("base64"),
        });
        return;
      }
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send(Buffer.from(zip));
    } catch (err) {
      next(err);
    }
  });

  router.post("/exports/preflight", (req, res, next) => {
    try {
      const data = labPackSchema.parse(req.body);
      res.json(
        checkExport(
          data.topology as BuiltTopology,
          data.plan as NetworkPlan,
          data.acls,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  // All lab transports share one validation gate; warnings require explicit acknowledgment.
  router.use("/exports", (req, _res, next) => {
    if (req.method !== "POST") {
      next();
      return;
    }
    try {
      const data = labPackSchema.parse(req.body);
      const report = checkExport(
        data.topology as BuiltTopology,
        data.plan as NetworkPlan,
        data.acls,
      );
      if (!report.ready)
        throw new HttpError(
          422,
          "EXPORT_BLOCKED",
          "Resolve the export errors first.",
          { findings: report.findings },
        );
      if (report.findings.length && !data.acknowledgeWarnings)
        throw new HttpError(
          409,
          "EXPORT_REVIEW_REQUIRED",
          "Review and acknowledge the export warnings.",
          { findings: report.findings },
        );
      next();
    } catch (error) {
      next(error);
    }
  });

  // Direct Cisco Modeling Labs (CML 2.x) .yaml export
  router.post("/exports/cml", (req, res, next) => {
    try {
      const data = labPackSchema.parse(req.body);
      const slug = safeSlug(data.name);
      const filename = `${slug}-cisco-cml.yaml`;
      const yaml = generateCiscoCmlYaml(
        data.topology as BuiltTopology,
        data.plan as NetworkPlan,
        (data.acls ?? []) as AclRule[],
        data.name?.trim() || slug,
      );
      if (wantsJsonEnvelope(req.header("accept"))) {
        res.json({ filename, mimeType: "application/x-yaml", content: yaml });
        return;
      }
      res.setHeader("Content-Type", "application/x-yaml; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send(yaml);
    } catch (err) {
      next(err);
    }
  });

  // Direct GNS3 (.gns3) project file export
  router.post("/exports/gns3", (req, res, next) => {
    try {
      const data = labPackSchema.parse(req.body);
      const slug = safeSlug(data.name);
      const filename = `${slug}.gns3`;
      const bundle = generateGns3Project(
        data.topology as BuiltTopology,
        data.plan as NetworkPlan,
        (data.acls ?? []) as AclRule[],
        data.name?.trim() || slug,
      );
      if (wantsJsonEnvelope(req.header("accept"))) {
        res.json({
          filename,
          mimeType: "application/json",
          content: bundle.projectJson,
        });
        return;
      }
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send(bundle.projectJson);
    } catch (err) {
      next(err);
    }
  });

  // Direct Cisco Packet Tracer 8.x Ready Pack (.zip with .cfg startup files + paste CLI + HTML guide + CML + GNS3)
  router.post("/exports/packet-tracer", (req, res, next) => {
    try {
      const data = labPackSchema.parse(req.body);
      const { filename, zip } = createPacketTracerZip({
        name: data.name,
        topology: data.topology as BuiltTopology,
        plan: data.plan as NetworkPlan,
        acls: (data.acls ?? []) as AclRule[],
      });
      if (wantsJsonEnvelope(req.header("accept"))) {
        res.json({
          filename,
          encoding: "base64",
          archive: Buffer.from(zip).toString("base64"),
        });
        return;
      }
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send(Buffer.from(zip));
    } catch (err) {
      next(err);
    }
  });

  router.post("/exports/lab-pack", (req, res, next) => {
    try {
      const data = labPackSchema.parse(req.body);
      const { filename, zip } = createMultiVendorLabPack({
        name: data.name,
        topology: data.topology as BuiltTopology,
        plan: data.plan as NetworkPlan,
        acls: (data.acls ?? []) as AclRule[],
      });
      if (wantsJsonEnvelope(req.header("accept"))) {
        res.json({
          filename,
          encoding: "base64",
          archive: Buffer.from(zip).toString("base64"),
        });
        return;
      }
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.send(Buffer.from(zip));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
