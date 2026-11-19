import { Modal } from "@/components/ui/modal";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Download,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import {
  PROMPT_TEMPLATES,
  type ConversationSummary,
  type PromptTemplateItem,
} from "./workspace-types";

interface CommandPaletteModalProps {
  open: boolean;
  initialTab?: "commands" | "templates";
  conversations: ConversationSummary[];
  onClose: () => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onPickTemplate: (tpl: PromptTemplateItem) => void;
  onOpenExport?: () => void;
}

export function CommandPaletteModal({
  open,
  initialTab = "commands",
  conversations,
  onClose,
  onNewChat,
  onSelectChat,
  onPickTemplate,
  onOpenExport,
}: CommandPaletteModalProps) {
  const { lang, t } = useLanguage();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"commands" | "templates">(initialTab);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setQuery("");
    }
  }, [open, initialTab]);

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PROMPT_TEMPLATES;
    return PROMPT_TEMPLATES.filter(
      (item) =>
        item.titleAr.toLowerCase().includes(q) ||
        item.titleEn.toLowerCase().includes(q) ||
        item.descAr.toLowerCase().includes(q) ||
        item.descEn.toLowerCase().includes(q),
    );
  }, [query]);

  const filteredChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations.slice(0, 6);
    return conversations
      .filter((c) => c.title.toLowerCase().includes(q))
      .slice(0, 8);
  }, [conversations, query]);

  if (!open) return null;

  return (
    <Modal
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-4 pt-16 backdrop-blur-sm"
      open={open}
      onClose={onClose}
      label="Search conversations and commands"
    >
      <div
        className="flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            aria-label={t("بحث", "Search")}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              "ابحث عن محادثة، قالب شبكات، أو أمر سريع...",
              "Search conversations, engineering templates, or quick actions...",
            )}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Mode Tabs */}
        <div className="flex gap-1 border-b bg-muted/30 px-4 py-2">
          <button
            type="button"
            onClick={() => setTab("commands")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold ${
              tab === "commands"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {t("أوامر سريعة ومحادثات", "Quick Actions & Chats")}
          </button>
          <button
            type="button"
            onClick={() => setTab("templates")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold ${
              tab === "templates"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            {t("مكتبة القوالب الهندسية", "Engineering Templates")}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {tab === "commands" ? (
            <>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    onNewChat();
                    onClose();
                  }}
                  className="flex items-center gap-2.5 rounded-xl border bg-background/60 p-2.5 text-start text-xs hover:border-primary/50 hover:bg-primary/5"
                >
                  <Plus className="h-4 w-4 text-primary" />
                  <span className="font-semibold">
                    {t("بدء محادثة جديدة", "Start New Chat")}
                  </span>
                </button>
                {onOpenExport && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenExport();
                      onClose();
                    }}
                    className="flex items-center gap-2.5 rounded-xl border bg-background/60 p-2.5 text-start text-xs hover:border-primary/50 hover:bg-primary/5"
                  >
                    <Download className="h-4 w-4 text-cyan" />
                    <span className="font-semibold">
                      {t(
                        "تصدير سيسكو باكت تريسر",
                        "Export Cisco Packet Tracer",
                      )}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    navigate("/profile");
                    onClose();
                  }}
                  className="flex items-center gap-2.5 rounded-xl border bg-background/60 p-2.5 text-start text-xs hover:border-primary/50 hover:bg-primary/5"
                >
                  <User className="h-4 w-4 text-emerald-400" />
                  <span className="font-semibold">
                    {t("الملف الشخصي والإحصاءات", "Engineer Profile & Stats")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigate("/settings");
                    onClose();
                  }}
                  className="flex items-center gap-2.5 rounded-xl border bg-background/60 p-2.5 text-start text-xs hover:border-primary/50 hover:bg-primary/5"
                >
                  <Settings className="h-4 w-4 text-amber-400" />
                  <span className="font-semibold">
                    {t(
                      "الإعدادات والذاكرة المخصصة",
                      "Settings & Custom Memory",
                    )}
                  </span>
                </button>
              </div>

              {filteredChats.length > 0 && (
                <div className="space-y-1.5">
                  <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {t("المحادثات الأخيرة", "Recent Conversations")}
                  </p>
                  {filteredChats.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSelectChat(c.id);
                        onClose();
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border bg-background/50 px-3 py-2 text-start text-xs hover:border-primary/40 hover:bg-muted/60"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span dir="auto" className="truncate font-medium">
                          {c.title}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {c.messageCount} {t("رسالة", "msgs")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {filteredTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    onPickTemplate(tpl);
                    onClose();
                  }}
                  className="flex flex-col items-start gap-1.5 rounded-xl border bg-background/60 p-3 text-start transition-all hover:border-primary/60 hover:bg-primary/5"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {lang === "ar" ? tpl.categoryAr : tpl.categoryEn}
                    </Badge>
                    <Sparkles className="h-3.5 w-3.5 text-cyan" />
                  </div>
                  <p className="text-xs font-bold text-foreground">
                    {lang === "ar" ? tpl.titleAr : tpl.titleEn}
                  </p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {lang === "ar" ? tpl.descAr : tpl.descEn}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
