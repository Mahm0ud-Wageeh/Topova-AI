import { ruleParse } from "@/lib/network-engine/parser/rule-parser";
import { type AttackSimulationResult } from "@/lib/network-engine/attack-sim";
import {
  auditSecurityResilience,
  generateZeroTrustAcls,
  type SecurityAuditReport,
} from "@/lib/network-engine/auditor";
import { type BomEstimateReport } from "@/lib/network-engine/bom";
import { assignAddressing } from "@/lib/network-engine/cisco";
import { planNetwork } from "@/lib/network-engine/planner";
import type {
  AclRule,
  BuiltTopology,
  FaultState,
  NetworkPlan,
  PacketTraceResult,
} from "@/lib/network-engine/types";
import { GoogleGenAI } from "@google/genai";
import type {
  AgentWorkMode,
  ChatAttachment,
  ClarifyingQuestion,
  StoredProfile,
  ThinkingStep,
} from "../../src/storage/types";
import { executeAgentTool, type MutableContext } from "./agent-tools";
import { localAttachmentContext } from "./local-attachments";
import { DEFAULT_GEMINI_MODEL, FAST_GEMINI_MODEL } from "./providers";

export interface AgentChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentToolExecution {
  name: string;
  args: Record<string, unknown>;
  summary: string;
  mutated: boolean;
}

export interface AgentNetworkState {
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls: AclRule[];
  faults?: FaultState;
}

export interface AgentChatRequest {
  message: string;
  history?: AgentChatMessage[];
  state?: AgentNetworkState;
  mode?: AgentWorkMode;
  lang?: "ar" | "en" | "auto";
  attachments?: ChatAttachment[];
  profile?: StoredProfile;
}

export interface AgentChatResponse {
  reply: string;
  executionMode?: "local" | "external";
  engineLabel: string;
  mode: AgentWorkMode;
  thinkingSteps: ThinkingStep[];
  toolCalls: AgentToolExecution[];
  followUpSuggestions: string[];
  clarifyingQuestions?: ClarifyingQuestion[];
  mutated: boolean;
  nextState?: {
    topology: BuiltTopology;
    plan: NetworkPlan;
    acls: AclRule[];
  };
  audit?: SecurityAuditReport;
  packetTrace?: PacketTraceResult;
  attack?: AttackSimulationResult;
  bom?: BomEstimateReport;
  cliOutput?: { deviceId: string; command: string; output: string };
}

export const AGENT_WORK_MODES: {
  id: AgentWorkMode;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
}[] = [
  {
    id: "auto",
    labelAr: "الوكيل الذكي التلقائي",
    labelEn: "Auto Agent",
    descAr: "حوار شامل + تنفيذ تلقائي لأدوات التصميم والمحاكاة",
    descEn: "Full conversation + automatic design & simulation execution",
  },
  {
    id: "architect",
    labelAr: "مهندس معماري عميق",
    labelEn: "Deep Architect",
    descAr: "تحليل عميق، أسئلة توضيحية ذكية، وبناء شبكات عالية الاعتمادية",
    descEn: "Deep analysis, clarifying questions & HA architecture design",
  },
  {
    id: "security",
    labelAr: "فاحص أمان واختراق",
    labelEn: "Security & Red-Team",
    descAr: "تركيز على الثغرات، محاكاة الهجمات، وتطبيق العزل الصفري",
    descEn: "Vulnerability audits, attack simulation & Zero-Trust hardening",
  },
  {
    id: "executive",
    labelAr: "ملخص تنفيذي سريع",
    labelEn: "Executive Brief",
    descAr: "إجابات مركزة مع جداول مقارنة وتقديرات تكلفة جاهزة للعرض",
    descEn:
      "Concise tables, BOM cost breakdowns & presentation-ready summaries",
  },
];

