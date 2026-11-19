import { planNetwork } from "@/lib/network-engine/planner";
import { analyzeSpof } from "@/lib/network-engine/simulator";
import { cableFor, computeLayout } from "@/lib/network-engine/topology-builder";
import type {
  AclRule,
  BuiltTopology,
  Connection,
  Device,
  FaultState,
  NetworkPlan,
} from "@/lib/network-engine/types";

export interface AuditPillar {
  id: "redundancy" | "segmentation" | "perimeter" | "capacity";
  label: string;
  score: number;
  maxScore: number;
  status: "strong" | "warning" | "critical";
  detail: string;
}

export interface AuditFinding {
  id: string;
  pillar: AuditPillar["id"];
  severity: "critical" | "high" | "medium";
  title: string;
  detail: string;
  remediation: string;
}

export interface SecurityAuditReport {
  overallScore: number;
  grade: "A+" | "A" | "B" | "C" | "D" | "F";
  pillars: AuditPillar[];
  findings: AuditFinding[];
  recommendedAcls: AclRule[];
}

export interface AutoRemediationResult {
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls: AclRule[];
  changesSummary: string[];
}

/** Generates deterministic Zero-Trust Inter-VLAN ACL rules tailored to active VLANs. */
export function generateZeroTrustAcls(plan: NetworkPlan): AclRule[] {
  const vlanIds = new Set(plan.vlanPlan.map((v) => v.id));
  if (vlanIds.size === 0) return [];
  const rules: AclRule[] = [];

  if (vlanIds.has(10) && vlanIds.has(20)) {
    rules.push(
      {
        id: "zt-users-servers-https",
        name: "PERMIT-USERS-HTTPS",
        action: "permit",
        protocol: "tcp",
        sourceVlan: 10,
        destinationVlan: 20,
        port: 443,
        description: "Allow Users VLAN 10 HTTPS access to Servers VLAN 20.",
      },
      {
        id: "zt-users-servers-dns",
        name: "PERMIT-USERS-DNS",
        action: "permit",
        protocol: "udp",
        sourceVlan: 10,
        destinationVlan: 20,
        port: 53,
        description: "Allow Users VLAN 10 DNS queries to Servers VLAN 20.",
      },
      {
        id: "zt-users-servers-deny",
        name: "DENY-USERS-SERVERS-ADMIN",
        action: "deny",
        protocol: "ip",
        sourceVlan: 10,
        destinationVlan: 20,
        description: "Block direct SSH/SMB/RDP lateral movement from Users VLAN 10 to Servers VLAN 20.",
      },
    );
  }

  if (vlanIds.has(60)) {
    if (vlanIds.has(20)) {
      rules.push({
        id: "zt-wifi-deny-servers",
        name: "ISOLATE-WIFI-SERVERS",
        action: "deny",
        protocol: "ip",
        sourceVlan: 60,
        destinationVlan: 20,
        description: "Block Guest/Wi-Fi VLAN 60 from accessing Servers VLAN 20.",
      });
    }
    if (vlanIds.has(99)) {
      rules.push({
        id: "zt-wifi-deny-mgmt",
        name: "ISOLATE-WIFI-MGMT",
        action: "deny",
        protocol: "ip",
        sourceVlan: 60,
        destinationVlan: 99,
        description: "Block Wi-Fi VLAN 60 from reaching Management VLAN 99.",
      });
    }
  }

  if (vlanIds.has(40)) {
    rules.push({
      id: "zt-cam-nvr-rtsp",
      name: "PERMIT-CAMERAS-RTSP",
      action: "permit",
      protocol: "tcp",
      sourceVlan: 40,
      destinationVlan: 20,
      port: 554,
      description: "Allow Cameras VLAN 40 RTSP video stream to NVR/Servers VLAN 20 only.",
    });
    rules.push({
      id: "zt-cam-deny-all",
      name: "ISOLATE-CAMERAS-LATERAL",
      action: "deny",
      protocol: "ip",
      sourceVlan: 40,
      destinationVlan: "any",
      description: "Prevent compromised CCTV cameras from initiating lateral movement.",
    });
  }

  if (vlanIds.has(99)) {
    rules.push({
      id: "zt-deny-any-mgmt",
      name: "PROTECT-MGMT-VLAN99",
      action: "deny",
      protocol: "ip",
      sourceVlan: "any",
      destinationVlan: 99,
      description: "Restrict Management VLAN 99 access from non-admin VLANs.",
    });
  }

  return rules;
}

