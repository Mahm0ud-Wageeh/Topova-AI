// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POST } from "./api-harness";
import fixture from "@/Docs/fixtures/branch-01.json";
import { planBranch } from "@/lib/design/branch";
import { branchRequestSchema, topologyV1Schema } from "@/lib/design/schema";

const example = branchRequestSchema.parse({
  schemaVersion: 1,
  parentCidr: fixture.greenfield.parentCidr,
  portsPerSwitch: 24,
  segments: fixture.greenfield.requirements.map((segment) => ({
    id: segment.id,
    label: segment.id,
    vlanId: segment.vlanId,
    endpointAddresses: segment.endpointAddresses,
    accessPorts: segment.id === "management" ? 0 : segment.endpointAddresses,
    minimumPrefix: segment.minimumBlockAddresses ? 32 - Math.log2(segment.minimumBlockAddresses) : undefined,
  })),
});

const request = (value: unknown) => new Request("http://localhost/api/v1/branch-plans", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

describe("branch design from the reference fixture", () => {
  it("keeps each VLAN paired with its CIDR and gateway even if request rows are reordered", () => {
    const plan = planBranch({ ...example, segments: [...example.segments].reverse() });
    expect(plan.addresses.map(({ segmentId, cidr, gateway }) => ({ segmentId, cidr, gateway })))
      .toEqual(fixture.baseline.subnets.map(({ segmentId, cidr, gateway }) => ({ segmentId, cidr, gateway })));
    expect(plan.unallocatedAddresses).toBe(224);
  });

  it("reserves the real trunk ports and reports options that cannot hold the requirements", () => {
    const plan = planBranch(example);
    expect(plan.alternatives.map((option) => option.freeSwitchPorts))
      .toEqual(fixture.greenfield.expectedDesignAlternatives.map((option) => option.freeSwitchPorts));
    const [single, dual] = planBranch({
      ...example, segments: [{ ...example.segments[0], endpointAddresses: 24, accessPorts: 24 }],
    }).alternatives;
    expect(single).toMatchObject({ feasible: false, portShortfall: 1 });
    expect(dual.feasible).toBe(true);
    if (!dual.feasible) throw new Error("Expected a two-switch option.");
    const assigned = new Set(dual.access.map(({ interfaceId }) => interfaceId));
    expect(assigned.size).toBe(24);
    expect(dual.topology.links.every((link) => !assigned.has(link.fromInterfaceId) && !assigned.has(link.toInterfaceId)))
      .toBe(true);
  });

  it("rejects duplicate IDs and dangling links at the model boundary", () => {
    const [alternative] = planBranch(example).alternatives;
    if (!alternative.feasible) throw new Error("Expected a fixture topology.");
    const topology = alternative.topology;
    expect(topologyV1Schema.safeParse({ ...topology, devices: [topology.devices[0], topology.devices[0]] }).success).toBe(false);
    expect(topologyV1Schema.safeParse({
      ...topology, links: [{ ...topology.links[0], toInterfaceId: "missing" }],
    }).success).toBe(false);
  });
});

describe("Node branch planning API", () => {
  it("returns a plan without persistence or an AI provider", async () => {
    const response = await POST(request(example));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ schemaVersion: 1, unallocatedAddresses: 224 });
  });

  it("distinguishes an exhausted pool from an invalid network or duplicate VLAN", async () => {
    const exhausted = await POST(request({ ...example, parentCidr: "10.50.0.0/28" }));
    expect(exhausted.status).toBe(422);
    expect(await exhausted.json()).toMatchObject({ error: { code: "POOL_CAPACITY", requiredAddresses: 32, availableAddresses: 16 } });
    const malformed = await POST(request({
      ...example, parentCidr: "10.50.0.1/24", segments: [example.segments[0], { ...example.segments[1], vlanId: 10 }],
    }));
    expect(malformed.status).toBe(422);
    expect(await malformed.json()).toMatchObject({ error: { code: "INVALID_DESIGN", fieldIssues: [
      { path: ["parentCidr"] }, { path: ["segments", 1, "vlanId"] },
    ] } });
  });

  it("caps streamed request bodies and rejects malformed JSON", async () => {
    const response = await POST(request({ padding: "x".repeat(513 * 1024) }));
    expect(response.status).toBe(413);
    const invalid = await POST(new Request("http://localhost/api/v1/branch-plans", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{",
    }));
    expect(invalid.status).toBe(400);
  });
});
