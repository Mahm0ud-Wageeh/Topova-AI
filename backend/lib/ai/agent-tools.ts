import {
  simulateAttackPath,
  type AttackSimulationResult,
} from "@/lib/network-engine/attack-sim";
import {
  auditSecurityResilience,
  autoRemediateTopology,
  generateZeroTrustAcls,
  type SecurityAuditReport,
} from "@/lib/network-engine/auditor";
import {
  estimateBomAndPoe,
  type BomEstimateReport,
} from "@/lib/network-engine/bom";
import { executeCliCommand } from "@/lib/network-engine/cli-emulator";
import { applyCopilotInstruction } from "@/lib/network-engine/copilot";
import { planNetwork } from "@/lib/network-engine/planner";
import { tracePacket } from "@/lib/network-engine/simulator";
import {
  buildTopology,
  computeLayout,
} from "@/lib/network-engine/topology-builder";
import type {
  AclRule,
  BuiltTopology,
  DeviceType,
  FaultState,
  NetworkPlan,
  PacketTraceResult,
} from "@/lib/network-engine/types";
import type { ThinkingStep } from "../../src/storage/types";
import type { AgentToolExecution } from "./agent";

const VALID_DEVICE_TYPES = new Set<DeviceType>([
  "ROUTER",
  "SWITCH",
  "SERVER",
  "PC",
  "FIREWALL",
  "AP",
  "PRINTER",
  "CAMERA",
  "NVR",
  "IP_PHONE",
]);

const VALID_PROTOCOLS = new Set(["OSPF", "EIGRP", "RIP", "BGP", "STATIC"]);

function resolveDeviceId(
  topology: BuiltTopology,
  query: string,
): string | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = topology.devices.find(
    (d) => d.id.toLowerCase() === q || d.label.toLowerCase() === q,
  );
  if (exact) return exact.id;
  const partial = topology.devices.find(
    (d) => d.label.toLowerCase().includes(q) || d.type.toLowerCase() === q,
  );
  return partial?.id ?? null;
}

export interface MutableContext {
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls: AclRule[];
  faults: FaultState;
  mutated: boolean;
  toolCalls: AgentToolExecution[];
  thinkingSteps: ThinkingStep[];
  audit?: SecurityAuditReport;
  packetTrace?: PacketTraceResult;
  attack?: AttackSimulationResult;
  bom?: BomEstimateReport;
  cliOutput?: { deviceId: string; command: string; output: string };
}

function toolLabel(name: string, ar: boolean): string {
  const labels: Record<string, [string, string]> = {
    generate_topology: [
      "بناء المخطط المعماري الكامل",
      "Architected new topology",
    ],
    modify_topology: ["تعديل المخطط الحي تدريجياً", "Updated live topology"],
    run_security_audit: [
      "تنفيذ التدقيق الأمني الشامل",
      "Executed 4-pillar security audit",
    ],
    auto_remediate_network: [
      "تطبيق التأمين والإصلاح التلقائي",
      "Applied Zero-Trust remediation",
    ],
    trace_packet_flow: ["تتبع مسار الحزمة الشبكية", "Traced L2/L3 packet flow"],
    simulate_cyber_attack: [
      "محاكاة الهجوم والانتشار الجانبي",
      "Simulated Red-Team lateral movement",
    ],
    estimate_bom_and_poe: [
      "حساب التكلفة وميزانية طاقة PoE",
      "Calculated BOM & PoE power budget",
    ],
    run_device_cli: [
      "تنفيذ أمر سطر أوامر سيسكو",
      "Executed live Cisco IOS CLI",
    ],
  };
  return labels[name]?.[ar ? 0 : 1] ?? name;
}

