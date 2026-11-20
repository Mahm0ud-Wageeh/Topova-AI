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
import {
  lookupEngineeringSpec,
  type SpecCategory,
} from "@/lib/network-engine/knowledge-base";
import {
  analyzeCapacity,
  designParetoFrontier,
  packVlsm,
  planSpofElimination,
  selectAccessSwitches,
  type ArchitectureKind,
} from "@/lib/network-engine/or-optimizer";
import {
  materializeArchitecture,
  verifyDesign,
  type VerificationReport,
} from "@/lib/network-engine/or-verify";
import { applyCopilotInstruction } from "@/lib/network-engine/copilot";
import { planNetwork } from "@/lib/network-engine/planner";
import { tracePacket } from "@/lib/network-engine/simulator";
import {
  buildTopology,
  cableFor,
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
import type {
  ChatExportCard,
  ExportCardKind,
  ThinkingStep,
} from "../../src/storage/types";
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
  exportCards?: ChatExportCard[];
  verification?: VerificationReport;
}

export const EXPORT_CARD_CATALOG: Record<ExportCardKind, ChatExportCard> = {
  "pt-guide": {
    id: "pt-guide",
    format: ".html",
    titleAr: "دليل بناء Cisco Packet Tracer التفاعلي",
    titleEn: "Cisco Packet Tracer Interactive Build Guide",
    descAr: "يفتح في المتصفح ويعرض موديلات الأجهزة، خريطة المنافذ والكابلات، وزر نسخ أوامر كل جهاز بضغطة واحدة",
    descEn: "Opens in browser with exact PT device models, port-to-port wiring, and 1-click CLI copy per device",
    recommended: true,
  },
  "cisco-cfg": {
    id: "cisco-cfg",
    format: ".cfg",
    titleAr: "ملف إعدادات Cisco IOS الجاهز (Startup Config)",
    titleEn: "Cisco IOS Startup Configuration (.cfg)",
    descAr: "ملف تشغيل نصي مباشر للتحميل داخل Packet Tracer عبر Config → Load أو اللصق في تبويب CLI",
    descEn: "Direct Cisco IOS config file — load via Device → Config → Load or paste into CLI",
    recommended: true,
  },
  "cabling-csv": {
    id: "cabling-csv",
    format: ".csv",
    titleAr: "جدول توصيل المنافذ والكابلات",
    titleEn: "Port-to-Port Cabling Matrix",
    descAr: "جدول Excel/CSV دقيق يوضح كل وصلة ومنفذ ونوع الكابل بين أجهزة الشبكة",
    descEn: "Exact spreadsheet of every interface, cable type, and device link",
  },
  "cml-yaml": {
    id: "cml-yaml",
    format: ".yaml",
    titleAr: "ملف مختبر Cisco Modeling Labs (CML)",
    titleEn: "Cisco Modeling Labs Topology (.yaml)",
    descAr: "يُستورد مباشرة في Cisco CML 2.x عبر Import Lab بكامل الأجهزة والروابط والإعدادات",
    descEn: "Direct import into Cisco CML 2.x with full nodes, links, coordinates & IOS configs",
  },
  "gns3-project": {
    id: "gns3-project",
    format: ".gns3",
    titleAr: "ملف مشروع GNS3 المباشر",
    titleEn: "GNS3 Native Project (.gns3)",
    descAr: "يُفتح مباشرة في GNS3 عبر File → Open Project مع جميع الوصلات والرموز الهندسية",
    descEn: "Opens directly in GNS3 via File → Open Project with pre-mapped interfaces",
  },
  "pdf-report": {
    id: "pdf-report",
    format: ".pdf",
    titleAr: "التقرير الهندسي التنفيذي PDF",
    titleEn: "Executive Engineering Report (.pdf)",
    descAr: "تقرير جاهز للطباعة والمناقشة يضم خطة العناوين، تقييم الأمان، وميزانية الأجهزة والطاقة",
    descEn: "Presentation-ready report with IP addressing, security score, and BOM/PoE budget",
  },
  "pt-pack": {
    id: "pt-pack",
    format: ".zip",
    titleAr: "الحزمة الشاملة لـ Packet Tracer (اختياري)",
    titleEn: "Complete Packet Tracer Bundle (.zip)",
    descAr: "تجمع كل ملفات .cfg لكل جهاز على حدة + الدليل التفاعلي + جدول الكابلات في ملف مضغوط واحد",
    descEn: "Bundles every per-device .cfg, interactive HTML guide, and cabling CSV together",
  },
};