const AGENT_TOOLS = [
  {
    type: "function" as const,
    name: "generate_topology",
    description:
      "Build a completely new network topology from scratch with specified devices, VLAN segmentation, and routing protocol. Use ONLY when the user asks to design/build/create a network topology.",
    parameters: {
      type: "object",
      properties: {
        devices: {
          type: "array",
          description:
            "Exact list of device types and counts to include in the new topology.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
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
                ],
              },
              count: { type: "integer", minimum: 1, maximum: 60 },
            },
            required: ["type", "count"],
          },
        },
        vlan: {
          type: "boolean",
          description: "Enable VLAN segmentation & Zero-Trust ACLs.",
        },
        routingProtocol: {
          type: "string",
          enum: ["OSPF", "EIGRP", "RIP", "BGP", "STATIC"],
          description: "Layer-3 routing protocol.",
        },
        layoutMode: {
          type: "string",
          enum: ["tree", "tiered", "radial"],
          description: "Visual topology layout style.",
        },
      },
      required: ["devices"],
    },
  },
  {
    type: "function" as const,
    name: "modify_topology",
    description:
      "Modify the EXISTING live topology incrementally (add/remove devices, enable VLANs, add firewall/redundancy, switch routing protocol) without rebuilding from scratch.",
    parameters: {
      type: "object",
      properties: {
        instruction: {
          type: "string",
          description:
            "Clear modification command, e.g. 'add 4 cameras and 1 NVR', 'add firewall', 'add redundant router', 'enable vlan', 'switch to OSPF', 'remove 2 PCs'.",
        },
      },
      required: ["instruction"],
    },
  },
  {
    type: "function" as const,
    name: "run_security_audit",
    description:
      "Run the deterministic 0-100 4-pillar Security & Resilience Auditor on the active topology.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "auto_remediate_network",
    description:
      "Automatically harden and fix the active topology: eliminates SPOFs, adds firewall if missing, enables VLAN segmentation, and deploys Zero-Trust ACLs.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "trace_packet_flow",
    description:
      "Trace a live L2/L3 packet hop-by-hop between two devices in the active topology.",
    parameters: {
      type: "object",
      properties: {
        sourceDevice: {
          type: "string",
          description: "Source device ID or label (e.g. PC1, CAM1).",
        },
        destinationDevice: {
          type: "string",
          description: "Destination device ID or label (e.g. SRV1, R1).",
        },
        protocol: {
          type: "string",
          enum: ["ICMP", "TCP", "UDP"],
          description: "Packet protocol.",
        },
        port: {
          type: "integer",
          description: "Destination TCP/UDP port (e.g. 443, 22, 80, 53).",
        },
      },
      required: ["sourceDevice", "destinationDevice"],
    },
  },
  {
    type: "function" as const,
    name: "simulate_cyber_attack",
    description:
      "Run a Red-Team cyber attack lateral movement simulation from a compromised entry device.",
    parameters: {
      type: "object",
      properties: {
        entryDevice: {
          type: "string",
          description:
            "Compromised entry device ID or label (e.g. CAM1, PC1, AP1).",
        },
      },
      required: ["entryDevice"],
    },
  },
  {
    type: "function" as const,
    name: "estimate_bom_and_poe",
    description:
      "Calculate hardware Bill of Materials (BOM), PoE+ power wattage budget, rack space, and 3-tier cost comparison.",
    parameters: { type: "object", properties: {} },
  },
  {
    type: "function" as const,
    name: "run_device_cli",
    description:
      "Execute a real Cisco IOS CLI command on a device in the active topology (e.g. 'show ip interface brief', 'show vlan brief', 'show ip route', 'show access-lists', 'ping 10.0.10.2').",
    parameters: {
      type: "object",
      properties: {
        device: {
          type: "string",
          description: "Target device ID or label (e.g. R1, SW1, FW1).",
        },
        command: {
          type: "string",
          description: "Cisco IOS command to execute.",
        },
      },
      required: ["device", "command"],
    },
  },
];