function gradeFromScore(score: number): SecurityAuditReport["grade"] {
  if (score >= 93) return "A+";
  if (score >= 85) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

function statusFromPillar(score: number, max: number): AuditPillar["status"] {
  const ratio = score / max;
  if (ratio >= 0.8) return "strong";
  if (ratio >= 0.5) return "warning";
  return "critical";
}

/**
 * Evaluates a network topology across 4 weighted pillars (25 points each = 100 total).
 */
export function auditSecurityResilience(
  topology: BuiltTopology,
  plan: NetworkPlan,
  acls: AclRule[] = [],
  faults?: FaultState,
): SecurityAuditReport {
  const findings: AuditFinding[] = [];
  const spof = analyzeSpof(topology, plan, faults);
  const routers = topology.devices.filter((d) => d.type === "ROUTER");
  const switches = topology.devices.filter((d) => d.type === "SWITCH");
  const hasFirewall = topology.devices.some((d) => d.type === "FIREWALL");
  const hasServer = topology.devices.some((d) => d.type === "SERVER" || d.type === "NVR");
  const endpoints = topology.devices.filter(
    (d) => !["ROUTER", "SWITCH", "FIREWALL"].includes(d.type),
  );

  // 1. Redundancy & Resilience (25)
  const redundancy = Math.round((spof.redundancyScore / 100) * 25);
  if (routers.length < 2 && topology.devices.length > 3) {
    findings.push({
      id: "find-single-router",
      pillar: "redundancy",
      severity: "high",
      title: "Single edge router (SPOF)",
      detail: "Only one gateway router exists; a router outage takes down all inter-VLAN and WAN traffic.",
      remediation: "Deploy a secondary router with HSRP/VRRP and dual uplinks.",
    });
  }
  if (spof.criticalLinks.length > 0) {
    findings.push({
      id: "find-bridge-links",
      pillar: "redundancy",
      severity: "medium",
      title: `${spof.criticalLinks.length} single-point-of-failure trunk link(s)`,
      detail: "Cutting an infrastructure bridge link partitions part of the network from the gateway.",
      remediation: "Add redundant switch-to-core uplinks or LACP EtherChannel.",
    });
  }

  // 2. Segmentation & VLAN Isolation (25)
  let segmentation = 25;
  if (plan.vlanPlan.length === 0 && topology.devices.length > 2) {
    segmentation = 6;
    findings.push({
      id: "find-flat-lan",
      pillar: "segmentation",
      severity: "critical",
      title: "Flat unsegmented broadcast domain",
      detail: "All endpoints and servers share one L2 network with zero broadcast or security isolation.",
      remediation: "Enable role-based VLAN segmentation (Users 10, Servers 20, Wi-Fi 60, MGMT 99).",
    });
  } else {
    if (hasServer && !plan.vlanPlan.some((v) => v.id === 20)) {
      segmentation -= 10;
      findings.push({
        id: "find-server-vlan",
        pillar: "segmentation",
        severity: "high",
        title: "Servers lack a dedicated VLAN",
        detail: "Servers should be isolated in VLAN 20 behind strict ACL policies.",
        remediation: "Assign servers to dedicated VLAN 20.",
      });
    }
    if (!plan.vlanPlan.some((v) => v.id === 99) && topology.devices.length > 2) {
      segmentation -= 6;
      findings.push({
        id: "find-mgmt-vlan",
        pillar: "segmentation",
        severity: "medium",
        title: "No dedicated Management VLAN (99)",
        detail: "Network device SSH/SNMP management should be separated from user traffic.",
        remediation: "Provision dedicated Management VLAN 99 for routers, switches, and firewalls.",
      });
    }
  }
  segmentation = Math.max(0, segmentation);

  // 3. Perimeter & ACL Hardening (25)
  let perimeter = 25;
  if (!hasFirewall && topology.devices.length > 1) {
    perimeter -= 12;
    findings.push({
      id: "find-no-firewall",
      pillar: "perimeter",
      severity: "critical",
      title: "Missing perimeter firewall",
      detail: "Edge routers and internal servers are exposed without stateful firewall inspection.",
      remediation: "Insert a perimeter firewall between the WAN edge router and distribution switches.",
    });
  }
  if (plan.vlanPlan.length > 1 && acls.length === 0) {
    perimeter -= 9;
    findings.push({
      id: "find-no-acls",
      pillar: "perimeter",
      severity: "high",
      title: "Inter-VLAN routing has no Zero-Trust ACLs",
      detail: "VLANs are separated at L2, but L3 routing allows unrestricted traffic between every VLAN.",
      remediation: "Apply least-privilege Zero-Trust Extended ACLs between VLANs.",
    });
  }
  if (spof.unreachableDevices.length > 0) {
    perimeter -= 4;
    findings.push({
      id: "find-orphans",
      pillar: "perimeter",
      severity: "medium",
      title: `${spof.unreachableDevices.length} disconnected/unreachable device(s)`,
      detail: "Devices without an active path to the core cannot be managed or monitored.",
      remediation: "Connect isolated devices to access switches or restore disabled links.",
    });
  }
  perimeter = Math.max(0, perimeter);

  // 4. Capacity & Growth Headroom (25)
  let capacity = 25;
  const maxPorts = Math.max(1, switches.length) * 24;
  const portUtilization = switches.length > 0 ? endpoints.length / maxPorts : endpoints.length > 4 ? 1 : 0.3;
  if (switches.length === 0 && endpoints.length > 4) {
    capacity -= 14;
    findings.push({
      id: "find-no-switch",
      pillar: "capacity",
      severity: "high",
      title: "Endpoints lack a dedicated access switch",
      detail: "Multiple endpoints connect directly to the router/core without switching fabric.",
      remediation: "Add an enterprise 24/48-port access switch.",
    });
  } else if (portUtilization > 0.8) {
    capacity -= 10;
    findings.push({
      id: "find-port-density",
      pillar: "capacity",
      severity: "medium",
      title: "Switch port utilization exceeds 80%",
      detail: `${endpoints.length} endpoints occupy ${Math.round(portUtilization * 100)}% of 24-port switch capacity.`,
      remediation: "Add an additional access switch or upgrade to 48-port switches for 20%+ growth reserve.",
    });
  }
  capacity = Math.max(0, capacity);

  const pillars: AuditPillar[] = [
    {
      id: "redundancy",
      label: "Redundancy & SPOF",
      score: redundancy,
      maxScore: 25,
      status: statusFromPillar(redundancy, 25),
      detail: `${spof.criticalDevices.length} SPOF node(s), ${spof.criticalLinks.length} bridge link(s)`,
    },
    {
      id: "segmentation",
      label: "VLAN Segmentation",
      score: segmentation,
      maxScore: 25,
      status: statusFromPillar(segmentation, 25),
      detail: plan.vlanPlan.length ? `${plan.vlanPlan.length} isolated VLANs` : "Flat L2 network",
    },
    {
      id: "perimeter",
      label: "Perimeter & ACLs",
      score: perimeter,
      maxScore: 25,
      status: statusFromPillar(perimeter, 25),
      detail: `${hasFirewall ? "Firewall active" : "No firewall"} · ${acls.length} ACL rule(s)`,
    },
    {
      id: "capacity",
      label: "Capacity & Growth",
      score: capacity,
      maxScore: 25,
      status: statusFromPillar(capacity, 25),
      detail: `${endpoints.length} endpoint(s) across ${switches.length} switch(es)`,
    },
  ];

  const overallScore = pillars.reduce((sum, p) => sum + p.score, 0);
  const recommendedAcls = acls.length > 0 ? acls : generateZeroTrustAcls(plan);

  return {
    overallScore,
    grade: gradeFromScore(overallScore),
    pillars,
    findings,
    recommendedAcls,
  };
}

/**
 * One-click Auto-Remediation:
 * Adds missing perimeter firewall, adds redundant secondary router + uplinks to remove core SPOF,
 * enables VLAN segmentation, and installs Zero-Trust Inter-VLAN ACLs.
 */
export function autoRemediateTopology(
  topology: BuiltTopology,
  plan: NetworkPlan,
  existingAcls: AclRule[] = [],
): AutoRemediationResult {
  const devices: Device[] = topology.devices.map((d) => ({ ...d }));
  const connections: Connection[] = topology.connections.map((c) => ({ ...c }));
  const changesSummary: string[] = [];

  let nextEdge = connections.length + 1;
  const addLink = (from: string, to: string) => {
    if (from === to) return;
    const exists = connections.some(
      (c) => (c.from === from && c.to === to) || (c.from === to && c.to === from),
    );
    if (exists) return;
    const devA = devices.find((d) => d.id === from);
    const devB = devices.find((d) => d.id === to);
    const cableType = devA && devB ? cableFor(devA.type, devB.type) : "Straight-through";
    connections.push({ id: `e${nextEdge++}`, from, to, meta: { cableType } });
  };

  // 1. Ensure perimeter Firewall exists
  let fw = devices.find((d) => d.type === "FIREWALL");
  const primaryRouter = devices.find((d) => d.type === "ROUTER");
  const switches = devices.filter((d) => d.type === "SWITCH");
  if (!fw && devices.length > 1) {
    fw = { id: "FW1", label: "FW1", type: "FIREWALL" };
    devices.push(fw);
    if (primaryRouter) addLink(primaryRouter.id, fw.id);
    if (switches[0]) addLink(fw.id, switches[0].id);
    changesSummary.push("Inserted perimeter firewall (FW1) protecting the core edge.");
  }

  // 2. Add redundant secondary router if only 1 router exists
  const routers = devices.filter((d) => d.type === "ROUTER");
  if (routers.length === 1 && devices.length > 2) {
    const r2Id = devices.some((d) => d.id === "R2") ? `R${routers.length + 1}` : "R2";
    const r2: Device = { id: r2Id, label: r2Id, type: "ROUTER" };
    devices.push(r2);
    addLink(routers[0].id, r2.id);
    if (fw) addLink(r2.id, fw.id);
    else if (switches[0]) addLink(r2.id, switches[0].id);
    changesSummary.push(`Added redundant gateway router (${r2.id}) with HSRP/OSPF mesh uplink.`);
  }

  // 3. Rewire any disconnected devices to the first switch/firewall/router
  const linked = new Set<string>();
  connections.forEach((c) => {
    linked.add(c.from);
    linked.add(c.to);
  });
  const anchor = switches[0]?.id ?? fw?.id ?? routers[0]?.id;
  if (anchor) {
    for (const d of devices) {
      if (d.id !== anchor && !linked.has(d.id)) {
        addLink(anchor, d.id);
        changesSummary.push(`Connected orphaned device ${d.label} to ${anchor}.`);
      }
    }
  }

  // 4. Enable VLAN segmentation + OSPF if multi-router
  const nextTopology: BuiltTopology = {
    devices,
    connections,
    layout: computeLayout(devices, connections, "tree"),
  };
  const nextPlan = planNetwork(nextTopology, undefined, {
    vlan: true,
    routingProtocol: devices.filter((d) => d.type === "ROUTER").length > 1 ? "OSPF" : plan.routing.protocol,
  });
  if (plan.vlanPlan.length === 0 && nextPlan.vlanPlan.length > 0) {
    changesSummary.push(`Enabled role-based VLAN segmentation (${nextPlan.vlanPlan.length} VLANs).`);
  }

  // 5. Generate Zero-Trust Inter-VLAN ACLs
  const acls = existingAcls.length > 0 ? existingAcls : generateZeroTrustAcls(nextPlan);
  if (existingAcls.length === 0 && acls.length > 0) {
    changesSummary.push(`Generated ${acls.length} Zero-Trust Inter-VLAN ACL rules.`);
  }

  return {
    topology: nextTopology,
    plan: nextPlan,
    acls,
    changesSummary:
      changesSummary.length > 0 ? changesSummary : ["Topology already meets Zero-Trust baseline."],
  };
}