export function selectExportCardsForTarget(target: string): ChatExportCard[] {
  const lower = target.toLowerCase();
  if (/(gns3)/.test(lower)) {
    return [EXPORT_CARD_CATALOG["gns3-project"], EXPORT_CARD_CATALOG["cisco-cfg"]];
  }
  if (/(cml|yaml)/.test(lower)) {
    return [EXPORT_CARD_CATALOG["cml-yaml"], EXPORT_CARD_CATALOG["cisco-cfg"]];
  }
  if (/(pdf|report|تقرير)/.test(lower)) {
    return [EXPORT_CARD_CATALOG["pdf-report"], EXPORT_CARD_CATALOG["cabling-csv"]];
  }
  if (/(csv|cabl|كابل|منافذ|wiring)/.test(lower)) {
    return [EXPORT_CARD_CATALOG["cabling-csv"], EXPORT_CARD_CATALOG["pt-guide"]];
  }
  if (/(cfg|cli|config|إعدادات|اعدادات|كونفيج|أوامر|اوامر)/.test(lower)) {
    return [EXPORT_CARD_CATALOG["cisco-cfg"], EXPORT_CARD_CATALOG["pt-guide"]];
  }
  // Default for Packet Tracer / .pkt / .ptk / general export
  return [
    EXPORT_CARD_CATALOG["pt-guide"],
    EXPORT_CARD_CATALOG["cisco-cfg"],
    EXPORT_CARD_CATALOG["cabling-csv"],
    EXPORT_CARD_CATALOG["cml-yaml"],
  ];
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
    prepare_file_export: [
      "تجهيز ملفات التصدير المباشرة",
      "Prepared direct deliverable files",
    ],
    optimize_architecture: [
      "حساب جبهة باريتو (التكلفة × التأخير × الاعتمادية)",
      "Computed Pareto frontier (cost x latency x resilience)",
    ],
    optimize_hardware: [
      "اختيار الأجهزة المثلى ضمن الميزانية",
      "Solved budget-constrained hardware selection",
    ],
    analyze_capacity_n1: [
      "تحليل السعة وفشل N-1 وطوابير M/M/1",
      "Analyzed max-flow, N-1 failover and M/M/1 queueing",
    ],
    eliminate_spofs: [
      "إزالة نقاط الفشل الأحادية بأقل تكلفة",
      "Minimum-cost SPOF elimination",
    ],
    pack_vlsm: [
      "حزم العناوين VLSM مع إثبات عدم التداخل",
      "Packed VLSM subnets with overlap-free proof",
    ],
    lookup_engineering_spec: [
      "الاستعلام من قاعدة المعرفة الهندسية الموثقة",
      "Queried verified engineering knowledge base",
    ],
    verify_design: [
      "التحقق الحتمي من التصميم",
      "Ran deterministic design verification",
    ],
  };
  return labels[name]?.[ar ? 0 : 1] ?? name;
}

