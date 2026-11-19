// @vitest-environment node
import { describe, expect, it } from "vitest";
import { POST } from "./api-harness";
import fixture from "@/Docs/fixtures/branch-01.json";
import { planBranch } from "@/lib/design/branch";
import { branchExample } from "@/lib/design/example";
import { createSnapshot, snapshotSchema } from "@/lib/design/snapshot";

const plan = planBranch(branchExample);
const option = plan.alternatives[0];
if (!option.feasible) throw new Error("Expected a valid example.");
const snapshot = snapshotSchema.parse(createSnapshot(plan, option));
const segment = { id: "guests", label: "الضيوف", vlanId: 40, endpointAddresses: 4, accessPorts: 4, switchId: "sw1" };

const submit = (body: unknown) => POST(new Request("http://localhost/api/v1/branch-changes", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));

describe("branch change review", () => {
  it("takes an exported snapshot and generates the reference diff and exact reverse delta", async () => {
    const result = await submit({ snapshot, segment });
    expect(result.status).toBe(200);
    const report = await result.json();
    const { addedSubnet, freeSwitchPortsAfter } = fixture.brownfield.expectedDiff;
    expect(report.status).toBe("candidate");
    expect(report.baselineDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(report.diff.addedSubnet).toMatchObject(addedSubnet);
    expect(report.diff.remainingPortsOnSwitch).toBe(freeSwitchPortsAfter);
    expect(report.diff.addedAccess.map((x: { interfaceId: string }) => x.interfaceId))
      .toEqual(["sw1-p17", "sw1-p18", "sw1-p19", "sw1-p20"]);
    expect(report.candidate.subnets.slice(0, -1)).toEqual(snapshot.subnets);
    expect(report.candidate.access.slice(0, snapshot.access.length)).toEqual(snapshot.access);
    expect(snapshotSchema.safeParse(report.candidate).success).toBe(true);
    expect(report.rollback.restoreTrunks).toEqual(snapshot.tagging);
    expect(report.rollback.removeAccess).toEqual(report.diff.addedAccess);
    expect(report.findings).toContainEqual(expect.objectContaining({ rule: "POL-01", status: "unknown" }));
  });

  it("updates both trunks only on the path to a second switch", async () => {
    const dual = plan.alternatives[1];
    if (!dual.feasible) throw new Error("Expected a second switch.");
    const response = await submit({ snapshot: createSnapshot(plan, dual), segment: { ...segment, switchId: "sw2" } });
    const report = await response.json();
    expect(report.diff.updatedTrunks.map((link: { linkId: string }) => link.linkId)).toEqual(["switch-trunk", "router-trunk"]);
    expect(report.diff.addedAccess.every((port: { interfaceId: string }) => port.interfaceId.startsWith("sw2-"))).toBe(true);
  });

  it("withholds a candidate when the snapshot lacks trunk evidence", async () => {
    const response = await submit({ snapshot: { ...snapshot, tagging: [] }, segment });
    const report = await response.json();
    expect(report.status).toBe("insufficient-evidence");
    expect(report.candidate).toBeUndefined();
  });

  it("rejects an existing VLAN, port shortage, and a pool where no aligned block remains", async () => {
    const attempts = [
      [{ snapshot, segment: { ...segment, vlanId: 10 } }, "DUPLICATE_SEGMENT"],
      [{ snapshot, segment: { ...segment, endpointAddresses: 8, accessPorts: 8 } }, "PORT_CAPACITY"],
      [{ snapshot: { ...snapshot, parentCidr: "10.50.0.0/27" }, segment }, "NO_FREE_SUBNET"],
    ] as const;
    for (const [input, code] of attempts) {
      const response = await submit(input);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { code } });
    }
  });

  it("rejects overlapping subnets and a trunk port reused for access", async () => {
    const invalid = { ...snapshot,
      subnets: [...snapshot.subnets, { ...snapshot.subnets[0], segmentId: "other", vlanId: 120 }],
      access: [...snapshot.access, { segmentId: "staff", interfaceId: "sw1-p24" }],
    };
    const response = await submit({ snapshot: invalid, segment });
    expect(response.status).toBe(422);
    expect((await response.json()).error.fieldIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["snapshot", "subnets", 3, "cidr"] }),
      expect.objectContaining({ path: ["snapshot", "access", 16] }),
    ]));
  });
});
