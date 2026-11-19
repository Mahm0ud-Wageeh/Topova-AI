import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import type { AgentWorkMode } from "@/context/profile-context";
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Network,
  Paperclip,
  Shield,
  Sparkles,
  Square,
  X,
  Zap,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type Dispatch,
  type DragEvent,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import type { PendingAttachment } from "./workspace-types";
const WORK_MODES: {
  id: AgentWorkMode;
  icon: typeof Sparkles;
  ar: string;
  en: string;
  descAr: string;
  descEn: string;
}[] = [
  {
    id: "auto",
    icon: Sparkles,
    ar: "تلقائي",
    en: "Auto",
    descAr: "توازن ذكي بين الحوار وتنفيذ الأدوات",
    descEn: "Balanced conversation & autonomous tools",
  },
  {
    id: "architect",
    icon: Network,
    ar: "معماري",
    en: "Architect",
    descAr: "تصميم شبكات عميق وأسئلة توضيحية",
    descEn: "Deep HA design & clarifying questions",
  },
  {
    id: "security",
    icon: Shield,
    ar: "أمان",
    en: "Security",
    descAr: "تدقيق ثغرات، اختراق جانبي، وعزل صفري",
    descEn: "Red-Team audits & Zero-Trust hardening",
  },
  {
    id: "executive",
    icon: Zap,
    ar: "ملخص",
    en: "Brief",
    descAr: "إجابات مركزة وجداول مقارنة سريعة",
    descEn: "Concise tables & executive summaries",
  },
];