function runCoreTool(
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

  if (name === "prepare_file_export") {
    if (!ctx.topology.devices.length) {
      return {
        ok: false,
        error: ar
          ? "لا يوجد تصميم شبكة نشط حالياً للتصدير. صمّم شبكة أولاً ثم اطلب تصدير الملفات."
          : "No active network topology to export yet. Design a network first, then request exports.",
      };
    }
    const target = String(args.target ?? "packet-tracer").trim();
    const cards = selectExportCardsForTarget(target);
    ctx.exportCards = cards;
    const summary = ar
      ? `تم تجهيز ${cards.length} ملفات مباشرة للتحميل (${cards.map((c) => c.format).join("، ")})`
      : `Prepared ${cards.length} direct downloadable files (${cards.map((c) => c.format).join(", ")})`;
    ctx.toolCalls.push({ name, args, summary, mutated: false });
    ctx.thinkingSteps.push({
      title: toolLabel(name, ar),
      detail: summary,
      status: "done",
    });
    return {
      ok: true,
      target,
      deviceCount: ctx.topology.devices.length,
      linkCount: ctx.topology.connections.length,
      files: cards.map((c) => ({
        id: c.id,
        format: c.format,
        title: ar ? c.titleAr : c.titleEn,
      })),
      packetTracerNote:
        "Cisco's binary .pkt format is proprietary/encrypted; direct Cisco IOS .cfg startup configs + interactive HTML Packet Tracer build guide + cabling CSV + direct CML .yaml / GNS3 .gns3 files are attached inline in the chat for 1-click download.",
    };
  }

  if (name === "optimize_architecture") {
    const n = (k: string, d = 0) =>
      Math.max(0, Math.min(5000, Math.floor(Number(args[k]) || d)));
    const req = {
      pcs: n("pcs"),
      servers: n("servers"),
      aps: n("aps"),
      cameras: n("cameras"),
      phones: n("phones"),
      printers: n("printers"),
      budgetUsd: Math.max(0, Number(args.budgetUsd) || 50_000),
      targetAvailability: Math.min(
        0.999999,
        Math.max(0.9, Number(args.targetAvailability) || 0.999),
      ),
      peakTrafficMbps:
        typeof args.peakTrafficMbps === "number" && args.peakTrafficMbps > 0
          ? args.peakTrafficMbps
          : undefined,
      vendors: (Array.isArray(args.vendors) ? args.vendors : []).filter(
        (v): v is "Cisco" | "Ubiquiti" | "MikroTik" | "Juniper" =>
          v === "Cisco" || v === "Ubiquiti" || v === "MikroTik" || v === "Juniper",
      ),
    };
    const result = designParetoFrontier(req);
    const kinds: ArchitectureKind[] = ["min-cost", "balanced", "max-resilience"];
    const table = kinds.flatMap((k) => {
      const c = result.picks[k];
      return c
        ? [
            {
              profile: k,
              costUsd: c.costUsd,
              latencyMs: c.latencyMs,
              availabilityPercent: Number((c.availability * 100).toFixed(5)),
              downtimeMinPerYear: c.downtimeMinPerYear,
              meetsSla: c.meetsSla,
              survivesN1: c.survivesN1,
              coreRouters: c.coreRouters,
              firewalls: c.firewalls,
              ispLinks: c.ispLinks,
              uplinkMbps: c.uplinkMbps,
              accessSwitches: c.accessSwitches,
            },
          ]
        : [];
    });
    let applied: string | undefined;
    const want = String(args.apply ?? "") as ArchitectureKind;
    const chosen = kinds.includes(want) ? result.picks[want] : undefined;
    if (chosen) {
      const ws = materializeArchitecture(chosen);
      ctx.topology = ws.topology;
      ctx.plan = ws.plan;
      ctx.acls = ws.acls;
      ctx.mutated = true;
      applied = want;
    }
    const summary = result.feasible
      ? `Pareto: ${result.frontier.length} non-dominated of ${result.candidatesEvaluated} candidates` +
        (applied ? `; applied ${applied}` : "")
      : (result.reason ?? "infeasible");
    record(ctx, name, args, summary, Boolean(applied), ar);
    return {
      ok: result.feasible,
      reason: result.reason,
      derived: result.derived,
      requirements: result.requirements,
      tradeOffTable: table,
      formulas: result.formulas,
      applied,
    };
  }

  if (name === "optimize_hardware") {
    const sel = selectAccessSwitches(
      {
        ports: Math.max(0, Math.floor(Number(args.ports) || 0)),
        poePorts: Math.max(0, Math.floor(Number(args.poePorts) || 0)),
        poeWatts: Math.max(0, Number(args.poeWatts) || 0),
        maxRackUnits:
          typeof args.maxRackUnits === "number" ? args.maxRackUnits : undefined,
      },
      {
        budgetUsd:
          typeof args.budgetUsd === "number" ? args.budgetUsd : undefined,
        objective:
          args.objective === "max-resilience" ? "max-resilience" : "min-cost",
      },
    );
    record(
      ctx,
      name,
      args,
      sel.feasible
        ? `${sel.items.map((i) => `${i.quantity}x ${i.sku}`).join(" + ")} = $${sel.totalCostUsd}${sel.provenOptimal ? " (proven optimal)" : ""}`
        : (sel.reason ?? "infeasible"),
      false,
      ar,
    );
    return { ...sel, ok: sel.feasible };
  }

  if (name === "analyze_capacity_n1") {
    if (!ctx.topology.devices.length)
      return { ok: false, error: "No active topology." };
    const cap = analyzeCapacity(ctx.topology);
    const top = cap.links
      .slice()
      .sort((a, b) => b.utilization - a.utilization)
      .slice(0, 8);
    record(
      ctx,
      name,
      args,
      `maxflow ${cap.maxFlowMbps}/${cap.totalDemandMbps} Mbps; N-1 failing ${cap.n1.failing.length}/${cap.n1.scenarios.length}; worst rho ${cap.worstUtilization}`,
      false,
      ar,
    );
    return {
      ok: true,
      totalDemandMbps: cap.totalDemandMbps,
      maxFlowMbps: cap.maxFlowMbps,
      feasible: cap.feasible,
      minCutCapacityMbps: cap.minCutCapacityMbps,
      bottleneckLinkIds: cap.bottleneckLinkIds,
      worstUtilization: cap.worstUtilization,
      kleinrockDelayMs: cap.kleinrockDelayMs,
      hottestLinks: top,
      n1SurvivesAll: cap.n1.survivesAll,
      n1Failing: cap.n1.failing.slice(0, 12),
      assumptions: cap.assumptions,
    };
  }

  if (name === "eliminate_spofs") {
    if (!ctx.topology.devices.length)
      return { ok: false, error: "No active topology." };
    const plan = planSpofElimination(ctx.topology);
    const apply = args.apply !== false;
    if (apply && plan.addedLinks.length) {
      const byId = new Map(ctx.topology.devices.map((d) => [d.id, d]));
      const stamp = Date.now().toString(36);
      ctx.topology = {
        ...ctx.topology,
        connections: [
          ...ctx.topology.connections,
          ...plan.addedLinks.map((l, i) => {
            const a = byId.get(l.from);
            const b = byId.get(l.to);
            return {
              id: `opt${stamp}${i}`,
              from: l.from,
              to: l.to,
              meta: {
                cableType: a && b ? cableFor(a.type, b.type) : ("Fiber" as const),
              },
            };
          }),
        ],
      };
      ctx.mutated = true;
    }
    record(
      ctx,
      name,
      args,
      `${plan.addedLinks.length} link(s), $${plan.totalCostUsd}; bridges ${plan.before.bridges.length} -> ${plan.after.bridges.length}`,
      apply && plan.addedLinks.length > 0,
      ar,
    );
    return {
      ok: true,
      applied: apply && plan.addedLinks.length > 0,
      addedLinks: plan.addedLinks,
      totalCostUsd: plan.totalCostUsd,
      lowerBoundLinks: plan.lowerBoundLinks,
      bridgesBefore: plan.before.bridges.length,
      bridgesAfter: plan.after.bridges.length,
      articulationPointsAfter: plan.after.articulationPoints,
      proof: plan.proof,
    };
  }

  if (name === "pack_vlsm") {
    const reqs = (Array.isArray(args.requirements) ? args.requirements : [])
      .map((r) => ({
        name: String((r as Record<string, unknown>)?.name ?? "").slice(0, 40),
        hosts: Math.max(
          1,
          Math.floor(Number((r as Record<string, unknown>)?.hosts) || 0),
        ),
      }))
      .filter((r) => r.name)
      .slice(0, 200);
    if (!reqs.length)
      return { ok: false, error: "Provide requirements: [{name, hosts}]." };
    try {
      const out = packVlsm(
        String(args.parent ?? "10.0.0.0/16"),
        reqs,
        typeof args.headroomPercent === "number" ? args.headroomPercent : 30,
      );
      record(
        ctx,
        name,
        args,
        `${out.allocations.length} subnets in ${out.parent}, overlap-free=${out.proof.overlapFree}, ${out.parentUtilizationPercent}% of parent`,
        false,
        ar,
      );
      return {
        ...out,
        ok: out.feasible,
        allocations: out.allocations.map((a) => ({
          name: a.name,
          cidr: a.cidr,
          mask: a.mask,
          usableHosts: a.usableHosts,
          requestedHosts: a.requestedHosts,
          utilizationPercent: a.utilizationPercent,
          range: `${a.firstUsable} - ${a.lastUsable}`,
        })),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Invalid input.",
      };
    }
  }

  if (name === "lookup_engineering_spec") {
    const cats = ["hardware", "poe", "cabling", "protocol", "addressing", "hardening"];
    const category = cats.includes(String(args.category))
      ? (String(args.category) as SpecCategory)
      : undefined;
    const res = lookupEngineeringSpec(String(args.query ?? ""), category, 4);
    record(
      ctx,
      name,
      args,
      `${res.matches.length} verified spec match(es) for "${res.query}"`,
      false,
      ar,
    );
    return { ok: true, ...res };
  }

  if (name === "verify_design") {
    const report = verifyDesign(ctx.topology, ctx.plan, ctx.acls, {
      faults: ctx.faults,
      budgetUsd: typeof args.budgetUsd === "number" ? args.budgetUsd : undefined,
    });
    ctx.verification = report;
    record(
      ctx,
      name,
      args,
      `${report.passed} pass / ${report.warned} warn / ${report.failed} fail`,
      false,
      ar,
    );
    return { ...report };
  }

  return { ok: false, error: `Unknown tool: ${name}` };
}

