import {
  analyzeSpof,
  executeCliCommand,
  forecastTraffic,
  simulateAttackPath,
  tracePacket,
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

const faultSchema = z
  .object({
    disabledDevices: z.array(z.string()).default([]),
    disabledLinks: z.array(z.string()).default([]),
  })
  .optional();

const basePayload = z.object({
  topology: builtTopologySchema,
  plan: networkPlanSchema,
  acls: aclsSchema.optional(),
  faults: faultSchema,
});

const packetSchema = basePayload.extend({
  sourceId: z.string().min(1),
  destinationId: z.string().min(1),
  protocol: z.enum(["ICMP", "TCP", "UDP"]).default("ICMP"),
  port: z.number().int().min(1).max(65535).optional(),
});

const attackSchema = basePayload.extend({
  entryDeviceId: z.string().min(1),
});

const trafficSchema = basePayload.extend({
  profile: z
    .enum(["office", "surveillance", "voip", "cloud-backup"])
    .default("office"),
  multiplier: z.number().min(0.25).max(10).default(1),
});

const cliSchema = basePayload.extend({
  deviceId: z.string().min(1),
  command: z.string().max(256),
});

export function simulateRouter() {
  const router = Router();

  router.post("/packet-trace", (req, res, next) => {
    try {
      const data = packetSchema.parse(req.body);
      const result = tracePacket(
        data.topology as BuiltTopology,
        data.plan as NetworkPlan,
        {
          sourceId: data.sourceId,
          destinationId: data.destinationId,
          protocol: data.protocol,
          port: data.port,
          faults: data.faults as FaultState | undefined,
          acls: (data.acls ?? []) as AclRule[],
        },
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/fault-analysis", (req, res, next) => {
    try {
      const data = basePayload.parse(req.body);
      const result = analyzeSpof(
        data.topology as BuiltTopology,
        data.plan as NetworkPlan,
        data.faults as FaultState | undefined,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/attack-path", (req, res, next) => {
    try {
      const data = attackSchema.parse(req.body);
      const result = simulateAttackPath(
        data.topology as BuiltTopology,
        data.plan as NetworkPlan,
        data.entryDeviceId,
        (data.acls ?? []) as AclRule[],
        data.faults as FaultState | undefined,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/traffic", (req, res, next) => {
    try {
      const data = trafficSchema.parse(req.body);
      const result = forecastTraffic(
        data.topology as BuiltTopology,
        data.plan as NetworkPlan,
        data.profile,
        data.multiplier,
        data.faults as FaultState | undefined,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post("/cli", (req, res, next) => {
    try {
      const data = cliSchema.parse(req.body);
      const result = executeCliCommand(
        {
          topology: data.topology as BuiltTopology,
          plan: data.plan as NetworkPlan,
          acls: (data.acls ?? []) as AclRule[],
          faults: data.faults as FaultState | undefined,
        },
        data.deviceId,
        data.command,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