function buildSystemInstruction(
  mode: AgentWorkMode,
  profile?: StoredProfile,
): string {
  const modeGuidance: Record<AgentWorkMode, string> = {
    auto: "Mode: AUTO AGENT — Handle any general, technical, or network engineering conversation smoothly. Call tools whenever the user wants to build, modify, audit, harden, trace, Red-Team, price, or run CLI on a network.",
    architect:
      "Mode: DEEP ARCHITECT — Think like a Principal CCIE Network Architect. Provide deep trade-off analysis, high-availability design, VLAN/IPv4 rigor, and when a design brief is broad or missing scale/redundancy/budget details, include 1–2 concise clarifyingQuestions in <nettopo_meta> so the user can refine in one click.",
    security:
      "Mode: SECURITY & RED-TEAM — Think like an offensive/defensive network security lead. Proactively audit vulnerabilities, check Zero-Trust ACLs, simulate lateral movement, and recommend concrete hardening steps.",
    executive:
      "Mode: EXECUTIVE BRIEF — Keep responses sharp, scannable, and executive-ready using concise bullet points, KPI metrics, and clean markdown tables.",
  };

  const personalizationParts: string[] = [];
  if (profile) {
    if (profile.displayName)
      personalizationParts.push(`Engineer Name: ${profile.displayName}`);
    if (profile.roleTitle)
      personalizationParts.push(`Role: ${profile.roleTitle}`);
    if (profile.organization)
      personalizationParts.push(`Organization: ${profile.organization}`);
    if (profile.customInstructions) {
      personalizationParts.push(
        `Custom Instructions from Engineer:\n${profile.customInstructions}`,
      );
    }
    if (profile.memoryNotes.length > 0) {
      personalizationParts.push(
        `Saved Engineering Preferences/Memory:\n- ${profile.memoryNotes.join("\n- ")}`,
      );
    }
    personalizationParts.push(
      `Defaults: Routing=${profile.preferences.defaultRouting}, Auto-VLAN=${profile.preferences.autoVlan}`,
    );
  }

  return `You are **Topova AI** — a world-class autonomous AI assistant and Principal Network Engineering Agent built directly into the Topova AI Platform.

IDENTITY & CONFIDENTIALITY RULES (CRITICAL):
- You are exclusively **Topova AI**.
- NEVER mention Google, Gemini, OpenAI, Anthropic, Claude, Groq, or any third-party AI provider, external API, or underlying model ID. If asked what model or API you are, answer naturally that you are Topova AI's built-in intelligent engineering core.

CAPABILITIES:
- You can converse naturally and brilliantly about ANY topic: general questions, computer networking (CCNA/CCNP/CCIE), cybersecurity, software engineering, graduation project documentation, troubleshooting, or career advice.
- You also possess 8 live deterministic network engineering tools (topology generation, incremental editing, 0-100 security audit, auto-remediation, packet tracing, Red-Team attack simulation, BOM/PoE estimation, and live Cisco IOS CLI).
- Use tools whenever the user asks to design, build, change, audit, fix, simulate, price, or inspect a network. Do NOT call topology tools for purely conceptual questions or casual greetings.
- Changes to an existing network are proposed candidate changes, not applied changes. Describe them as proposals pending user review. New designs appear in the canvas; export readiness is checked separately before export.
- Always reply in the SAME language the user writes in (fluent Arabic for Arabic prompts, crisp English for English prompts).

${modeGuidance[mode]}
${personalizationParts.length > 0 ? `\nENGINEER PROFILE CONTEXT:\n${personalizationParts.join("\n")}\n` : ""}
INTERACTIVE METADATA BLOCK (ALWAYS APPEND AT THE VERY END OF YOUR RESPONSE):
After your final markdown answer, append a single hidden JSON block wrapped in <nettopo_meta>...</nettopo_meta> containing:
1. "followUps": an array of 3 concise, high-value follow-up questions/prompts in the SAME language as the user that the user can click next.
2. "clarifyingQuestions": OPTIONAL array (0 to 2 items) ONLY when the user's request is broad/open-ended and asking quick multiple-choice questions would help refine their network or task. Each item: {"question":"...","options":["...","...","..."]}.
Example:
<nettopo_meta>{"followUps":["افحص أمان الشبكة وأصلح الثغرات","احسب ميزانية طاقة PoE والتكلفة","صدّر ملفات سيسكو باكت تريسر"],"clarifyingQuestions":[]}</nettopo_meta>`;
}

export function createDefaultAgentState(): AgentNetworkState {
  const topology: BuiltTopology = { devices: [], connections: [], layout: {} };
  return {
    topology,
    plan: planNetwork(topology),
    acls: [],
    faults: { disabledDevices: [], disabledLinks: [] },
  };
}

function buildLiveContextSnapshot(state?: AgentNetworkState): string {
  if (!state || !state.topology?.devices?.length) {
    return "=== ACTIVE WORKSPACE ===\nNo topology loaded yet in this chat. Call generate_topology if the user asks to build one.\n========================";
  }
  const addr = assignAddressing(state.topology, state.plan);
  const audit = auditSecurityResilience(
    state.topology,
    state.plan,
    state.acls,
    state.faults,
  );
  const devicesBrief = state.topology.devices.slice(0, 40).map((d) => {
    const a = addr.byDevice[d.id];
    const ip = a?.interfaces[0]?.ip ?? "unassigned";
    const vlan = a?.vlanId ? `VLAN${a.vlanId}` : "flat";
    return `${d.id}(${d.type}, ${ip}, ${vlan})`;
  });
  const suffix =
    state.topology.devices.length > 40
      ? ` ... +${state.topology.devices.length - 40} more`
      : "";
  return [
    "=== ACTIVE TOPOLOGY SNAPSHOT ===",
    `Devices (${state.topology.devices.length}): ${devicesBrief.join(", ")}${suffix}`,
    `Links: ${state.topology.connections.length} | Routing: ${state.plan.routing.protocol} | VLANs: ${state.plan.vlanPlan.map((v) => `${v.id}:${v.name}(${v.subnet})`).join(", ") || "None (Flat LAN)"}`,
    `Zero-Trust ACL Rules: ${state.acls.length} | Security Score: ${audit.overallScore}/100 (Grade ${audit.grade})`,
    `Active Faults: ${state.faults?.disabledDevices?.length ?? 0} devices down, ${state.faults?.disabledLinks?.length ?? 0} links cut`,
    "================================",
  ].join("\n");
}

function isArabicText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

