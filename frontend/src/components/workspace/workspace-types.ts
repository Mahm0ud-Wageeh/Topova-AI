import type { AclRule, BuiltTopology, NetworkPlan } from "@/lib/network-engine/types";
import type { AgentWorkMode } from "@/context/profile-context";

export interface ThinkingStep {
  title: string;
  detail: string;
  status: "done";
}

export interface ClarifyingQuestion {
  question: string;
  options: string[];
}

export interface ChatToolExecution {
  name: string;
  args: Record<string, unknown>;
  summary: string;
  mutated: boolean;
}

export type ExportCardKind =
  | "pt-guide"
  | "cisco-cfg"
  | "cml-yaml"
  | "gns3-project"
  | "cabling-csv"
  | "pdf-report"
  | "pt-pack";

export interface ChatExportCard {
  id: ExportCardKind;
  format: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  recommended?: boolean;
}

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  mode?: AgentWorkMode;
  thinkingSteps?: ThinkingStep[];
  toolCalls?: ChatToolExecution[];
  followUpSuggestions?: string[];
  clarifyingQuestions?: ClarifyingQuestion[];
  attachments?: { name: string; size: number }[];
  cliOutput?: { deviceId: string; command: string; output: string };
  exportCards?: ChatExportCard[];
  hasTopologyUpdate?: boolean;
  topologySummary?: {
    devices: number;
    links: number;
    vlans: number;
    routing: string;
    score?: number;
    grade?: string;
  };
}

export interface ConversationWorkspaceState {
  projectName: string;
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls: AclRule[];
}

export interface ConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  mode: AgentWorkMode;
  messageCount: number;
  hasTopology: boolean;
  lastMessagePreview: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail {
  id: string;
  ownerId: string;
  title: string;
  pinned: boolean;
  mode: AgentWorkMode;
  messages: ChatMessageItem[];
  version?: number;
  olderBefore?: number | null;
  totalMessages?: number;
  workspaceRevisions?: { number: number; note: string; createdAt: string; snapshot: ConversationWorkspaceState }[];
  pendingProposal?: { id: string; createdAt: string; state: ConversationWorkspaceState };
  workspaceState?: ConversationWorkspaceState;
  createdAt: string;
  updatedAt: string;
}

export interface PromptTemplateItem {
  id: string;
  categoryAr: string;
  categoryEn: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  mode: AgentWorkMode;
  promptAr: string;
  promptEn: string;
}

