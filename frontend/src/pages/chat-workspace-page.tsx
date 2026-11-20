import {
  apiRequest,
  apiRequestStream,
  type AgentProgressEvent,
} from "@/api/client";
import { TopovaMark } from "@/components/brand/topova-logo";
import { Button } from "@/components/ui/button";
import { ChatComposer } from "@/components/workspace/chat-composer";
import { ChatExportCards } from "@/components/workspace/chat-export-cards";
import {
  detectTextDirection,
  StreamingChatMarkdown,
} from "@/components/workspace/chat-markdown";
import { ChatSidebar } from "@/components/workspace/chat-sidebar";
import { CommandPaletteModal } from "@/components/workspace/command-palette";
import { DesignReview } from "@/components/workspace/design-review";
import { UnifiedThinkingPill } from "@/components/workspace/thinking-steps";
import { useWorkspaceSave } from "@/components/workspace/use-workspace-save";
import type { PendingAttachment } from "@/components/workspace/workspace-types";
import {
  type ChatMessageItem,
  type ConversationDetail,
  type ConversationSummary,
  type ConversationWorkspaceState,
  type PromptTemplateItem,
} from "@/components/workspace/workspace-types";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useProfile, type AgentWorkMode } from "@/context/profile-context";
import { useTheme } from "@/context/theme-context";
import type { AttackSimulationResult } from "@/lib/network-engine/attack-sim";
import type { PacketTraceResult } from "@/lib/network-engine/types";
import { motion } from "framer-motion";
import {
  Check,
  Copy,
  Download,
  FileText,
  Globe,
  HelpCircle,
  Loader2,
  Menu,
  Moon,
  Network,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Sun,
  Terminal,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

const ArtifactDrawer = lazy(() =>
  import("@/components/workspace/artifact-drawer").then((m) => ({
    default: m.ArtifactDrawer,
  })),
);
const PacketTracerExportModal = lazy(() =>
  import("@/components/studio/packet-tracer-modal").then((m) => ({
    default: m.PacketTracerExportModal,
  })),
);

interface SendMessageResponse {
  conversation: ConversationDetail;
  assistantMessage: ChatMessageItem;
  result: {
    packetTrace?: PacketTraceResult;
    attack?: AttackSimulationResult;
    mutated: boolean;
    executionMode?: "local" | "external";
  };
}

const QUICK_PILLS = [
  {
    icon: Network,
    ar: "تصميم شبكة متكاملة",
    en: "Design a network",
    mode: "architect" as AgentWorkMode,
    promptAr:
      "صمّم لي شبكة مقر شركة متكامل: 2 راوتر، جدار حماية، 2 سويتش، 2 سيرفر، 8 أجهزة كمبيوتر، 2 أكسس بوينت، و 4 كاميرات مع عزل VLANs وبروتوكول OSPF، ثم افحص الأمان.",
    promptEn:
      "Design a high-availability enterprise network with 2 routers, 1 firewall, 2 switches, 2 servers, 8 PCs, 2 APs, and 4 cameras using VLANs and OSPF, then run a security audit.",
  },
  {
    icon: Shield,
    ar: "تدقيق أمان وتأمين",
    en: "Security audit",
    mode: "security" as AgentWorkMode,
    promptAr:
      "افحص أمان الشبكة الحالية بالكامل، واشرح نقاط الضعف، ثم أصلحها تلقائياً.",
    promptEn:
      "Run a complete security audit on the current network, explain findings, and auto-remediate.",
  },
  {
    icon: HelpCircle,
    ar: "تخطيط بأسئلة ذكية",
    en: "Guided planning",
    mode: "architect" as AgentWorkMode,
    promptAr:
      "أريد تصميم شبكة جديدة لمشروعي؛ اسألني أولاً أهم الأسئلة التوضيحية لتحديد الحجم والميزانية والأمان.",
    promptEn:
      "I want to design a new network; ask me clarifying questions on scale, budget, and security first.",
  },
  {
    icon: Terminal,
    ar: "أوامر Cisco وحزم حية",
    en: "Cisco CLI & trace",
    mode: "auto" as AgentWorkMode,
    promptAr:
      "نفّذ أمر show ip interface brief على R1 وتتبع حزمة TCP على منفذ 443 من PC1 إلى SRV1.",
    promptEn:
      "Run 'show ip interface brief' on R1 and trace a TCP port 443 packet from PC1 to SRV1.",
  },
];

const THINKING_PHASES_AR = [
  "جاري التفكير وتحليل المتطلبات...",
  "جاري فحص المعمارية الهندسية...",
  "جاري تشغيل أدوات التصميم والتحقق...",
  "جاري صياغة الحل واقتراح الخطوات التالية...",
];

const THINKING_PHASES_EN = [
  "Thinking & analyzing requirements...",
  "Evaluating network architecture...",
  "Running live engineering tools...",
  "Synthesizing response & next steps...",
];

export function ChatWorkspacePage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const { lang, toggleLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { profile, refreshProfile } = useProfile();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConv, setActiveConv] = useState<ConversationDetail | null>(null);
  const { user } = useAuth();
  const [largeScreen, setLargeScreen] = useState(
    () => window.matchMedia("(min-width: 1280px)").matches,
  );
  // The canvas is a full-screen overlay below 1280px; never force it open there,
  // or it covers the conversation every time a chat loads or an answer arrives.
  const autoOpenArtifact = () => {
    if (window.matchMedia("(min-width: 1280px)").matches) setArtifactOpen(true);
  };
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1280px)");
    const change = () => setLargeScreen(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const save = useWorkspaceSave(activeConv, setActiveConv);
  const [engineMode, setEngineMode] = useState<"local" | "external" | null>(
    null,
  );
  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ executionMode: "local" | "external" }>(
      "/api/v1/agent/status",
      { signal: controller.signal },
    )
      .then((data) => setEngineMode(data.executionMode))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [listError, setListError] = useState(false);
  const searchSequence = useRef(0);
  const failedRequest = useRef<{
    id: string;
    text: string;
    conversationId?: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [artifactFullscreen, setArtifactFullscreen] = useState(false);

  const [mode, setMode] = useState<AgentWorkMode>("auto");
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [liveSteps, setLiveSteps] = useState<string[]>([]);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [thinkingTick, setThinkingTick] = useState(0);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const [packetTrace, setPacketTrace] = useState<PacketTraceResult | null>(
    null,
  );
  const [attack, setAttack] = useState<AttackSimulationResult | null>(null);

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteTab, setPaletteTab] = useState<"commands" | "templates">(
    "commands",
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const seededRef = useRef(false);
  const skipNextFetchIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (profile?.preferences.defaultMode && !activeConv) {
      setMode(profile.preferences.defaultMode);
    }
  }, [profile?.preferences.defaultMode, activeConv]);

  useEffect(() => {
    if (!sending) {
      setThinkingTick(0);
      return;
    }
    const timer = setInterval(() => setThinkingTick((x) => (x + 1) % 4), 2200);
    return () => clearInterval(timer);
  }, [sending]);

  const loadConversations = useCallback(async (q?: string, offset = 0) => {
    const sequence = ++searchSequence.current;
    try {
      const params = new URLSearchParams({
        q: q?.trim() ?? "",
        offset: String(offset),
      });
      const data = await apiRequest<{
        conversations: ConversationSummary[];
        nextOffset: number | null;
      }>(`/api/v1/conversations?${params}`);
      if (sequence !== searchSequence.current) return;
      setConversations((previous) =>
        offset
          ? [
              ...previous,
              ...data.conversations.filter(
                (item) => !previous.some((old) => old.id === item.id),
              ),
            ]
          : data.conversations,
      );
      setNextOffset(data.nextOffset);
      setListError(false);
    } catch {
      if (sequence === searchSequence.current) setListError(true);
    }
  }, []);

  useEffect(() => {
    searchSequence.current++;
    const timer = setTimeout(() => {
      void loadConversations(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search, user?.id, loadConversations]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  useEffect(() => {
    if (skipNextFetchIdRef.current !== conversationId) {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setSending(false);
      setStreamingMsgId(null);
    }
    if (!conversationId) {
      setActiveConv(null);
      setPacketTrace(null);
      setAttack(null);
      return;
    }
    if (skipNextFetchIdRef.current === conversationId) {
      skipNextFetchIdRef.current = null;
      return;
    }
    let alive = true;
    apiRequest<{ conversation: ConversationDetail }>(
      `/api/v1/conversations/${encodeURIComponent(conversationId)}`,
    )
      .then(({ conversation }) => {
        if (!alive) return;
        setActiveConv(conversation);
        setMode(conversation.mode);
        setPacketTrace(null);
        setAttack(null);
        if (conversation.workspaceState?.topology?.devices?.length) {
          autoOpenArtifact();
        }
      })
      .catch((error) => {
        if (alive) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Could not load conversation.",
          );
          navigate("/chat", { replace: true });
        }
      });
    return () => {
      alive = false;
    };
  }, [conversationId, navigate]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeConv?.messages.length, sending]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteTab("commands");
        setPaletteOpen((v) => !v);
      } else if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "o"
      ) {
        e.preventDefault();
        handleNewChat();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebarOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleNewChat() {
    setActiveConv(null);
    setStreamingMsgId(null);
    setPacketTrace(null);
    setAttack(null);
    setArtifactOpen(false);
    setAttachments([]);
    navigate("/chat");
  }

  function handleStopGeneration() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setSending(false);
      toast.info(t("تم إيقاف التوليد.", "Generation stopped."));
    }
  }

  function handleRegenerate() {
    if (sending || !activeConv) return;
    const lastUser = [...activeConv.messages]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUser) {
      void sendMessage(lastUser.content, lastUser.mode ?? mode);
    }
  }

  async function sendMessage(
    overrideText?: string,
    modeOverride?: AgentWorkMode,
  ) {
    const rawText = (overrideText ?? input).trim();
    const filesToSend = [...attachments];
    if ((!rawText && filesToSend.length === 0) || sending) return;
    const text =
      rawText ||
      (lang === "ar"
        ? "حلّل المحتوى المرفق بالتفصيل وقدّم التوجيه الهندسي المناسب."
        : "Analyze the attached content in detail and provide actionable engineering guidance.");
    if (activeConv?.pendingProposal) {
      toast.info(
        t("راجع التعديلات المقترحة أولاً.", "Review the pending changes first."),
      );
      return;
    }
    try {
      await save.flush();
    } catch {
      toast.error(
        t(
          "احفظ تعديلات الرسم قبل الإرسال.",
          "Save your canvas changes before sending.",
        ),
      );
      return;
    }

    const chosenMode = modeOverride ?? mode;
    if (!overrideText) setInput("");
    setAttachments([]);
    setLiveStatus(null);
    setLiveSteps([]);
    setSending(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const optimisticUser: ChatMessageItem = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
      mode: chosenMode,
      attachments: filesToSend.map((f) => ({
        name: f.name,
        size: f.content.length,
      })),
    };

    const existingConv = activeConv;
    let attemptedConversation = existingConv;
    const requestId =
      failedRequest.current?.text === text &&
      failedRequest.current.conversationId === existingConv?.id
        ? failedRequest.current.id
        : crypto.randomUUID();
    if (existingConv) {
      setActiveConv({
        ...existingConv,
        messages: [...existingConv.messages, optimisticUser],
      });
    } else {
      const nowIso = new Date().toISOString();
      setActiveConv({
        id: "draft",
        ownerId: "",
        title: text.slice(0, 48),
        pinned: false,
        mode: chosenMode,
        messages: [optimisticUser],
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    try {
      let targetId =
        existingConv?.id && existingConv.id !== "draft"
          ? existingConv.id
          : undefined;
      let currentDetail = existingConv;
      if (targetId)
        currentDetail = (
          await apiRequest<{ conversation: ConversationDetail }>(
            `/api/v1/conversations/${targetId}`,
            { signal: controller.signal },
          )
        ).conversation;

      if (!targetId) {
        const created = await apiRequest<{ conversation: ConversationDetail }>(
          "/api/v1/conversations",
          {
            method: "POST",
            signal: controller.signal,
            body: {
              title: lang === "ar" ? "محادثة جديدة" : "New Chat",
              mode: chosenMode,
            },
          },
        );
        if (
          controller.signal.aborted ||
          abortControllerRef.current !== controller
        )
          return;
        targetId = created.conversation.id;
        currentDetail = created.conversation;
        attemptedConversation = created.conversation;
        skipNextFetchIdRef.current = targetId;
        setActiveConv({ ...created.conversation, messages: [optimisticUser] });
        navigate(`/chat/${encodeURIComponent(targetId)}`, { replace: true });
      }

      const onProgress = (event: AgentProgressEvent) => {
        if (abortControllerRef.current !== controller) return;
        if (event.type === "status") setLiveStatus(event.message);
        else
          setLiveSteps((prev) =>
            [...prev, event.step.title].slice(-6),
          );
      };
      const res = await apiRequestStream<SendMessageResponse>(
        `/api/v1/conversations/${encodeURIComponent(targetId)}/messages?stream=1`,
        {
          timeoutMs: 65_000,
          signal: controller.signal,
          onProgress,
          body: {
            requestId,
            expectedVersion: currentDetail?.version ?? 1,
            message: text,
            mode: chosenMode,
            lang: "auto",
            attachments: filesToSend.length > 0 ? filesToSend : undefined,
            state: currentDetail?.workspaceState
              ? {
                  projectName: currentDetail.workspaceState.projectName,
                  topology: currentDetail.workspaceState.topology,
                  plan: currentDetail.workspaceState.plan,
                  acls: currentDetail.workspaceState.acls,
                }
              : undefined,
          },
        },
      );

      if (
        controller.signal.aborted ||
        abortControllerRef.current !== controller
      )
        return;
      failedRequest.current = null;
      if (res.result.executionMode) setEngineMode(res.result.executionMode);
      setStreamingMsgId(res.assistantMessage?.id ?? null);
      setActiveConv(res.conversation);
      if (res.result.packetTrace) {
        setPacketTrace(res.result.packetTrace);
        setAttack(null);
        autoOpenArtifact();
      }
      if (res.result.attack) {
        setAttack(res.result.attack);
        setPacketTrace(null);
        autoOpenArtifact();
      }
      if (res.conversation.pendingProposal) {
        setArtifactOpen(false);
        setArtifactFullscreen(false);
      }
      if (
        res.result.mutated &&
        !res.conversation.pendingProposal &&
        res.conversation.workspaceState
      ) {
        autoOpenArtifact();
      }

      void loadConversations(search);
      void refreshProfile();
    } catch (err) {
      if (abortControllerRef.current !== controller) return;
      failedRequest.current = {
        id: requestId,
        text,
        conversationId: attemptedConversation?.id,
      };
      setInput(text);
      setAttachments(filesToSend);
      if ((err as { name?: string })?.name !== "AbortError") {
        const msg =
          err instanceof Error
            ? err.message
            : t("تعذر إرسال الرسالة.", "Could not send message.");
        if (/conversation not found/i.test(msg)) {
          toast.error(
            t(
              "انتهت الجلسة السابقة لهذه المحادثة. تم فتح محادثة جديدة — أعد إرسال رسالتك.",
              "This conversation session expired. Started a fresh chat — send your message again.",
            ),
            { id: "conv-not-found" },
          );
          setActiveConv(null);
          navigate("/chat", { replace: true });
          return;
        }
        toast.error(msg, { id: "chat-send-error" });
      }
      if (attemptedConversation && attemptedConversation.id !== "draft") {
        try {
          const { conversation } = await apiRequest<{
            conversation: ConversationDetail;
          }>(
            `/api/v1/conversations/${encodeURIComponent(attemptedConversation.id)}`,
          );
          if (abortControllerRef.current === controller)
            setActiveConv(conversation);
        } catch {
          if (abortControllerRef.current === controller)
            setActiveConv(attemptedConversation);
        }
      } else {
        setActiveConv(null);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setSending(false);
      }
    }
  }

  useEffect(() => {
    if (seededRef.current || conversationId) return;
    try {
      const seedPrompt = sessionStorage.getItem("nettopo:chat:seed");
      if (seedPrompt) {
        seededRef.current = true;
        sessionStorage.removeItem("nettopo:chat:seed");
        void sendMessage(seedPrompt);
      }
    } catch {
      // ignore storage errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function handleRenameChat(id: string, title: string) {
    try {
      const { conversation } = await apiRequest<{
        conversation: ConversationDetail;
      }>(`/api/v1/conversations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { title },
      });
      if (activeConv?.id === id) setActiveConv(conversation);
      void loadConversations(search);
    } catch {
      toast.error(t("تعذر تعديل الاسم.", "Rename failed."));
    }
  }

  async function handleTogglePin(id: string, pinned: boolean) {
    try {
      const { conversation } = await apiRequest<{
        conversation: ConversationDetail;
      }>(`/api/v1/conversations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: { pinned },
      });
      if (activeConv?.id === id) setActiveConv(conversation);
      void loadConversations(search);
    } catch {
      toast.error(t("تعذر التثبيت.", "Pin update failed."));
    }
  }

  async function handleDeleteChat(id: string) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        t(
          "حذف هذه المحادثة نهائياً؟ لا يمكن التراجع.",
          "Delete this conversation permanently? This cannot be undone.",
        ),
      )
    )
      return;
    try {
      await apiRequest(`/api/v1/conversations/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (activeConv?.id === id) handleNewChat();
      void loadConversations(search);
      toast.success(t("تم حذف المحادثة.", "Conversation deleted."));
    } catch {
      toast.error(t("تعذر الحذف.", "Delete failed."));
    }
  }

  function handleWorkspaceUpdate(next: ConversationWorkspaceState) {
    if (sending || activeConv?.pendingProposal) {
      toast.info(
        t(
          "انتظر انتهاء الطلب وراجع التعديلات أولاً.",
          "Finish the request and review pending changes first.",
        ),
      );
      return;
    }
    save.update(next);
  }

  async function loadOlderMessages() {
    if (!activeConv?.olderBefore) return;
    const id = activeConv.id;
    try {
      const data = await apiRequest<{ conversation: ConversationDetail }>(
        `/api/v1/conversations/${id}?before=${activeConv.olderBefore}`,
      );
      setActiveConv((previous) =>
        previous?.id === id
          ? {
              ...previous,
              messages: [...data.conversation.messages, ...previous.messages],
              olderBefore: data.conversation.olderBefore,
            }
          : previous,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not load messages.",
      );
    }
  }

  async function handleFileSelect(files: FileList | null) {
    if (!files || files.length === 0) return;
    const loaded: PendingAttachment[] = [];
    for (const file of Array.from(files).slice(0, 4 - attachments.length)) {
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        if (file.size > 1.8 * 1024 * 1024) {
          toast.error(
            `${file.name}: ${t("الحد الأقصى للصور 1.8 ميجابايت.", "Max image size is 1.8 MB.")}`,
          );
          continue;
        }
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ""));
          reader.onerror = () => reject(new Error("Could not read image"));
          reader.readAsDataURL(file);
        });
        loaded.push({
          name: file.name || `screenshot-${Date.now().toString(36).slice(-4)}.png`,
          mimeType: file.type || "image/png",
          content: dataUrl,
        });
        continue;
      }

      if (file.size > 128 * 1024) {
        toast.error(
          `${file.name}: ${t("الحد الأقصى للملفات النصية 128 كيلوبايت.", "Max text file size is 128 KB.")}`,
        );
        continue;
      }
      const content = await file.text();
      loaded.push({
        name: file.name,
        mimeType: file.type || "text/plain",
        content,
      });
    }
    if (loaded.length > 0) {
      setAttachments((prev) => [...prev, ...loaded].slice(0, 4));
      toast.success(
        loaded.some((f) => f.mimeType.startsWith("image/"))
          ? t("تم إرفاق الصورة للتحليل الذكي.", "Image attached for AI inspection.")
          : t("تم إرفاق الملف للمحادثة.", "File attached to message."),
      );
    }
  }

  async function copyReply(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMsgId(id);
      setTimeout(() => setCopiedMsgId(null), 1500);
    } catch {
      toast.error(t("تعذر النسخ.", "Copy failed."));
    }
  }

  function handlePickTemplate(tpl: PromptTemplateItem) {
    setMode(tpl.mode);
    void sendMessage(lang === "ar" ? tpl.promptAr : tpl.promptEn, tpl.mode);
  }

  const messages = activeConv?.messages ?? [];
  const workspace = activeConv?.workspaceState ?? null;
  const thinkingPhases =
    lang === "ar" ? THINKING_PHASES_AR : THINKING_PHASES_EN;
  const showThinkingDefault =
    profile?.preferences.showThinkingByDefault ?? false;

  return (
    <div className="glass-canvas-bg flex h-[100dvh] w-full overflow-hidden">
      {/* Desktop Floating Frosted-Glass Sidebar */}
      {sidebarOpen && (
        <motion.aside
          initial={{ opacity: 0, x: lang === "ar" ? 16 : -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="hidden w-[292px] shrink-0 p-2.5 pe-0 lg:block"
        >
          <ChatSidebar
            nextOffset={nextOffset}
            onLoadMore={() => void loadConversations(search, nextOffset ?? 0)}
            loadError={listError}
            onRetry={() => void loadConversations(search)}
            conversations={conversations}
            activeId={activeConv?.id ?? null}
            search={search}
            onSearchChange={setSearch}
            onNewChat={handleNewChat}
            onSelectChat={(id) => navigate(`/chat/${encodeURIComponent(id)}`)}
            onRenameChat={(id, title) => void handleRenameChat(id, title)}
            onTogglePin={(id, pinned) => void handleTogglePin(id, pinned)}
            onDeleteChat={(id) => void handleDeleteChat(id)}
            onOpenTemplates={() => {
              setPaletteTab("templates");
              setPaletteOpen(true);
            }}
          />
        </motion.aside>
      )}

      {/* Mobile Floating Slide-Over Glass Sidebar */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 flex p-2.5 lg:hidden">
          <motion.div
            initial={{ opacity: 0, x: lang === "ar" ? 24 : -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="w-[292px] max-w-[85vw]"
          >
            <ChatSidebar
              nextOffset={nextOffset}
              onLoadMore={() => void loadConversations(search, nextOffset ?? 0)}
              loadError={listError}
              onRetry={() => void loadConversations(search)}
              conversations={conversations}
              activeId={activeConv?.id ?? null}
              search={search}
              onSearchChange={setSearch}
              onNewChat={handleNewChat}
              onSelectChat={(id) => navigate(`/chat/${encodeURIComponent(id)}`)}
              onRenameChat={(id, title) => void handleRenameChat(id, title)}
              onTogglePin={(id, pinned) => void handleTogglePin(id, pinned)}
              onDeleteChat={(id) => void handleDeleteChat(id)}
              onOpenTemplates={() => {
                setPaletteTab("templates");
                setPaletteOpen(true);
              }}
              onCloseMobile={() => setMobileSidebarOpen(false)}
            />
          </motion.div>
          <div
            className="flex-1 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileSidebarOpen(false)}
          />
        </div>
      )}

      {/* Center Column + Optional Floating Glass Artifact Drawer */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Floating Frosted-Glass Workspace Header */}
        <header className="px-3 pt-2.5 sm:px-4">
          <div className="glass-panel flex h-12 shrink-0 items-center justify-between gap-2 rounded-2xl px-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 lg:hidden"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="hidden h-8 w-8 text-muted-foreground hover:text-foreground lg:inline-flex"
              onClick={() => setSidebarOpen((v) => !v)}
              title={t(
                "إظهار/إخفاء القائمة الجانبية",
                "Toggle sidebar (Ctrl+B)",
              )}
            >
              <PanelLeft className="h-4 w-4" />
            </Button>

            {activeConv && (
              <span className="truncate font-display text-sm font-semibold text-foreground/90">
                {activeConv.title}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="hidden h-8 w-8 text-muted-foreground hover:text-foreground sm:inline-flex"
              onClick={() => {
                setPaletteTab("commands");
                setPaletteOpen(true);
              }}
              title={t("بحث وأوامر (Ctrl+K)", "Search & Commands (Ctrl+K)")}
            >
              <Search className="h-4 w-4" />
            </Button>

            {workspace && (
              <>
                <Button
                  size="sm"
                  variant="default"
                  className="h-8 gap-1.5 rounded-full px-3 text-xs"
                  aria-label={t("تصدير Packet Tracer", "Export Packet Tracer")}
                  onClick={() => setExportModalOpen(true)}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">Packet Tracer</span>
                </Button>
                <Button
                  size="sm"
                  variant={artifactOpen ? "secondary" : "outline"}
                  className="h-8 gap-1.5 rounded-full px-3 text-xs"
                  aria-label={t("إظهار أو إخفاء المخطط", "Toggle canvas")}
                  onClick={() => setArtifactOpen((v) => !v)}
                >
                  <PanelRight className="h-3.5 w-3.5 text-cyan" />
                  <span className="hidden sm:inline">
                    {t("المخطط", "Canvas")}
                  </span>
                </Button>
              </>
            )}

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={toggleLang}
              title="Language"
            >
              <Globe className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={toggleTheme}
              title="Theme"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
          </div>
        </header>

        {/* Main Split Area inside Floating Frosted Glass Stage */}
        <div className="flex min-h-0 flex-1 gap-2.5 overflow-hidden p-2.5 sm:p-3">
          <div className="glass-stage relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-[26px]">
            {messages.length === 0 ? (
              /* Calm, Centered Workspace Empty Stage */
              <div className="relative flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10 sm:px-8">
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="relative flex w-full max-w-3xl flex-col items-center gap-6 text-center"
                >
                  <div className="flex flex-col items-center gap-3">
                    <TopovaMark size={56} />
                    <h1 className="font-display text-2xl font-bold tracking-tight sm:text-4xl">
                      {profile?.displayName
                        ? t(
                            `كيف أساعدك اليوم يا ${profile.displayName}؟`,
                            `How can I help you today, ${profile.displayName}?`,
                          )
                        : t(
                            "كيف يمكنني مساعدتك اليوم؟",
                            "How can I help you today?",
                          )}
                    </h1>
                  </div>

                  {/* Centered Hero Composer */}
                  <ChatComposer
                    centered={true}
                    artifactOpen={artifactOpen}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    input={input}
                    setInput={setInput}
                    sending={sending}
                    engineMode={engineMode}
                    mode={mode}
                    setMode={setMode}
                    onSend={() => sendMessage()}
                    onStop={handleStopGeneration}
                    onFileSelect={handleFileSelect}
                    onTemplates={() => {
                      setPaletteTab("templates");
                      setPaletteOpen(true);
                    }}
                  />

                  {/* 4 Ultra-Clean Single-Line Quick Pills */}
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {QUICK_PILLS.map((pill) => (
                      <button
                        key={pill.en}
                        type="button"
                        onClick={() => {
                          setMode(pill.mode);
                          void sendMessage(
                            lang === "ar" ? pill.promptAr : pill.promptEn,
                            pill.mode,
                          );
                        }}
                        className="glass-pill inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:text-foreground"
                      >
                        <pill.icon className="h-3.5 w-3.5 text-primary" />
                        <span>{t(pill.ar, pill.en)}</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              </div>
            ) : (
              <>
                {/* Full-Flow Responsive Conversation Feed */}
                <div ref={scrollRef} className="flex-1 overflow-y-auto">
                  <div
                    className={`mx-auto w-full space-y-8 py-6 sm:py-8 ${
                      artifactOpen
                        ? "px-4 sm:px-6"
                        : "max-w-5xl px-4 sm:px-8 lg:px-12"
                    }`}
                  >
                    {messages.map((msg, idx) => {
                      const isLatestAssistant =
                        msg.role === "assistant" && idx === messages.length - 1;
                      const isStreamingThis =
                        isLatestAssistant && streamingMsgId === msg.id;
                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{
                            duration: 0.24,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                          className={`flex gap-3 sm:gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          {msg.role === "assistant" && (
                            <TopovaMark size={30} className="mt-1 hidden sm:block" />
                          )}

                          <div
                            className={`min-w-0 ${
                              msg.role === "user"
                                ? "glass-user-bubble max-w-[88%] rounded-3xl rounded-se-lg px-4 py-3 text-[15px] sm:max-w-[76%]"
                                : "flex-1 space-y-3"
                            }`}
                          >
                            {msg.role === "user" ? (
                              <div className="space-y-2">
                                {msg.attachments &&
                                  msg.attachments.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                      {msg.attachments.map((att, ai) => (
                                        <span
                                          key={ai}
                                          className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 font-mono text-[10px]"
                                        >
                                          <FileText className="h-3 w-3" />
                                          {att.name}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                <p
                                  dir={detectTextDirection(msg.content)}
                                  className="whitespace-pre-wrap break-words text-start leading-relaxed"
                                >
                                  {msg.content}
                                </p>
                              </div>
                            ) : (
                              <>
                                {/* Single Unified Thinking & Tools Accordion */}
                                <UnifiedThinkingPill
                                  steps={msg.thinkingSteps}
                                  toolCalls={msg.toolCalls}
                                  defaultOpen={showThinkingDefault}
                                />

                                {/* Unboxed Full-Flow Prose with Live Streaming Reveal */}
                                <div className="space-y-3">
                                  <StreamingChatMarkdown
                                    content={msg.content}
                                    streaming={isStreamingThis}
                                    onProgress={() => {
                                      if (scrollRef.current) {
                                        scrollRef.current.scrollTop =
                                          scrollRef.current.scrollHeight;
                                      }
                                    }}
                                    onComplete={() =>
                                      setStreamingMsgId((cur) =>
                                        cur === msg.id ? null : cur,
                                      )
                                    }
                                  />

                                  {!isStreamingThis && msg.cliOutput && (
                                    <div
                                      dir="ltr"
                                      className="glass-code mt-3 overflow-hidden rounded-2xl"
                                    >
                                      <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.04] px-4 py-2 font-mono text-xs text-primary">
                                        <Terminal className="h-3.5 w-3.5" />
                                        <span>
                                          {msg.cliOutput.deviceId}#{" "}
                                          {msg.cliOutput.command}
                                        </span>
                                      </div>
                                      <pre className="max-h-none overflow-x-auto p-3 font-mono text-xs text-zinc-200 sm:max-h-60 sm:overflow-auto sm:p-4">
                                        {msg.cliOutput.output}
                                      </pre>
                                    </div>
                                  )}

                                  {!isStreamingThis &&
                                    msg.hasTopologyUpdate &&
                                    msg.topologySummary && (
                                      <motion.div
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{
                                          duration: 0.24,
                                          ease: [0.22, 1, 0.36, 1],
                                        }}
                                        className="glass-surface mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
                                      >
                                        <div className="flex items-center gap-3">
                                          <span className="grid h-10 w-10 place-items-center rounded-xl border bg-muted/60 text-primary">
                                            <Network className="h-5 w-5" />
                                          </span>
                                          <div className="text-xs">
                                            <p className="text-sm font-semibold text-foreground">
                                              {t(
                                                "مخطط الشبكة التفاعلي جاهز",
                                                "Interactive Network Blueprint Ready",
                                              )}
                                            </p>
                                            <p
                                              dir="ltr"
                                              className="font-mono text-xs tabular-nums text-muted-foreground"
                                            >
                                              {msg.topologySummary.devices} dev
                                              · {msg.topologySummary.links}{" "}
                                              links ·{" "}
                                              {msg.topologySummary.vlans} VLANs
                                              · {msg.topologySummary.routing}
                                              {msg.topologySummary.score !==
                                              undefined
                                                ? ` · Score ${msg.topologySummary.score}/100`
                                                : ""}
                                            </p>
                                          </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                          <Button
                                            size="sm"
                                            variant="secondary"
                                            className="h-8 gap-1.5 rounded-full px-3 text-xs"
                                            onClick={() =>
                                              setArtifactOpen(true)
                                            }
                                          >
                                            <PanelRight className="h-3.5 w-3.5 text-primary" />
                                            {t("عرض المخطط", "Open Canvas")}
                                          </Button>
                                          <Button
                                            size="sm"
                                            className="h-8 gap-1.5 rounded-full px-3 text-xs"
                                            aria-label={t(
                                              "تصدير Packet Tracer",
                                              "Export Packet Tracer",
                                            )}
                                            onClick={() =>
                                              setExportModalOpen(true)
                                            }
                                          >
                                            <Download className="h-3.5 w-3.5" />
                                            Packet Tracer
                                          </Button>
                                        </div>
                                      </motion.div>
                                    )}

                                  {!isStreamingThis &&
                                    msg.exportCards &&
                                    msg.exportCards.length > 0 &&
                                    workspace && (
                                      <motion.div
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{
                                          duration: 0.24,
                                          delay: 0.05,
                                          ease: [0.22, 1, 0.36, 1],
                                        }}
                                      >
                                        <ChatExportCards
                                          cards={msg.exportCards}
                                          workspace={workspace}
                                          preferArabic={
                                            detectTextDirection(msg.content) ===
                                            "rtl"
                                          }
                                          onOpenExportCenter={() =>
                                            setExportModalOpen(true)
                                          }
                                        />
                                      </motion.div>
                                    )}

                                  <div className="flex items-center gap-1 pt-1 text-xs text-muted-foreground">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void copyReply(msg.id, msg.content)
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-muted hover:text-foreground"
                                    >
                                      {copiedMsgId === msg.id ? (
                                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="h-3.5 w-3.5" />
                                      )}
                                      {t("نسخ", "Copy")}
                                    </button>
                                    {isLatestAssistant && (
                                      <button
                                        type="button"
                                        disabled={sending}
                                        onClick={handleRegenerate}
                                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-muted hover:text-foreground disabled:opacity-40"
                                      >
                                        <RefreshCw className="h-3.5 w-3.5" />
                                        {t("إعادة التوليد", "Regenerate")}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {isLatestAssistant &&
                                  !isStreamingThis &&
                                  msg.clarifyingQuestions &&
                                  msg.clarifyingQuestions.length > 0 && (
                                    <div className="glass-surface space-y-2.5 rounded-2xl p-4">
                                      <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                                        <HelpCircle className="h-4 w-4 text-primary" />
                                        {t(
                                          "أسئلة سريعة لتخصيص الحل:",
                                          "Quick questions to tailor your solution:",
                                        )}
                                      </p>
                                      {msg.clarifyingQuestions.map((cq, qi) => (
                                        <div key={qi} className="space-y-1.5">
                                          <p
                                            dir="auto"
                                            className="text-xs font-medium text-foreground/90"
                                          >
                                            {cq.question}
                                          </p>
                                          <div className="flex flex-wrap gap-1.5">
                                            {cq.options.map((opt, oi) => (
                                              <button
                                                key={oi}
                                                type="button"
                                                disabled={sending}
                                                onClick={() =>
                                                  void sendMessage(
                                                    `${cq.question}\n${opt}`,
                                                  )
                                                }
                                                className="rounded-full border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
                                              >
                                                {opt}
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                {isLatestAssistant &&
                                  !isStreamingThis &&
                                  msg.followUpSuggestions &&
                                  msg.followUpSuggestions.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                      {msg.followUpSuggestions.map(
                                        (sug, si) => (
                                          <button
                                            key={si}
                                            type="button"
                                            disabled={sending}
                                            onClick={() =>
                                              void sendMessage(sug)
                                            }
                                            className="glass-pill inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs text-muted-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:text-foreground"
                                          >
                                            <Sparkles className="h-3 w-3 shrink-0 text-primary" />
                                            <span dir="auto">{sug}</span>
                                          </button>
                                        ),
                                      )}
                                    </div>
                                  )}
                              </>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}

                    {sending && (
                      <div className="flex items-start gap-3">
                        <TopovaMark size={30} className="hidden animate-pulse sm:block" />
                        <div className="flex-1 space-y-2 pt-1">
                          <div
                            role="status"
                            aria-live="polite"
                            className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-3.5 py-1.5 text-xs font-medium text-primary"
                          >
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>{liveStatus ?? thinkingPhases[thinkingTick]}</span>
                          </div>
                          {liveSteps.length > 0 && (
                            <ul className="space-y-1 ps-1 text-[11px] text-muted-foreground">
                              {liveSteps.map((s, i) => (
                                <li
                                  key={`${i}-${s}`}
                                  className="flex items-center gap-1.5 animate-in fade-in"
                                >
                                  <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {activeConv?.olderBefore ? (
                  <Button
                    variant="ghost"
                    disabled={sending}
                    onClick={() => void loadOlderMessages()}
                  >
                    {t("تحميل الرسائل الأقدم", "Load older messages")}
                  </Button>
                ) : null}
                {activeConv?.workspaceState && (
                  <div className="shrink-0">
                    <div
                      role="status"
                      aria-live="polite"
                      className={`flex-wrap items-center gap-2 px-4 py-1.5 text-xs text-muted-foreground sm:py-2 ${
                        save.status === "saved" ? "hidden sm:flex" : "flex"
                      }`}
                    >
                      <span>
                        {save.status === "saving"
                          ? t("جارٍ حفظ الرسم…", "Saving design…")
                          : save.status === "error"
                            ? t("لم تُحفظ التعديلات", "Changes are not saved")
                            : t("تم حفظ الرسم", "Design saved")}
                      </span>
                      {save.status === "error" && (
                        <>
                          <span role="alert">{save.error}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void save.flush().catch(() => {})}
                          >
                            {t("إعادة محاولة الحفظ", "Retry save")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              void save
                                .discard()
                                .catch((error: unknown) =>
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "Could not reload design.",
                                  ),
                                )
                            }
                          >
                            {t(
                              "تجاهل التعديل المحلي وتحميل المحفوظ",
                              "Discard local changes & reload saved design",
                            )}
                          </Button>
                        </>
                      )}
                    </div>
                    {save.status === "saved" && !sending && (
                      <DesignReview
                        key={activeConv.id}
                        conversation={activeConv}
                        onChange={(value) =>
                          setActiveConv((previous) =>
                            previous?.id === value.id ? value : previous,
                          )
                        }
                      />
                    )}
                  </div>
                )}
                {/* Bottom Docked Floating Glass Composer */}
                <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1.5 sm:px-6 sm:pb-4 sm:pt-2">
                  <ChatComposer
                    centered={false}
                    artifactOpen={artifactOpen}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    input={input}
                    setInput={setInput}
                    sending={sending}
                    engineMode={engineMode}
                    mode={mode}
                    setMode={setMode}
                    onSend={() => sendMessage()}
                    onStop={handleStopGeneration}
                    onFileSelect={handleFileSelect}
                    onTemplates={() => {
                      setPaletteTab("templates");
                      setPaletteOpen(true);
                    }}
                  />
                </div>
              </>
            )}
          </div>

          {/* Slide-Out Floating Frosted-Glass Artifact Drawer */}
          {artifactOpen && workspace && !artifactFullscreen && largeScreen && (
            <motion.section
              initial={{ opacity: 0, x: lang === "ar" ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="hidden w-[48%] min-w-[440px] max-w-[680px] shrink-0 p-2.5 ps-0 xl:block"
            >
              <div className="glass-panel h-full overflow-hidden rounded-2xl">
              <Suspense
                fallback={
                  <div className="grid h-full place-items-center text-xs text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                }
              >
                <ArtifactDrawer
                  workspace={workspace}
                  packetTrace={packetTrace}
                  attack={attack}
                  fullscreen={false}
                  onToggleFullscreen={() => setArtifactFullscreen(true)}
                  onWorkspaceChange={(next) => void handleWorkspaceUpdate(next)}
                  onPacketTraceChange={setPacketTrace}
                  onAttackChange={setAttack}
                  onOpenExport={() => setExportModalOpen(true)}
                  onClose={() => {
                    setArtifactOpen(false);
                    setArtifactFullscreen(false);
                  }}
                />
              </Suspense>
              </div>
            </motion.section>
          )}
        </div>
      </div>

      {/* Mobile/Tablet OR Desktop Full-Screen Artifact Overlay */}
      {artifactOpen && workspace && (artifactFullscreen || !largeScreen) && (
        <div
          className={`fixed inset-0 z-40 bg-background ${artifactFullscreen ? "" : "xl:hidden"}`}
        >
          <Suspense
            fallback={
              <div className="grid h-full place-items-center text-xs text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            }
          >
            <ArtifactDrawer
              workspace={workspace}
              packetTrace={packetTrace}
              attack={attack}
              fullscreen={artifactFullscreen}
              onToggleFullscreen={() => setArtifactFullscreen((v) => !v)}
              onWorkspaceChange={(next) => void handleWorkspaceUpdate(next)}
              onPacketTraceChange={setPacketTrace}
              onAttackChange={setAttack}
              onOpenExport={() => setExportModalOpen(true)}
              onClose={() => {
                setArtifactOpen(false);
                setArtifactFullscreen(false);
              }}
            />
          </Suspense>
        </div>
      )}

      {/* Cisco Packet Tracer Export Center Modal */}
      {workspace && exportModalOpen && (
        <Suspense fallback={null}>
          <PacketTracerExportModal
            open={exportModalOpen}
            onClose={() => setExportModalOpen(false)}
            projectName={workspace.projectName}
            topology={workspace.topology}
            plan={workspace.plan}
            acls={workspace.acls}
          />
        </Suspense>
      )}

      {/* Command Palette & Prompt Templates Modal */}
      <CommandPaletteModal
        open={paletteOpen}
        initialTab={paletteTab}
        conversations={conversations}
        onClose={() => setPaletteOpen(false)}
        onNewChat={handleNewChat}
        onSelectChat={(id) => navigate(`/chat/${encodeURIComponent(id)}`)}
        onPickTemplate={handlePickTemplate}
        onOpenExport={workspace ? () => setExportModalOpen(true) : undefined}
      />
    </div>
  );
}