function parseMetaBlock(raw: string): {
  cleanReply: string;
  followUps: string[];
  clarifyingQuestions: ClarifyingQuestion[];
} {
  const match = raw.match(/<nettopo_meta>\s*([\s\S]*?)\s*<\/nettopo_meta>/i);
  if (!match) {
    return { cleanReply: raw.trim(), followUps: [], clarifyingQuestions: [] };
  }
  const cleanReply = raw.replace(match[0], "").trim();
  try {
    const parsed = JSON.parse(match[1]) as {
      followUps?: unknown;
      clarifyingQuestions?: unknown;
    };
    const followUps = Array.isArray(parsed.followUps)
      ? parsed.followUps
          .filter(
            (x): x is string => typeof x === "string" && x.trim().length > 0,
          )
          .slice(0, 4)
      : [];
    const clarifyingQuestions = Array.isArray(parsed.clarifyingQuestions)
      ? parsed.clarifyingQuestions
          .filter(
            (q): q is ClarifyingQuestion =>
              typeof (q as ClarifyingQuestion)?.question === "string" &&
              Array.isArray((q as ClarifyingQuestion)?.options) &&
              (q as ClarifyingQuestion).options.length >= 2,
          )
          .slice(0, 2)
      : [];
    return { cleanReply, followUps, clarifyingQuestions };
  } catch {
    return { cleanReply, followUps: [], clarifyingQuestions: [] };
  }
}

