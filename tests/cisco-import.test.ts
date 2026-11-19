import { describe, expect, it } from "vitest";
import { ciscoExample } from "@/lib/design/cisco-example";
import { importCiscoBranch } from "@/lib/design/cisco-import";
import { reviewBranchChange } from "@/lib/design/change";

const guests = { id: "vlan-40", label: "Guests", vlanId: 40, endpointAddresses: 4, accessPorts: 4, switchId: "switch" };

describe("Cisco branch import", () => {
  it("preserves explicit VLAN settings and uses only declared, confirmed spare ports", () => {
    const { snapshot, accessCount, spareCount } = importCiscoBranch(ciscoExample);
    expect(accessCount).toBe(16);
    expect(spareCount).toBe(4);
    expect(snapshot.tagging[0].vlanIds).toEqual([1, 10, 20]);
    const review = reviewBranchChange({ snapshot, segment: guests });
    if (review.status !== "candidate") throw new Error("Expected a modeled change.");
    expect(review.diff.addedSubnet.cidr).toBe("10.50.0.24/29");
    expect(review.rollback.restoreTrunks[0].vlanIds).toEqual([1, 10, 20]);
    expect(review.vlanPaths).toContainEqual(expect.objectContaining({ vlanId: 40, before: "not-present", after: "allowed" }));
    expect(() => reviewBranchChange({ snapshot, segment: { ...guests, vlanId: 70 } })).toThrow(/already in use/);
    expect(importCiscoBranch({ ...ciscoExample, sparePorts: [] }).spareCount).toBe(0);
  });

  it("keeps a preexisting VLAN exclusion visible without claiming policy or live connectivity", () => {
    const { snapshot } = importCiscoBranch({
      ...ciscoExample, switchConfig: ciscoExample.switchConfig.replace("allowed vlan 1,10,20", "allowed vlan 1,10"),
    });
    const review = reviewBranchChange({ snapshot, segment: guests });
    if (review.status !== "candidate") throw new Error("Expected a modeled change.");
    expect(review.vlanPaths).toContainEqual(expect.objectContaining({ vlanId: 20, before: "blocked", after: "blocked" }));
    expect(review.findings).toContainEqual(expect.objectContaining({ rule: "POL-01", status: "unknown" }));
  });

  it("rejects ambiguous tagging, assigned spares and overlapping external networks", () => {
    expect(() => importCiscoBranch({ ...ciscoExample, sparePorts: ["GigabitEthernet0/1"] })).toThrow();
    expect(() => importCiscoBranch({
      ...ciscoExample, switchConfig: ciscoExample.switchConfig.replace("allowed vlan 1,10,20", "allowed vlan add 20"),
    })).toThrow();
    expect(() => importCiscoBranch({
      ...ciscoExample, routerConfig: ciscoExample.routerConfig + "\ninterface GigabitEthernet0/1\n ip address 10.50.0.33 255.255.255.248 secondary\n!",
    })).toThrow(/بيتداخل/);
  });
});