function record(
  ctx: MutableContext,
  name: string,
  args: Record<string, unknown>,
  summary: string,
  mutated: boolean,
  ar: boolean,
) {
  ctx.toolCalls.push({ name, args, summary, mutated });
  ctx.thinkingSteps.push({
    title: toolLabel(name, ar),
    detail: summary,
    status: "done",
  });
}

const MUTATING_TOOLS = new Set([
  "generate_topology",
  "modify_topology",
  "auto_remediate_network",
  "eliminate_spofs",
  "optimize_architecture",
]);

/**
 * Plan -> Optimize -> Verify -> Deliver: every tool that creates or changes a
 * topology is followed by the deterministic verification suite; failing checks
 * (with one-click remediations) are returned to the Agent.
 */
export function executeAgentTool(
  name: string,
  args: Record<string, unknown>,
  ctx: MutableContext,
  ar: boolean,
): Record<string, unknown> {
  const result = runCoreTool(name, args, ctx, ar);
  if (
    !MUTATING_TOOLS.has(name) ||
    result.ok === false ||
    !ctx.mutated ||
    !ctx.topology.devices.length
  ) {
    return result;
  }
  const report = verifyDesign(ctx.topology, ctx.plan, ctx.acls, {
    faults: ctx.faults,
  });
  ctx.verification = report;
  ctx.thinkingSteps.push({
    title: ar ? "التحقق الحتمي من التصميم" : "Verified design deterministically",
    detail: `${report.passed} pass / ${report.warned} warn / ${report.failed} fail`,
    status: "done",
  });
  return {
    ...result,
    verification: {
      ok: report.ok,
      passed: report.passed,
      warned: report.warned,
      failed: report.failed,
      issues: report.checks
        .filter((c) => c.status !== "pass")
        .map((c) => ({
          check: c.id,
          status: c.status,
          detail: c.detail,
          oneClickFix: c.remediation,
        })),
    },
  };
}