function buildSmartFollowUps(ar: boolean, ctx: MutableContext): string[] {
  if (ctx.mutated) {
    return ar
      ? [
          "افحص أمان الشبكة الجديدة وأصلح أي نقطة ضعف تلقائياً",
          "احسب التكلفة الكلية وميزانية طاقة PoE لهذه الشبكة",
          "حاكي هجوم اختراق جانبي للتأكد من قوة العزل",
        ]
      : [
          "Audit this topology and auto-remediate any weaknesses",
          "Estimate full BOM cost and PoE wattage budget",
          "Run a Red-Team attack simulation to verify Zero-Trust isolation",
        ];
  }
  if (ctx.audit) {
    return ar
      ? [
          "أصلح كل الملاحظات الأمنية تلقائياً وارفع التقييم",
          "أضف راوتر احتياطي للتخلص من نقاط الفشل الوحيدة",
          "نفّذ أمر show access-lists على الراوتر الرئيسي",
        ]
      : [
          "Auto-remediate all security findings now",
          "Add a redundant core router to eliminate SPOFs",
          "Run 'show access-lists' on the gateway router",
        ];
  }
  return ar
    ? [
        "صمّم لي شبكة شركة متكاملة بـ VLANs و OSPF وجدار حماية",
        "افحص أمان الشبكة الحالية وأعطني تقريراً تفصيلياً",
        "ساعدني في تخطيط مشروع تخرج شبكات احترافي خطوة بخطوة",
      ]
    : [
        "Design an enterprise campus network with VLANs, OSPF & Firewall",
        "Audit the current network security score & findings",
        "Trace a live TCP/443 packet from PC1 to SRV1",
      ];
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function runLocalFallbackAgent(
  message: string,
  ctx: MutableContext,
  mode: AgentWorkMode,
): AgentChatResponse {
  const lower = message.toLowerCase().trim();
  const ar = isArabicText(message);

  ctx.thinkingSteps.unshift({
    title: ar
      ? "تحليل الطلب وسياق الشبكة النشطة"
      : "Analyzed request & live topology context",
    detail: ar
      ? `تم فهم الرسالة وتجهيز الاستجابة الفورية (${ctx.topology.devices.length} أجهزة في اللوحة)`
      : `Analyzed message with live workspace context (${ctx.topology.devices.length} devices)`,
    status: "done",
  });

  // Handle greetings & casual openers gracefully without touching topology
  if (
    /^(hi|hello|hey|yo|sup|good morning|good evening|thanks|thank you|ok|okay|مرحبا|مرحباً|أهلا|أهلاً|اهلا|السلام عليكم|ازيك|إزيك|عامل ايه|عامل إيه|صباح الخير|مساء الخير|شكرا|شكراً|تمام)[!؟?.\s]*$/i.test(
      lower,
    )
  ) {
    return {
      reply: ar
        ? "أهلاً بك يا هندسة! أنا **Topova AI** — مساعدك الذكي المتخصص في هندسة الشبكات.\n\nأخبرني بما تريد إنجازه الآن: هل نبدأ بتصميم شبكة جديدة من الصفر، أم فحص وتأمين الشبكة الحالية، أم الإجابة على سؤال تقني في الشبكات؟"
        : "Hello! I'm **Topova AI** — your autonomous Network Engineering Assistant.\n\nTell me what you'd like to do: design a new network from scratch, audit & harden an existing topology, run Cisco CLI checks, or discuss any networking concept!",
      engineLabel: "Topova Intelligence",
      mode,
      thinkingSteps: ctx.thinkingSteps,
      toolCalls: [],
      followUpSuggestions: ar
        ? [
            "صمّم لي شبكة شركة متكاملة بـ 2 راوتر وجدار حماية و OSPF",
            "افحص أمان الشبكة الحالية وأصلح كل الثغرات تلقائياً",
            "اسألني أسئلة سريعة لتخطيط شبكة مشروع تخرج كامل",
          ]
        : [
            "Design an enterprise campus with 2 routers, firewall & OSPF",
            "Audit current network security & auto-remediate",
            "Ask me clarifying questions to plan a custom network",
          ],
      mutated: false,
    };
  }

  const isDesign =
    /(?:design|build|create|architect|صم[ّم]|صمم|انشئ|أنشئ|ابني|بناء شبكة)/i.test(
      message,
    );
  const intent = ruleParse(message);
  if (isDesign && intent.devices.length) {
    const result = executeAgentTool(
      "generate_topology",
      {
        devices: intent.devices,
        vlan: intent.options?.vlan,
        routingProtocol: intent.options?.routingProtocol ?? "STATIC",
      },
      ctx,
      ar,
    );
    return {
      reply: ar
        ? `تم إعداد تصميم من ${result.deviceCount} أجهزة و${result.linkCount} وصلات. راجع المخطط وفحص التصدير قبل استخدام الإعدادات.`
        : `Prepared a design with ${result.deviceCount} devices and ${result.linkCount} links. Review the canvas and export checks before using the configurations.`,
      engineLabel: "Topova Intelligence",
      mode,
      thinkingSteps: ctx.thinkingSteps,
      toolCalls: ctx.toolCalls,
      followUpSuggestions: buildSmartFollowUps(ar, ctx),
      mutated: true,
      nextState: { topology: ctx.topology, plan: ctx.plan, acls: ctx.acls },
    };
  }
  if (!ctx.topology.devices.length) {
    return {
      reply: ar
        ? "ابدأ بتحديد أنواع الأجهزة وأعدادها لتصميم شبكة، أو افتح محادثة فيها تصميم محفوظ. مثال: صمم شبكة بها راوتر وسويتش و4 أجهزة كمبيوتر."
        : "Specify device types and counts to design a network, or open a conversation with a saved design. For example: design 1 router, 1 switch and 4 PCs.",
      engineLabel: "Topova Intelligence",
      mode,
      thinkingSteps: ctx.thinkingSteps,
      toolCalls: [],
      followUpSuggestions: ar
        ? ["صمم شبكة بها راوتر وسويتش و4 أجهزة كمبيوتر"]
        : ["Design 1 router, 1 switch and 4 PCs"],
      mutated: false,
    };
  }

  if (
    /(auto.?fix|remediat|harden|أصلح|اصلح|حصن|أمن الشبكة|حماية كاملة|ثغرات)/.test(
      lower,
    )
  ) {
    const res = executeAgentTool("auto_remediate_network", {}, ctx, ar);
    return {
      reply: ar
        ? `تم تطبيق الإصلاح والتأمين التلقائي بنجاح.\n\n- تقييم الأمان ارتفع من **${res.beforeScore}/100** إلى **${res.afterScore}/100 (${res.grade})**\n- عدد قواعد Zero-Trust ACL المفعّلة: **${res.aclCount}**\n- التعديلات المطبّقة: ${(res.changes as string[]).join("، ")}\n\nالشبكة جاهزة الآن للتصدير المباشر لبرنامج **Cisco Packet Tracer**.`
        : `Auto-remediation completed.\n\n- Security Score improved from **${res.beforeScore}/100** to **${res.afterScore}/100 (${res.grade})**\n- Active Zero-Trust ACLs: **${res.aclCount}**\n- Applied changes: ${(res.changes as string[]).join("; ")}`,
      engineLabel: "Topova Intelligence",
      mode,
      thinkingSteps: ctx.thinkingSteps,
      toolCalls: ctx.toolCalls,
      followUpSuggestions: buildSmartFollowUps(ar, ctx),
      mutated: ctx.mutated,
      nextState: ctx.mutated
        ? { topology: ctx.topology, plan: ctx.plan, acls: ctx.acls }
        : undefined,
      audit: ctx.audit,
    };
  }

  if (/(audit|score|security|فحص|تدقيق|تقييم|أمان)/.test(lower)) {
    const res = executeAgentTool("run_security_audit", {}, ctx, ar);
    return {
      reply: ar
        ? `نتيجة التدقيق الأمني والهندسي للشبكة الحالية: **${res.overallScore}/100 (${res.grade})**.\n- عدد الملاحظات المكتشفة: **${(res.findings as unknown[]).length}**\nيمكنك طلب الإصلاح التلقائي لرفع التقييم وإضافة الجدار الناري وعزل الشبكات الافتراضية فوراً.`
        : `Security & Resilience Audit complete: **${res.overallScore}/100 (Grade ${res.grade})** with **${(res.findings as unknown[]).length}** findings. Ask me to auto-remediate to harden the architecture automatically.`,
      engineLabel: "Topova Intelligence",
      mode,
      thinkingSteps: ctx.thinkingSteps,
      toolCalls: ctx.toolCalls,
      followUpSuggestions: buildSmartFollowUps(ar, ctx),
      mutated: false,
      audit: ctx.audit,
    };
  }

  if (/(attack|hack|red.?team|اختراق|هجوم|انتشار)/.test(lower)) {
    const res = executeAgentTool("simulate_cyber_attack", {}, ctx, ar);
    return {
      reply: ar
        ? `نتيجة محاكاة الاختراق من الجهاز **${res.entryDeviceId}**:\n- نطاق الضرر: **${res.blastRadiusPercent}%** (الحالة: **${res.riskLevel}**)\n- الأجهزة المتأثرة: ${(res.compromisedDevices as string[]).join("، ")}`
        : `Red-Team simulation from **${res.entryDeviceId}**: **${res.blastRadiusPercent}%** blast radius (**${res.riskLevel}**), reaching ${(res.compromisedDevices as string[]).join(", ")}.`,
      engineLabel: "Topova Intelligence",
      mode,
      thinkingSteps: ctx.thinkingSteps,
      toolCalls: ctx.toolCalls,
      followUpSuggestions: buildSmartFollowUps(ar, ctx),
      mutated: false,
      attack: ctx.attack,
    };
  }

  if (/(bom|cost|poe|watt|سعر|تكلفة|ميزانية|واط)/.test(lower)) {
    const res = executeAgentTool("estimate_bom_and_poe", {}, ctx, ar);
    const poe = res.poe as BomEstimateReport["poe"];
    return {
      reply: ar
        ? `تقدير الميزانية وميزانية طاقة PoE:\n- الطاقة المطلوبة: **${poe.requiredWatts}W** من أصل **${poe.availableWatts}W** (${poe.utilizationPercent}%)\n- مساحة الراك المطلوبة: **${res.rackUnitsRequired}U**`
        : `BOM & PoE estimate: **${poe.requiredWatts}W / ${poe.availableWatts}W** (${poe.utilizationPercent}% PoE utilization), **${res.rackUnitsRequired}U** rack space.`,
      engineLabel: "Topova Intelligence",
      mode,
      thinkingSteps: ctx.thinkingSteps,
      toolCalls: ctx.toolCalls,
      followUpSuggestions: buildSmartFollowUps(ar, ctx),
      mutated: false,
      bom: ctx.bom,
    };
  }

  if (/(ping|trace|show |عرض|بنق|حزمة)/.test(lower)) {
    const devs = ctx.topology.devices;
    if (/(show )/.test(lower)) {
      const cmdMatch = message.match(/show\s+[^\n]+/i);
      const res = executeAgentTool(
        "run_device_cli",
        {
          device: devs[0]?.id ?? "R1",
          command: cmdMatch?.[0] ?? "show ip interface brief",
        },
        ctx,
        ar,
      );
      return {
        reply: `\`\`\`\n${String(res.output ?? "")}\n\`\`\``,
        engineLabel: "Topova Intelligence",
        mode,
        thinkingSteps: ctx.thinkingSteps,
        toolCalls: ctx.toolCalls,
        followUpSuggestions: buildSmartFollowUps(ar, ctx),
        mutated: false,
        cliOutput: ctx.cliOutput,
      };
    }
    const src =
      devs.find((d) => d.type === "PC" || d.type === "CAMERA") ?? devs[0];
    const dst =
      devs.find((d) => d.type === "SERVER" || d.type === "ROUTER") ??
      devs[devs.length - 1];
    if (src && dst && src.id !== dst.id) {
      const res = executeAgentTool(
        "trace_packet_flow",
        { sourceDevice: src.id, destinationDevice: dst.id, protocol: "ICMP" },
        ctx,
        ar,
      );
      return {
        reply: ar
          ? `نتيجة تتبع الحزمة من **${src.label}** إلى **${dst.label}**: ${res.reachable ? `نجح الوصول خلال ${res.totalLatencyMs}ms` : `تم الحجب (${res.summary})`}`
          : `Packet trace **${src.label} -> ${dst.label}**: ${res.reachable ? `Delivered in ${res.totalLatencyMs}ms` : `Dropped (${res.summary})`}.`,
        engineLabel: "Topova Intelligence",
        mode,
        thinkingSteps: ctx.thinkingSteps,
        toolCalls: ctx.toolCalls,
        followUpSuggestions: buildSmartFollowUps(ar, ctx),
        mutated: false,
        packetTrace: ctx.packetTrace,
      };
    }
  }

  const mod = executeAgentTool(
    "modify_topology",
    { instruction: message },
    ctx,
    ar,
  );
  return {
    reply: ar
      ? `تم تنفيذ التعديل على الشبكة: **${mod.summary}**.\nتقييم الأمان الحالي: **${mod.securityScore}/100 (${mod.grade})**.`
      : ctx.mutated
        ? `Proposed network update: **${mod.summary}**.\nCandidate Security Score: **${mod.securityScore}/100 (Grade ${mod.grade})**.`
        : String(mod.summary),
    engineLabel: "Topova Intelligence",
    mode,
    thinkingSteps: ctx.thinkingSteps,
    toolCalls: ctx.toolCalls,
    followUpSuggestions: buildSmartFollowUps(ar, ctx),
    mutated: ctx.mutated,
    nextState: ctx.mutated
      ? { topology: ctx.topology, plan: ctx.plan, acls: ctx.acls }
      : undefined,
    audit: ctx.audit,
  };
}

function extractFunctionCalls(
  interaction: unknown,
): Array<{ id: string; name: string; arguments: Record<string, unknown> }> {
  const obj = interaction as {
    steps?: Array<{
      type?: string;
      id?: string;
      name?: string;
      arguments?: Record<string, unknown>;
    }>;
    outputs?: Array<{
      type?: string;
      id?: string;
      name?: string;
      arguments?: Record<string, unknown>;
    }>;
  };
  const items = Array.isArray(obj.steps)
    ? obj.steps
    : Array.isArray(obj.outputs)
      ? obj.outputs
      : [];
  return items
    .filter(
      (s) =>
        s?.type === "function_call" &&
        typeof s.name === "string" &&
        typeof s.id === "string",
    )
    .map((s) => ({
      id: s.id!,
      name: s.name!,
      arguments: (s.arguments && typeof s.arguments === "object"
        ? s.arguments
        : {}) as Record<string, unknown>,
    }));
}

function extractOutputText(interaction: unknown): string {
  const obj = interaction as {
    output_text?: string;
    steps?: Array<{ type?: string; text?: string }>;
    outputs?: Array<{ type?: string; text?: string }>;
  };
  if (typeof obj.output_text === "string" && obj.output_text.trim()) {
    return obj.output_text.trim();
  }
  const items = Array.isArray(obj.steps)
    ? obj.steps
    : Array.isArray(obj.outputs)
      ? obj.outputs
      : [];
  return items
    .filter((s) => s?.type === "text" && typeof s.text === "string")
    .map((s) => s.text!)
    .join("\n")
    .trim();
}

/** Public white-label capabilities status (never exposes third-party providers or model IDs). */
export function getAgentStatus() {
  return {
    ready: true,
    engineLabel: "Topova Intelligence",
    modes: AGENT_WORK_MODES,
    executionMode: process.env.GEMINI_API_KEY?.trim() ? "external" : "local",
    limitations: {
      localAttachmentFormats: ["json", "cfg", "txt", "yaml", "csv"],
      localConversationalMemory: false,
      localCustomInstructions: false,
    },
    tools: AGENT_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
    })),
  };
}

