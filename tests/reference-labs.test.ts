import { describe, expect, it } from "vitest";
import labs from "../Docs/fixtures/network-labs.json";
import { buildTopology, planNetwork, generateZeroTrustAcls, estimateBomAndPoe } from "@/lib/network-engine";
import { checkExport } from "@/lib/network-engine/export-preflight";
import { builtTopologySchema, networkPlanSchema } from "@/lib/validators/schemas";
import type { ParsedIntent } from "@/lib/network-engine/types";
describe("documented reference network labs", () => {
  for (const lab of labs) it(lab.id, () => {
    const topology = buildTopology({ devices: lab.devices, options: lab.options } as ParsedIntent);
    const plan = planNetwork(topology, undefined, lab.options);
    const acls = generateZeroTrustAcls(plan);
    expect(topology.devices).toHaveLength(lab.expectedDevices);
    expect(builtTopologySchema.safeParse(topology).success).toBe(true);
    expect(networkPlanSchema.safeParse(plan).success).toBe(true);
    expect(checkExport(topology, plan, acls).ready).toBe(true);
    if (lab.options.vlan) expect(plan.vlanPlan.length).toBeGreaterThan(0);
    if (lab.poe) expect(estimateBomAndPoe(topology, plan).poe.requiredWatts).toBeGreaterThan(0);
  });
});
