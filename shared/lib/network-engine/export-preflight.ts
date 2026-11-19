import {
  aclsSchema,
  builtTopologySchema,
  networkPlanSchema,
} from "../validators/schemas";
import type { AclRule, BuiltTopology, NetworkPlan } from "./types";
export interface ExportFinding {
  code: string;
  severity: "error" | "warning";
  message: string;
  deviceId?: string;
}
export function checkExport(
  topology: BuiltTopology,
  plan: NetworkPlan,
  acls: AclRule[] = [],
) {
  const findings: ExportFinding[] = [];
  for (const [schema, value] of [
    [builtTopologySchema, topology],
    [networkPlanSchema, plan],
    [aclsSchema, acls],
  ] as const) {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        findings.push({
          code: "INVALID_MODEL",
          severity: "error",
          message: `${issue.path.join(".")}: ${issue.message}`,
        });
  }
  if (findings.length) return { ready: false, findings };
  if (!topology.devices.length)
    findings.push({
      code: "EMPTY_TOPOLOGY",
      severity: "error",
      message: "Add at least one device before exporting.",
    });
  const ids = new Set(plan.vlanPlan.map((vlan) => vlan.id));
  for (const acl of acls)
    for (const vlan of [acl.sourceVlan, acl.destinationVlan])
      if (vlan !== "any" && !ids.has(vlan))
        findings.push({
          code: "UNKNOWN_ACL_VLAN",
          severity: "error",
          message: `ACL ${acl.name} references missing VLAN ${vlan}.`,
        });
  for (const device of topology.devices) {
    const links = topology.connections.filter(
      (link) => link.from === device.id || link.to === device.id,
    );
    if (topology.devices.length > 1 && !links.length)
      findings.push({
        code: "DISCONNECTED_DEVICE",
        severity: "warning",
        deviceId: device.id,
        message: `${device.label} has no connection. It will be exported as an isolated device.`,
      });
    const peers = links.map((link) =>
      topology.devices.find(
        (peer) => peer.id === (link.from === device.id ? link.to : link.from),
      )!,
    );
    const uplinks = peers.filter((peer) =>
      ["SWITCH", "ROUTER", "FIREWALL"].includes(peer.type),
    ).length;
    if (
      device.type === "SWITCH" &&
      (uplinks > 2 || links.length - uplinks > 24)
    )
      findings.push({
        code: "SWITCH_PORT_CAPACITY",
        severity: "error",
        deviceId: device.id,
        message: `${device.label} exceeds the selected 2960 profile (24 access ports + 2 uplinks). Split the network or select a supported design.`,
      });
    if (device.type === "ROUTER" && links.length > 3)
      findings.push({
        code: "ROUTER_PORT_CAPACITY",
        severity: "error",
        deviceId: device.id,
        message: `${device.label} requires ${links.length} interfaces; the default router profile supports 3.`,
      });
    if (
      !["ROUTER", "SWITCH", "FIREWALL", "AP"].includes(device.type) &&
      links.length > 1
    )
      findings.push({
        code: "ENDPOINT_PORT_CAPACITY",
        severity: "error",
        deviceId: device.id,
        message: `${device.label} has multiple wired connections but the endpoint profile supports one.`,
      });
  }
  if (topology.devices.some((device) => device.type === "FIREWALL"))
    findings.push({
      code: "FIREWALL_PROFILE",
      severity: "warning",
      message:
        "Firewall exports use an IOS lab approximation. Review device-specific ASA policy and interfaces before use.",
    });
  findings.push({
    code: "LAB_VALIDATION",
    severity: "warning",
    message:
      "These are generated lab configurations. Validate them in the selected simulator; device images and live hardware compatibility are not verified.",
  });
  return {
    ready: !findings.some((finding) => finding.severity === "error"),
    findings,
  };
}
