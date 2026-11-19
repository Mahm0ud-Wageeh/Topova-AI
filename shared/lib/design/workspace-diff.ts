import type {
  AclRule,
  BuiltTopology,
  NetworkPlan,
} from "../network-engine/types";
export interface WorkspaceSnapshot {
  projectName: string;
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls: AclRule[];
}
export interface WorkspaceChange {
  area: string;
  name: string;
  kind: "added" | "removed" | "changed";
  before?: string;
  after?: string;
}
export function compareWorkspaces(
  before: WorkspaceSnapshot | undefined,
  after: WorkspaceSnapshot,
): WorkspaceChange[] {
  const changes: WorkspaceChange[] = [];
  function compare<T>(
    area: string,
    left: T[],
    right: T[],
    key: (item: T) => string,
    describe: (item: T) => string,
  ) {
    const old = new Map(left.map((item) => [key(item), item]));
    const next = new Map(right.map((item) => [key(item), item]));
    for (const [name, item] of old) {
      const replacement = next.get(name);
      if (!replacement)
        changes.push({ area, name, kind: "removed", before: describe(item) });
      else if (JSON.stringify(item) !== JSON.stringify(replacement))
        changes.push({
          area,
          name,
          kind: "changed",
          before: describe(item),
          after: describe(replacement),
        });
    }
    for (const [name, item] of next)
      if (!old.has(name))
        changes.push({ area, name, kind: "added", after: describe(item) });
  }
  compare(
    "Devices",
    before?.topology.devices ?? [],
    after.topology.devices,
    (d) => d.id,
    (d) =>
      `${d.label} (${d.type})${d.meta ? ` ${JSON.stringify(d.meta)}` : ""}`,
  );
  compare(
    "Links",
    before?.topology.connections ?? [],
    after.topology.connections,
    (d) => d.id,
    (d) => `${d.from} ↔ ${d.to}${d.meta ? ` ${JSON.stringify(d.meta)}` : ""}`,
  );
  compare(
    "VLANs",
    before?.plan.vlanPlan ?? [],
    after.plan.vlanPlan,
    (v) => String(v.id),
    (v) => `${v.name}: ${v.subnet}`,
  );
  compare(
    "Subnets",
    before?.plan.ipPlan.subnets ?? [],
    after.plan.ipPlan.subnets,
    (v) => v.name,
    (v) => `${v.cidr} (${v.mask}; ${v.range})`,
  );
  compare(
    "ACLs",
    before?.acls ?? [],
    after.acls,
    (v) => v.id,
    (v) =>
      `${v.action} ${v.protocol} ${v.sourceVlan} → ${v.destinationVlan}${v.port ? ` :${v.port}` : ""} — ${v.description}`,
  );
  if (before?.plan.ipPlan.base !== after.plan.ipPlan.base)
    changes.push({
      area: "Address pool",
      name: "IPv4",
      kind: "changed",
      before: before?.plan.ipPlan.base,
      after: after.plan.ipPlan.base,
    });
  if (
    JSON.stringify(before?.plan.routing) !== JSON.stringify(after.plan.routing)
  )
    changes.push({
      area: "Routing",
      name: after.plan.routing.protocol,
      kind: "changed",
      before: before ? JSON.stringify(before.plan.routing) : undefined,
      after: JSON.stringify(after.plan.routing),
    });
  if (before && before.projectName !== after.projectName)
    changes.push({
      area: "Project",
      name: "Name",
      kind: "changed",
      before: before.projectName,
      after: after.projectName,
    });
  if (
    before &&
    JSON.stringify(before.topology.layout) !==
      JSON.stringify(after.topology.layout)
  )
    changes.push({
      area: "Layout",
      name: "Device positions",
      kind: "changed",
      before: "Previous layout",
      after: "Updated layout",
    });
  return changes;
}