/**
 * Autonomous NetTopo AI Agent runner.
 * Routes automatically to the strongest live intelligence core without exposing any
 * vendor, API, or model details to the client.
 */
export async function runNetworkAgentChat(
  req: AgentChatRequest,
  callerSignal?: AbortSignal,
): Promise<AgentChatResponse> {
  const mode: AgentWorkMode =
    req.mode ?? req.profile?.preferences.defaultMode ?? "auto";
  const ar =
    req.lang === "ar"
      ? true
      : req.lang === "en"
        ? false
        : isArabicText(req.message);
  const baseState = structuredClone(req.state ?? createDefaultAgentState());

  const ctx: MutableContext = {
    topology: baseState.topology,
    plan: baseState.plan,
    acls: baseState.acls ?? [],
    faults: baseState.faults ?? { disabledDevices: [], disabledLinks: [] },
    mutated: false,
    toolCalls: [],
    thinkingSteps: [],
  };

  const localResponse = () => {
    if (callerSignal?.aborted)
      throw new DOMException("Request cancelled", "AbortError");
    const attachments = localAttachmentContext(
      req.attachments ?? [],
      req.lang === "ar" || isArabicText(req.message),
    );
    const response = runLocalFallbackAgent(req.message, ctx, mode);
    response.executionMode = "local";
    if (
      response.mutated &&
      response.nextState &&
      req.profile &&
      !/\b(OSPF|EIGRP|RIP|BGP|STATIC)\b/i.test(req.message)
    ) {
      response.nextState.plan = planNetwork(
        response.nextState.topology,
        undefined,
        {
          routingProtocol: req.profile.preferences.defaultRouting,
          vlan: req.profile.preferences.autoVlan,
        },
      );
      response.nextState.acls = generateZeroTrustAcls(response.nextState.plan);
    }
    if (attachments) response.reply += `\n\n${attachments}`;
    return response;
  };
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return localResponse();
  }

  const ai = new GoogleGenAI({ apiKey });
  const configured = process.env.GEMINI_MODEL?.trim();
  // Prioritize the ultra-responsive live engine first so replies arrive in ~2-4s,
  // with a strict hard timeout per call so no upstream delay can ever hang chat.
  const candidateModels = [
    configured,
    FAST_GEMINI_MODEL,
    DEFAULT_GEMINI_MODEL,
  ].filter((m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i);

  const recentHistory = (req.history ?? [])
    .slice(-8)
    .map((m) => `${m.role === "user" ? "User" : "NetTopo AI"}: ${m.content}`)
    .join("\n");

  const attachmentBlock = (req.attachments ?? [])
    .slice(0, 3)
    .map(
      (att) =>
        `--- ATTACHED FILE: ${att.name} ---\n${att.content.slice(0, 12_000)}\n--- END FILE ---`,
    )
    .join("\n\n");

  const initialInput = [
    buildLiveContextSnapshot(req.state),
    attachmentBlock ? `\n${attachmentBlock}\n` : "",
    recentHistory ? `\nRecent conversation:\n${recentHistory}\n` : "",
    `User message: ${req.message}`,
  ]
    .filter(Boolean)
    .join("\n");

  const systemInstruction = buildSystemInstruction(mode, req.profile);
  const deadline = AbortSignal.timeout(40_000);
  const signal = callerSignal
    ? AbortSignal.any([deadline, callerSignal])
    : deadline;

  for (const model of candidateModels) {
    if (signal.aborted) break;
    const attemptCtx: MutableContext = {
      topology: baseState.topology,
      plan: baseState.plan,
      acls: baseState.acls ?? [],
      faults: baseState.faults ?? { disabledDevices: [], disabledLinks: [] },
      mutated: false,
      toolCalls: [],
      thinkingSteps: [
        {
          title: ar
            ? "تحليل السؤال وفهم السياق الهندسي"
            : "Analyzed prompt & workspace context",
          detail: ar
            ? `الوضع النشط: ${AGENT_WORK_MODES.find((m) => m.id === mode)?.labelAr ?? mode}${req.attachments?.length ? ` · تحليل ${req.attachments.length} ملف مرفق` : ""}`
            : `Active mode: ${AGENT_WORK_MODES.find((m) => m.id === mode)?.labelEn ?? mode}${req.attachments?.length ? ` · parsed ${req.attachments.length} attachment(s)` : ""}`,
          status: "done",
        },
      ],
    };

    try {
      let interaction = await withTimeout(
        ai.interactions.create(
          {
            model,
            input: initialInput,
            system_instruction: systemInstruction,
            tools: AGENT_TOOLS as never,
          },
          { signal },
        ),
        20_000,
        "agent-turn",
      );

      for (let round = 0; round < 4; round++) {
        const calls = extractFunctionCalls(interaction);
        if (calls.length === 0) break;

        const results = calls.map((call) => {
          const out = executeAgentTool(
            call.name,
            call.arguments,
            attemptCtx,
            ar,
          );
          return {
            type: "function_result" as const,
            call_id: call.id,
            name: call.name,
            result: JSON.stringify(out),
          };
        });

        interaction = await withTimeout(
          ai.interactions.create(
            {
              model,
              previous_interaction_id: interaction.id,
              input: results as never,
              system_instruction: systemInstruction,
              tools: AGENT_TOOLS as never,
            },
            { signal },
          ),
          20_000,
          `agent-tool-round-${round + 1}`,
        );
      }

      attemptCtx.thinkingSteps.push({
        title: ar
          ? "صياغة الإجابة وتوليد الاقتراحات التالية"
          : "Synthesized response & next-step suggestions",
        detail: ar
          ? attemptCtx.toolCalls.length > 0
            ? `تم دمج نتائج ${attemptCtx.toolCalls.length} أداة هندسية بنجاح`
            : "تمت صياغة إجابة تحليلية متكاملة"
          : attemptCtx.toolCalls.length > 0
            ? `Synthesized output from ${attemptCtx.toolCalls.length} engineering tool(s)`
            : "Synthesized structured technical response",
        status: "done",
      });

      const rawOutput =
        extractOutputText(interaction) ||
        (attemptCtx.toolCalls.length > 0
          ? attemptCtx.toolCalls.map((t) => `• ${t.summary}`).join("\n")
          : ar
            ? "جاهز لمساعدتك في أي تصميم أو سؤال هندسي."
            : "Ready to help with any architecture or engineering task.");

      const { cleanReply, followUps, clarifyingQuestions } =
        parseMetaBlock(rawOutput);

      return {
        executionMode: "external",
        reply: cleanReply,
        engineLabel: "Topova Intelligence",
        mode,
        thinkingSteps: attemptCtx.thinkingSteps,
        toolCalls: attemptCtx.toolCalls,
        followUpSuggestions:
          followUps.length > 0
            ? followUps
            : buildSmartFollowUps(ar, attemptCtx),
        clarifyingQuestions:
          clarifyingQuestions.length > 0 ? clarifyingQuestions : undefined,
        mutated: attemptCtx.mutated,
        nextState: attemptCtx.mutated
          ? {
              topology: attemptCtx.topology,
              plan: attemptCtx.plan,
              acls: attemptCtx.acls,
            }
          : undefined,
        audit: attemptCtx.audit,
        packetTrace: attemptCtx.packetTrace,
        attack: attemptCtx.attack,
        bom: attemptCtx.bom,
        cliOutput: attemptCtx.cliOutput,
      };
    } catch (err) {
      const status = (err as { status?: number } | null)?.status;
      console.warn(
        `[nettopo-agent] primary engine attempt failed (${status ?? "error"}): ${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`,
      );
    }
  }

  if (callerSignal?.aborted)
    throw new DOMException("Request cancelled", "AbortError");
  return localResponse();
}
