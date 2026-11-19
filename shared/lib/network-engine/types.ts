// Core device roles the engine understands.
// NOTE: keep this in sync with prisma `enum DeviceType` and the zod
// `deviceTypeSchema` in lib/validators/schemas.ts.
export type DeviceType =
  | "ROUTER"
  | "SWITCH"
  | "SERVER"
  | "PC"
  | "FIREWALL"
  | "AP"
  | "PRINTER"
  | "CAMERA"
  | "NVR"
  | "IP_PHONE";

// Cable types shown on the diagram and used in the Cisco wiring guide.
export type CableType = "Straight-through" | "Crossover" | "Serial" | "Console" | "Fiber";

export interface Device {
  id: string;
  label: string;
  type: DeviceType;
  meta?: Record<string, unknown>;
}

export interface Connection {
  id: string;
  from: string;
  to: string;
  // meta.cableType holds the recommended cable for this link.
  meta?: { cableType?: CableType } & Record<string, unknown>;
}

export interface Subnet { name: string; cidr: string; mask: string; range: string; }
export interface VlanEntry { id: number; name: string; subnet: string; }

export interface NetworkPlan {
  ipPlan: { base: string; subnets: Subnet[] };
  vlanPlan: VlanEntry[];
  routing: { protocol: string; routes: string[] };
  notes?: string[];
}

export interface Topology { devices: Device[]; connections: Connection[]; }
export interface GeneratedProject extends BuiltTopology { network_plan: NetworkPlan; }

// --- AI engine intent types (Phase 5) ---
export interface IntentDevice { type: DeviceType; count: number; }

export interface ParsedIntent {
  devices: IntentDevice[];
  explicitConnections?: { from: string; to: string }[];
  options: { vlan: boolean; routingProtocol?: string };
}

export interface BuiltTopology extends Topology {
  layout?: Record<string, { x: number; y: number }>;
}

export type LayoutMode = "tree" | "radial" | "tiered";

export interface AclRule {
  id: string;
  name: string;
  action: "permit" | "deny";
  protocol: "ip" | "tcp" | "udp" | "icmp";
  sourceVlan: number | "any";
  destinationVlan: number | "any";
  port?: number;
  description: string;
}

export interface FaultState {
  disabledDevices: string[];
  disabledLinks: string[];
}

export interface PacketHop {
  step: number;
  deviceId: string;
  label: string;
  type: DeviceType;
  incomingLinkId?: string;
  layer: "L2" | "L3" | "FW";
  vlanTag?: number;
  ttl: number;
  srcIp: string;
  dstIp: string;
  action: "originate" | "forward" | "route" | "inspect" | "deliver" | "drop";
  reason: string;
  latencyMs: number;
}

export interface PacketTraceRequest {
  sourceId: string;
  destinationId: string;
  protocol: "ICMP" | "TCP" | "UDP";
  port?: number;
  faults?: FaultState;
  acls?: AclRule[];
}

export interface PacketTraceResult {
  reachable: boolean;
  verdict: "delivered" | "blocked-by-acl" | "unreachable" | "fault-dropped";
  summary: string;
  totalLatencyMs: number;
  hops: PacketHop[];
  traversedLinkIds: string[];
  blockedByRuleId?: string;
}

export interface SpofAnalysis {
  criticalDevices: string[];
  criticalLinks: string[];
  unreachableDevices: string[];
  affectedVlans: number[];
  connectedRatio: number;
  redundancyScore: number;
  suggestions: string[];
}

export interface ProjectRevision {
  number: number;
  createdAt: string;
  note: string;
  snapshot: {
    devices: Device[];
    connections: Connection[];
    layout?: Record<string, { x: number; y: number }>;
    network_plan: NetworkPlan;
    acls?: AclRule[];
  };
}