export const PROMPT_TEMPLATES: PromptTemplateItem[] = [
  {
    id: "enterprise-campus",
    categoryAr: "معمارية الشركات",
    categoryEn: "Enterprise",
    titleAr: "مقر شركة متكامل عالي الاعتمادية",
    titleEn: "High-Availability Enterprise Campus",
    descAr: "٢ راوتر + جدار حماية + ٣ سويتش + سيرفرات + كاميرات + هواتف VoIP مع OSPF و VLANs",
    descEn: "2 Routers, Firewall, 3 Switches, Servers, PCs, Cameras & VoIP with OSPF & VLANs",
    mode: "architect",
    promptAr:
      "صمّم لي شبكة مقر شركة متكامل عالية الاعتمادية: 2 راوتر، جدار حماية، 3 سويتش، 2 سيرفر، 8 أجهزة كمبيوتر، 2 أكسس بوينت، 4 كاميرات مراقبة، 2 هاتف VoIP مع عزل VLANs وبروتوكول OSPF، ثم افحص الأمان واحسب ميزانية طاقة PoE والتكلفة.",
    promptEn:
      "Design a high-availability enterprise campus with 2 routers, 1 firewall, 3 switches, 2 servers, 8 PCs, 2 Wi-Fi APs, 4 IP cameras, and 2 VoIP phones using VLAN segmentation and OSPF. Then run a security audit and BOM/PoE estimate.",
  },
  {
    id: "hospital-zerotrust",
    categoryAr: "القطاع الصحي",
    categoryEn: "Healthcare",
    titleAr: "شبكة مستشفى معزولة بنظام الثقة الصفرية",
    titleEn: "Zero-Trust Hospital Network",
    descAr: "فصل تام بين السيرفرات الطبية وأجهزة الاستقبال وكاميرات المراقبة مع قواعد ACL",
    descEn: "Strict isolation between clinical servers, staff workstations, and CCTV with Zero-Trust ACLs",
    mode: "security",
    promptAr:
      "صمّم لي شبكة مستشفى معزولة تماماً: 2 راوتر، جدار حماية، 2 سويتش، 2 سيرفر للسجلات الطبية، 6 أجهزة كمبيوتر، 4 كاميرات مراقبة و NVR، و 2 أكسس بوينت مع عزل كامل بـ VLANs و OSPF، وبعدها اختبر اختراق جانبي من CAM1 للتأكد من العزل.",
    promptEn:
      "Architect a Zero-Trust hospital network with 2 routers, 1 firewall, 2 switches, 2 clinical servers, 6 PCs, 4 CCTV cameras, 1 NVR, and 2 Wi-Fi APs with strict VLANs & OSPF, then simulate a Red-Team attack from CAM1.",
  },
  {
    id: "cctv-poe",
    categoryAr: "أنظمة المراقبة",
    categoryEn: "Smart CCTV",
    titleAr: "فرع كاميرات مراقبة وحساب طاقة PoE",
    titleEn: "Smart CCTV & PoE+ Power Branch",
    descAr: "تصميم شبكة مراقبة كاملة وحساب الواط المطلوب لكل سويتش",
    descEn: "Full IP surveillance topology with PoE+ wattage budget & switch sizing",
    mode: "architect",
    promptAr:
      "صمّم شبكة فرع تحتوي على راوتر، جدار حماية، 2 سويتش، جهاز NVR، و 8 كاميرات مراقبة، و 4 أجهزة كمبيوتر، و 2 أكسس بوينت مع عزل VLANs، واحسب لي ميزانية طاقة PoE والتكلفة.",
    promptEn:
      "Design a branch surveillance network with 1 router, 1 firewall, 2 switches, 1 NVR, 8 IP cameras, 4 PCs, and 2 APs with VLAN segmentation, and calculate the full PoE wattage budget & BOM.",
  },
  {
    id: "security-hardening",
    categoryAr: "الأمن السيبراني",
    categoryEn: "Red-Team & Audit",
    titleAr: "تدقيق أمني شامل وإصلاح تلقائي",
    titleEn: "Full Security Audit & Auto-Hardening",
    descAr: "كشف نقاط الفشل الوحيدة والثغرات وتأمين الشبكة تلقائياً لأعلى تقييم",
    descEn: "Detect SPOFs and vulnerabilities, then auto-remediate to enterprise Zero-Trust grade",
    mode: "security",
    promptAr:
      "اعمل تدقيق أمني كامل للشبكة الحالية، اشرح كل نقطة ضعف مكتشفة، وبعدها أصلح كل الثغرات تلقائياً وقارن التقييم قبل وبعد الإصلاح.",
    promptEn:
      "Run a full security audit on the current network, explain each finding, then auto-remediate all vulnerabilities and compare before vs after scores.",
  },
  {
    id: "ccna-architect-interview",
    categoryAr: "تخطيط تفاعلي",
    categoryEn: "Guided Planning",
    titleAr: "تخطيط شبكة بأسئلة توضيحية ذكية",
    titleEn: "Guided Architecture Interview",
    descAr: "دع الوكيل يسألك أسئلة هندسية محددة قبل تصميم الشبكة المثالية لمشروعك",
    descEn: "Let the agent ask clarifying questions on scale, redundancy & budget before building",
    mode: "architect",
    promptAr:
      "أريد تصميم شبكة جديدة لجامعة/شركة كبيرة كمشروع تخرج متكامل. اسألني أولاً أهم الأسئلة التوضيحية لتحديد الحجم والميزانية ومستوى الأمان قبل البناء.",
    promptEn:
      "I want to architect a comprehensive campus network for a major project. Ask me the key clarifying questions on scale, redundancy, and security first before building.",
  },
  {
    id: "cli-troubleshoot",
    categoryAr: "تشخيص سيسكو",
    categoryEn: "Cisco Verification",
    titleAr: "فحص المنافذ وتتبع الحزم عبر سطر الأوامر",
    titleEn: "Live IOS CLI & Packet Reachability Check",
    descAr: "تنفيذ أوامر show وتتبع الحزم بين الأجهزة للتحقق من الجاهزية",
    descEn: "Run Cisco IOS show commands and trace live TCP/ICMP packets across VLANs",
    mode: "auto",
    promptAr:
      "نفّذ أمر show ip interface brief على R1، وتتبع حزمة TCP على منفذ 443 من PC1 إلى SRV1، واشرح لي مسار الحزمة خطوة بخطوة.",
    promptEn:
      "Execute 'show ip interface brief' on R1 and trace a TCP port 443 packet from PC1 to SRV1, explaining each hop.",
  },
];

export interface PendingAttachment { name: string; mimeType: string; content: string }