interface ChatComposerProps {
  centered: boolean;
  artifactOpen: boolean;
  attachments: PendingAttachment[];
  setAttachments: Dispatch<SetStateAction<PendingAttachment[]>>;
  input: string;
  setInput: (value: string) => void;
  sending: boolean;
  engineMode: "local" | "external" | null;
  mode: AgentWorkMode;
  setMode: (value: AgentWorkMode) => void;
  onSend: () => Promise<void>;
  onStop: () => void;
  onFileSelect: (files: FileList | null) => Promise<void>;
  onTemplates: () => void;
}
export function ChatComposer({
  centered,
  artifactOpen,
  attachments,
  setAttachments,
  input,
  setInput,
  sending,
  engineMode,
  mode,
  setMode,
  onSend,
  onStop,
  onFileSelect,
  onTemplates,
}: ChatComposerProps) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (sending) setModeMenuOpen(false);
  }, [sending]);

  function detectPastedFilename(text: string): string {
    const trimmed = text.trim();
    if (/^[[{]/.test(trimmed)) {
      try {
        JSON.parse(trimmed);
        return `pasted-data-${Date.now().toString(36).slice(-4)}.json`;
      } catch {
        // not valid json
      }
    }
    if (
      /(^hostname\s+|^interface\s+|ip address\s+\d|router\s+(ospf|eigrp|bgp|rip)|switchport\s+mode)/im.test(
        trimmed,
      )
    ) {
      return `pasted-cisco-${Date.now().toString(36).slice(-4)}.cfg`;
    }
    return `pasted-content-${Date.now().toString(36).slice(-4)}.txt`;
  }

  function handlePaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const dt = e.clipboardData;
    if (!dt) return;

    // 1. Pasted images or files (e.g. screenshots, copied .cfg/.json/.png files)
    const files: File[] = [];
    for (const item of Array.from(dt.items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      const transfer = new DataTransfer();
      for (const f of files) transfer.items.add(f);
      void onFileSelect(transfer.files);
      return;
    }

    // 2. Long pasted text / multi-line Cisco configs / JSON / logs -> auto-attach cleanly
    const pastedText = dt.getData("text/plain");
    if (!pastedText) return;
    const lineCount = pastedText.split(/\r?\n/).length;
    const looksStructured =
      lineCount >= 8 &&
      (/(^hostname\s+|^interface\s+|ip address\s+\d|router\s+(ospf|eigrp|bgp|rip)|access-list\s+)/im.test(
        pastedText,
      ) ||
        /^[[{]/.test(pastedText.trim()));

    if (pastedText.length > 1200 || looksStructured) {
      e.preventDefault();
      if (attachments.length >= 4) {
        toast.error(
          t("الحد الأقصى 4 مرفقات لكل رسالة.", "Maximum 4 attachments per message."),
        );
        return;
      }
      const name = detectPastedFilename(pastedText);
      setAttachments((prev) =>
        [
          ...prev,
          {
            name,
            mimeType: name.endsWith(".json") ? "application/json" : "text/plain",
            content: pastedText.slice(0, 128_000),
          },
        ].slice(0, 4),
      );
      toast.success(
        t(
          `تم لصق المحتوى تلقائياً كمرفق جاهز للتحليل (${name})`,
          `Pasted content attached for deep analysis (${name})`,
        ),
      );
    }
  }

  function handleDragOver(e: DragEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dragging) setDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLFormElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLFormElement>) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files?.length) {
      void onFileSelect(e.dataTransfer.files);
    }
  }

  const activeModeObj =
    WORK_MODES.find((item) => item.id === mode) ?? WORK_MODES[0];
  const ActiveModeIcon = activeModeObj.icon;
  return (
    <div
      className={
        centered
          ? "w-full max-w-3xl"
          : `mx-auto w-full ${artifactOpen ? "" : "max-w-5xl"}`
      }
    >
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {attachments.map((att, idx) => {
            const isImage =
              att.mimeType.startsWith("image/") ||
              att.content.startsWith("data:image/");
            return (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 rounded-xl border bg-muted/70 px-2.5 py-1 font-mono text-[11px]"
              >
                {isImage ? (
                  <img
                    src={att.content}
                    alt={att.name}
                    className="h-5 w-5 rounded object-cover"
                  />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-primary" />
                )}
                <span className="max-w-[160px] truncate">{att.name}</span>
                <button
                  type="button"
                  aria-label={t("إزالة المرفق", "Remove attachment")}
                  onClick={() =>
                    setAttachments((prev) => prev.filter((_, i) => i !== idx))
                  }
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {engineMode && (
        <p
          className="mb-2 text-xs leading-relaxed text-muted-foreground"
          role="status"
        >
          {engineMode === "local"
            ? t(
                "وضع محلي: تحليل بالقواعد وفحص المرفقات؛ الذاكرة الحوارية والتعليمات الحرة غير متاحتين.",
                "Local mode: rules and attachment inspection; conversational memory and free-form instructions are unavailable.",
              )
            : t(
                "الذكاء الاصطناعي الخارجي مفعّل: قد تُرسل المرفقات وسياق الحساب إلى المزوّد.",
                "External AI is enabled: attachments and profile context may be sent to the provider.",
              )}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSend();
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`glass-panel relative rounded-[26px] transition-all duration-200 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15 ${
          dragging ? "border-primary ring-2 ring-primary/30 scale-[1.005]" : ""
        } ${centered ? "p-3.5" : "p-2.5"}`}
      >
        <textarea
          aria-label={t("رسالتك", "Your message")}
          rows={centered ? 3 : 2}
          dir="auto"
          value={input}
          disabled={sending}
          onPaste={handlePaste}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
          placeholder={t(
            "اكتب سؤالك، أو الصق أي إعدادات سيسكو أو لقطة شاشة أو ملف مباشرة (Ctrl+V)...",
            "Ask anything, or paste any Cisco config, screenshot, or file directly (Ctrl+V)...",
          )}
          className="w-full resize-none bg-transparent px-2.5 py-1.5 text-[15px] leading-relaxed placeholder:text-muted-foreground/70 focus:outline-none"
        />

        <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept=".cfg,.txt,.json,.yaml,.yml,.csv,.conf,.log,.png,.jpg,.jpeg,.webp,image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void onFileSelect(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              title={t(
                "إرفاق ملف إعدادات أو صورة",
                "Attach config, text, or screenshot",
              )}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            {attachments.some(
              (a) =>
                a.mimeType.startsWith("image/") ||
                a.content.startsWith("data:image/"),
            ) && (
              <span className="hidden items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground sm:inline-flex">
                <ImageIcon className="h-3 w-3 text-primary" />
                {t("تحليل بصري جاهز", "Vision ready")}
              </span>
            )}

            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
              onClick={onTemplates}
              title={t("مكتبة القوالب", "Prompt Templates")}
            >
              <BookOpen className="h-4 w-4" />
            </Button>

            {/* Sleek Custom Floating Mode Pill (replaces clunky <select>) */}
            <div className="relative">
              <button
                type="button"
                aria-expanded={modeMenuOpen}
                aria-label={t("وضع المحادثة", "Chat mode")}
                onClick={() => setModeMenuOpen((v) => !v)}
                className="glass-pill inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground transition-all hover:border-primary/40"
              >
                <ActiveModeIcon className="h-3.5 w-3.5 text-primary" />
                <span>{t(activeModeObj.ar, activeModeObj.en)}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>

              {modeMenuOpen && (
                <div
                  className={`glass-panel absolute start-0 z-30 w-64 rounded-2xl p-1.5 ${
                    centered ? "top-10" : "bottom-10"
                  }`}
                >
                  {WORK_MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setMode(m.id);
                        setModeMenuOpen(false);
                      }}
                      className={`flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-start transition-colors ${
                        mode === m.id
                          ? "bg-primary/15 text-primary"
                          : "hover:bg-muted"
                      }`}
                    >
                      <m.icon className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold">{t(m.ar, m.en)}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {t(m.descAr, m.descEn)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {sending ? (
            <button
              type="button"
              onClick={onStop}
              aria-label={t("إيقاف التوليد", "Stop generation")}
              title={t("إيقاف التوليد", "Stop generation")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-md transition-all hover:opacity-90"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim() && attachments.length === 0}
              aria-label={t("إرسال", "Send")}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
