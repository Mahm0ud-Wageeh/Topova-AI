export { ruleParse } from "@/lib/network-engine/parser/rule-parser";
export { buildTopology, cableFor, computeLayout } from "@/lib/network-engine/topology-builder";
export { allocateSubnets, prefixForHosts, maskFromPrefix, ipToInt, intToIp } from "@/lib/network-engine/ip-planner";
export { planVlans, VLAN_DEFS, TYPE_VLAN } from "@/lib/network-engine/vlan-planner";
export { suggestRouting } from "@/lib/network-engine/routing";
export { securityNotes } from "@/lib/network-engine/security";
export { planNetwork } from "@/lib/network-engine/planner";
export { assignAddressing, generateCiscoConfigs } from "@/lib/network-engine/cisco";
export { runPreflight, statusFromIssues, countStatus, buildPatch } from "@/lib/network-engine/preflight";
export { analyzeSpof, tracePacket } from "@/lib/network-engine/simulator";
export { simulateAttackPath } from "@/lib/network-engine/attack-sim";
export { forecastTraffic } from "@/lib/network-engine/traffic";
export { auditSecurityResilience, generateZeroTrustAcls, autoRemediateTopology } from "@/lib/network-engine/auditor";
export { estimateBomAndPoe } from "@/lib/network-engine/bom";
export { applyCopilotInstruction } from "@/lib/network-engine/copilot";
export { executeCliCommand } from "@/lib/network-engine/cli-emulator";
export { generateMultiVendorConfigs } from "@/lib/network-engine/multi-vendor";
export {
  assignDevicePorts,
  toStartupConfig,
  generateCiscoCmlYaml,
  generateGns3Project,
  generatePacketTracerBundle,
} from "@/lib/network-engine/cisco-formats";
export * from "@/lib/network-engine/or-optimizer";
export { verifyDesign, materializeArchitecture } from "@/lib/network-engine/or-verify";
export { lookupEngineeringSpec } from "@/lib/network-engine/knowledge-base";
export * from "@/lib/network-engine/types";