export function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  ctx: MutableContext,
  ar: boolean,
): Record<string, unknown> {
  if (name === "generate_topology") {
    const rawDevices = Array.isArray(args.devices) ? args.devices : [];
    const counts = new Map<DeviceType, number>();
    let budget = 120;
    for (const item of rawDevices) {
      if (budget <= 0) break;
      const t = String(
        (item as Record<string, unknown>)?.type ?? "",
      ).toUpperCase() as DeviceType;
      if (!VALID_DEVICE_TYPES.has(t)) continue;
      const n = Math.max(
        1,
        Math.min(
          budget,
          Math.floor(Number((item as Record<string, unknown>)?.count) || 1),
        ),
      );
      counts.set(t, (counts.get(t) ?? 0) + n);
      budget -= n;
    }
    if (counts.size === 0) {
      counts.set("ROUTER", 1);
      counts.set("SWITCH", 1);
      counts.set("PC", 4);
    }
    const vlan = args.vlan !== false;
    const rawProto = String(args.routingProtocol ?? "OSPF").toUpperCase();
    const routingProtocol = VALID_PROTOCOLS.has(rawProto) ? rawProto : "OSPF";
    const layoutMode =
      args.layoutMode === "radial" || args.layoutMode === "tiered"
        ? args.layoutMode
        : "tree";

    const built = buildTopology({
      devices: [...counts.entries()].map(([type, count]) => ({ type, count })),
      options: { vlan, routingProtocol },
    });
    built.layout = computeLayout(built.devices, built.connections, layoutMode);
    const plan = planNetwork(built, undefined, { vlan, routingProtocol });
    const acls = vlan ? generateZeroTrustAcls(plan) : [];

    ctx.topology = built;
    ctx.plan = plan;
    ctx.acls = acls;
    ctx.mutated = true;
    const audit = auditSecurityResilience(built, plan, acls, ctx.faults);
    ctx.audit = audit;

    const summary = `Built ${built.devices.length} devices, ${built.connections.length} links, ${plan.vlanPlan.length} VLANs (${routingProtocol}), score ${audit.overallScore}/100`;
    ctx.toolCalls.push({ name, args, summary, mutated: true });
    ctx.thinkingSteps.push({
      title: toolLabel(name, ar),
      detail: summary,
      status: "done",
    });
    return {
      ok: true,
      deviceCount: built.devices.length,
      linkCount: built.connections.length,
      vlans: plan.vlanPlan,
      routingProtocol: plan.routing.protocol,
      aclCount: acls.length,
      securityScore: audit.overallScore,
      grade: audit.grade,
      devices: built.devices.map((d) => `${d.id}(${d.type})`),
    };
  }

  if (name === "modify_topology") {
    const instruction = String(args.instruction ?? "").trim();
    const proposal = applyCopilotInstruction(
      { topology: ctx.topology, plan: ctx.plan, acls: ctx.acls },
      instruction,
    );
    if (proposal.actions.length === 0)
      return {
        ok: false,
        summary: proposal.summary,
        securityScore: auditSecurityResilience(ctx.topology, ctx.plan, ctx.acls)
          .overallScore,
        grade: "unchanged",
      };
    ctx.topology = proposal.nextState.topology;
    ctx.plan = proposal.nextState.plan;
    ctx.acls = proposal.nextState.acls;
    ctx.mutated = true;
    const audit = auditSecurityResilience(
      ctx.topology,
      ctx.plan,
      ctx.acls,
      ctx.faults,
    );
    ctx.audit = audit;

    const summary = `${proposal.summary} (Score ${audit.overallScore}/100)`;
    ctx.toolCalls.push({ name, args, summary, mutated: true });
    ctx.thinkingSteps.push({
      title: toolLabel(name, ar),
      detail: summary,
      status: "done",
    });
    return {
      ok: true,
      summary: proposal.summary,
      addedDevices: proposal.diff.addedDevices,
      removedDevices: proposal.diff.removedDevices,
      routingChange: proposal.diff.routingChange,
      vlanChange: proposal.diff.vlanChange,
      securityScore: audit.overallScore,
      grade: audit.grade,
    };
  }

  if (name === "run_security_audit") {
    const audit = auditSecurityResilience(
      ctx.topology,
      ctx.plan,
      ctx.acls,
      ctx.faults,
    );
    ctx.audit = audit;
    const summary = `Security Score ${audit.overallScore}/100 (Grade ${audit.grade}) — ${audit.findings.length} findings`;
    ctx.toolCalls.push({ name, args, summary, mutated: false });
    ctx.thinkingSteps.push({
      title: toolLabel(name, ar),
      detail: summary,
      status: "done",
    });
    return {
      ok: true,
      overallScore: audit.overallScore,
      grade: audit.grade,
      pillars: audit.pillars,
      findings: audit.findings,
    };
  }

  if (name === "auto_remediate_network") {
    const before = auditSecurityResilience(
      ctx.topology,
      ctx.plan,
      ctx.acls,
      ctx.faults,
    );
    const fixed = autoRemediateTopology(ctx.topology, ctx.plan, ctx.acls);
    ctx.topology = fixed.topology;
    ctx.plan = fixed.plan;
    ctx.acls = fixed.acls;
    ctx.mutated = true;
    const after = auditSecurityResilience(
      ctx.topology,
      ctx.plan,
      ctx.acls,
      ctx.faults,
    );
    ctx.audit = after;

    const summary = `Hardened network: ${before.overallScore} -> ${after.overallScore}/100 (${after.grade})`;
    ctx.toolCalls.push({ name, args, summary, mutated: true });
    ctx.thinkingSteps.push({
      title: toolLabel(name, ar),
      detail: summary,
      status: "done",
    });
    return {
      ok: true,
      beforeScore: before.overallScore,
      afterScore: after.overallScore,
      grade: after.grade,
      changes: fixed.changesSummary,
      aclCount: ctx.acls.length,
    };
  }

  if (name === "trace_packet_flow") {
    const srcId = resolveDeviceId(
      ctx.topology,
      String(args.sourceDevice ?? ""),
    );
    const dstId = resolveDeviceId(
      ctx.topology,
      String(args.destinationDevice ?? ""),
    );
    if (!srcId || !dstId) {
      const errMsg = `Device not found. Available: ${ctx.topology.devices.map((d) => d.id).join(", ")}`;
      ctx.toolCalls.push({ name, args, summary: errMsg, mutated: false });
      return { ok: false, error: errMsg };
    }
    const protocol =
      args.protocol === "TCP" || args.protocol === "UDP"
        ? args.protocol
        : ("ICMP" as const);
    const port = typeof args.port === "number" ? args.port : undefined;
    const trace = tracePacket(ctx.topology, ctx.plan, {
      sourceId: srcId,
      destinationId: dstId,
      protocol,
      port,
      faults: ctx.faults,
      acls: ctx.acls,
    });
    ctx.packetTrace = trace;
    const summary = `${srcId} -> ${dstId} (${protocol}${port ? `:${port}` : ""}): ${trace.reachable ? `DELIVERED (${trace.totalLatencyMs}ms)` : `${trace.verdict.toUpperCase()} (${trace.summary})`}`;
    ctx.toolCalls.push({ name, args, summary, mutated: false });
    ctx.thinkingSteps.push({
      title: toolLabel(name, ar),
      detail: summary,
      status: "done",
    });
    return {
      ok: true,
      reachable: trace.reachable,
      verdict: trace.verdict,
      summary: trace.summary,
      totalLatencyMs: trace.totalLatencyMs,
      hops: trace.hops.map((h) => `${h.label}:${h.action}(${h.reason})`),
    };
  }

  if (name === "simulate_cyber_attack") {
    const entryId =
      resolveDeviceId(ctx.topology, String(args.entryDevice ?? "")) ??
      ctx.topology.devices.find(
        (d) => d.type === "CAMERA" || d.type === "PC" || d.type === "AP",
      )?.id ??
      ctx.topology.devices[0]?.id;
    if (!entryId) return { ok: false, error: "Topology has no devices." };
    const attack = simulateAttackPath(
      ctx.topology,
      ctx.plan,
      entryId,
      ctx.acls,
      ctx.faults,
    );
    ctx.attack = attack;
    const riskLevel = attack.contained
      ? "CONTAINED"
      : attack.blastRadiusPercent >= 50
        ? "CRITICAL"
        : "ELEVATED";
    const summary = `Red-Team from ${entryId}: ${attack.blastRadiusPercent}% blast radius (${attack.compromisedDevices.length} nodes, ${riskLevel})`;
    ctx.toolCalls.push({ name, args, summary, mutated: false });
    ctx.thinkingSteps.push({
      title: toolLabel(name, ar),
      detail: summary,
      status: "done",
    });
    return {
      ok: true,
      entryDeviceId: attack.entryDeviceId,
      blastRadiusPercent: attack.blastRadiusPercent,
      contained: attack.contained,
      riskLevel,
      compromisedDevices: attack.compromisedDevices,
      exposedCriticalAssets: attack.exposedCriticalAssets,
      recommendation: attack.recommendation,
    };
  }

  if (name === "estimate_bom_and_poe") {
    const bom = estimateBomAndPoe(ctx.topology, ctx.plan);
    ctx.bom = bom;
    const ent = bom.tiers.find((t) => t.id === "enterprise") ?? bom.tiers[0];
    const summary = `PoE ${bom.poe.requiredWatts}W/${bom.poe.availableWatts}W (${bom.poe.utilizationPercent}%) · Enterprise $${ent?.totalUsd.toLocaleString() ?? "0"}`;
    ctx.toolCalls.push({ name, args, summary, mutated: false });
    ctx.thinkingSteps.push({
      title: toolLabel(name, ar),
      detail: summary,
      status: "done",
    });
    return {
      ok: true,
      poe: bom.poe,
      rackUnitsRequired: ent?.rackUnits ?? 0,
      tiers: bom.tiers.map((t) => ({
        tier: t.id,
        label: t.label,
        totalUsd: t.totalUsd,
        rackUnits: t.rackUnits,
      })),
    };
  }

  if (name === "run_device_cli") {
    const devId =
      resolveDeviceId(ctx.topology, String(args.device ?? "")) ??
      ctx.topology.devices.find(
        (d) => d.type === "ROUTER" || d.type === "SWITCH",
      )?.id ??
      ctx.topology.devices[0]?.id;
    const command = String(args.command ?? "show ip interface brief").trim();
    if (!devId) return { ok: false, error: "No devices available." };
    const result = executeCliCommand(
      {
        topology: ctx.topology,
        plan: ctx.plan,
        acls: ctx.acls,
        faults: ctx.faults,
      },
      devId,
      command,
    );
    ctx.cliOutput = { deviceId: devId, command, output: result.output };
    const summary = `${devId}# ${command}`;
    ctx.toolCalls.push({ name, args, summary, mutated: false });
    ctx.thinkingSteps.push({
      title: toolLabel(name, ar),
      detail: summary,
      status: "done",
    });
    return { ok: true, deviceId: devId, command, output: result.output };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}
