import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import type { AgentWorkMode } from "@/context/profile-context";
import {
  ArrowUp,
  BookOpen,
  ChevronDown,
  FileText,
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
  type Dispatch,
  type SetStateAction,
} from "react";
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
  useEffect(() => {
    if (sending) setModeMenuOpen(false);
  }, [sending]);
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
          {attachments.map((att, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted/70 px-3 py-1 font-mono text-[11px]"
            >
              <FileText className="h-3.5 w-3.5 text-cyan" />
              <span>{att.name}</span>
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
          ))}
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
        className={`relative rounded-3xl border bg-card/90 transition-all focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15 ${
          centered
            ? "p-3 shadow-2xl backdrop-blur-xl"
            : "p-2.5 shadow-lg backdrop-blur-xl"
        }`}
      >
        <textarea
          aria-label={t("رسالتك", "Your message")}
          rows={centered ? 3 : 2}
          dir="auto"
          value={input}
          disabled={sending}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void onSend();
            }
          }}
          placeholder={t(
            "اسأل Topova AI أي شيء، أو صف شبكتك لتصميمها وتصديرها إلى Packet Tracer...",
            "Ask Topova AI anything, or describe a network to architect & export to Packet Tracer...",
          )}
          className="w-full resize-none bg-transparent px-2.5 py-1.5 text-[15px] leading-relaxed placeholder:text-muted-foreground/70 focus:outline-none"
        />

        <div className="mt-1.5 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept=".cfg,.txt,.json,.yaml,.yml,.csv,.conf"
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
              title={t("إرفاق ملف إعدادات", "Attach config or text file")}
            >
              <Paperclip className="h-4 w-4" />
            </Button>

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
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-muted/50 px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
              >
                <ActiveModeIcon className="h-3.5 w-3.5 text-cyan" />
                <span>{t(activeModeObj.ar, activeModeObj.en)}</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>

              {modeMenuOpen && (
                <div
                  className={`absolute start-0 z-30 w-64 rounded-2xl border bg-popover p-1.5 shadow-2xl ${
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
              disabled={!input.trim()}
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
