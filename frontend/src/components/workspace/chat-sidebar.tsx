import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen,
  Check,
  LogIn,
  LogOut,
  MessageSquare,
  Network,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Trash2,
  User,
  X,
} from "lucide-react";
import { TopovaLogo } from "@/components/brand/topova-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useProfile } from "@/context/profile-context";
import type { ConversationSummary } from "./workspace-types";

const AVATAR_BG: Record<string, string> = {
  blue: "from-blue-500 to-sky-500",
  cyan: "from-cyan-500 to-teal-500",
  emerald: "from-emerald-500 to-green-500",
  violet: "from-violet-500 to-purple-500",
};

interface ChatSidebarProps {
  nextOffset?: number | null;
  onLoadMore?: () => void;
  loadError?: boolean;
  onRetry?: () => void;
  conversations: ConversationSummary[];
  activeId: string | null;
  search: string;
  onSearchChange: (q: string) => void;
  onNewChat: () => void;
  onSelectChat: (id: string) => void;
  onRenameChat: (id: string, title: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onDeleteChat: (id: string) => void;
  onOpenTemplates: () => void;
  onCloseMobile?: () => void;
}

export function ChatSidebar({
  nextOffset,
  onLoadMore,
  loadError,
  onRetry,
  conversations,
  activeId,
  search,
  onSearchChange,
  onNewChat,
  onSelectChat,
  onRenameChat,
  onTogglePin,
  onDeleteChat,
  onOpenTemplates,
  onCloseMobile,
}: ChatSidebarProps) {
  const { t } = useLanguage();
  const { user, logout } = useAuth();
  const { profile } = useProfile();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "topologies">("all");

  const filtered =
    filterMode === "topologies"
      ? conversations.filter((c) => c.hasTopology)
      : conversations;
  const topologyCount = conversations.filter((c) => c.hasTopology).length;

  const pinned = filtered.filter((c) => c.pinned);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const today = filtered.filter(
    (c) => !c.pinned && new Date(c.updatedAt) >= startOfToday,
  );
  const earlier = filtered.filter(
    (c) => !c.pinned && new Date(c.updatedAt) < startOfToday,
  );

  const displayName =
    profile?.displayName ||
    user?.name ||
    t("مهندس شبكات (ضيف)", "Network Engineer");
  const initials =
    displayName
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "NT";
  const avatarBg = AVATAR_BG[profile?.avatarColor ?? "blue"] ?? AVATAR_BG.blue;

  function startEdit(c: ConversationSummary) {
    setEditingId(c.id);
    setEditTitle(c.title);
  }

  function commitEdit(id: string) {
    const trimmed = editTitle.trim();
    if (trimmed) onRenameChat(id, trimmed);
    setEditingId(null);
  }

  function renderGroup(label: string, items: ConversationSummary[]) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        <p className="px-2.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
          {label}
        </p>
        {items.map((c) => {
          const active = c.id === activeId;
          const isEditing = editingId === c.id;
          return (
            <div
              key={c.id}
              className={`group relative flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs transition-all duration-200 ${
                active
                  ? "glass-active-item font-semibold"
                  : "text-foreground/75 hover:bg-white/25 hover:text-foreground dark:hover:bg-white/10"
              }`}
            >
              {isEditing ? (
                <div className="flex flex-1 items-center gap-1">
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit(c.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-8 flex-1 rounded border bg-background px-1.5 text-base text-foreground focus:border-primary focus:outline-none md:h-6 md:text-xs"
                  />
                  <button
                    type="button"
                    aria-label={t("حفظ الاسم", "Save name")}
                    onClick={() => commitEdit(c.id)}
                    className="grid h-6 w-6 place-items-center rounded text-emerald-400 hover:bg-muted"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("إلغاء إعادة التسمية", "Cancel rename")}
                    onClick={() => setEditingId(null)}
                    className="grid h-6 w-6 place-items-center rounded text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectChat(c.id);
                      onCloseMobile?.();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-start"
                  >
                    {c.hasTopology ? (
                      <Network
                        className={`h-3.5 w-3.5 shrink-0 ${active ? "text-cyan" : "text-cyan/70"}`}
                      />
                    ) : (
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    )}
                    <span dir="auto" className="truncate">
                      {c.title}
                    </span>
                  </button>

                  <div className={`shrink-0 items-center gap-0.5 ${active ? "flex" : "hidden"} md:hidden md:group-hover:flex md:group-focus-within:flex`}>
                    <button
                      type="button"
                      onClick={() => onTogglePin(c.id, !c.pinned)}
                      title={
                        c.pinned
                          ? t("إلغاء التثبيت", "Unpin")
                          : t("تثبيت", "Pin")
                      }
                      className="grid h-8 w-8 md:h-6 md:w-6 place-items-center rounded hover:bg-background/80"
                    >
                      {c.pinned ? (
                        <PinOff className="h-3.5 w-3.5 md:h-3 md:w-3 text-amber-400" />
                      ) : (
                        <Pin className="h-3.5 w-3.5 md:h-3 md:w-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => startEdit(c)}
                      title={t("إعادة تسمية", "Rename")}
                      className="grid h-8 w-8 md:h-6 md:w-6 place-items-center rounded hover:bg-background/80"
                    >
                      <Pencil className="h-3.5 w-3.5 md:h-3 md:w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteChat(c.id)}
                      title={t("حذف", "Delete")}
                      className="grid h-8 w-8 md:h-6 md:w-6 place-items-center rounded text-destructive/80 hover:bg-destructive/15 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5 md:h-3 md:w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="glass-panel flex h-full flex-col overflow-hidden rounded-2xl">
      {/* Top Brand + New Chat */}
      <div className="shrink-0 space-y-2.5 border-b border-border/50 p-3">
        <div className="flex items-center justify-between gap-2">
          <Link to="/chat" className="flex items-center">
            <TopovaLogo size={28} compact />
          </Link>

          {onCloseMobile && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-xl lg:hidden"
              onClick={onCloseMobile}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Button
          onClick={() => {
            onNewChat();
            onCloseMobile?.();
          }}
          className="h-9 w-full justify-between gap-2 rounded-xl shadow-sm"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <Plus className="h-4 w-4" />
            {t("محادثة جديدة", "New Chat")}
          </span>
          <kbd
            dir="ltr"
            className="hidden rounded-md bg-white/15 px-1.5 py-0.5 font-mono text-[10px] sm:inline"
          >
            Ctrl+Shift+O
          </kbd>
        </Button>

        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("ابحث في المحادثات...", "Search conversations...")}
            className="h-8 w-full rounded-xl border border-border/60 bg-background/50 pe-2.5 ps-8 text-xs backdrop-blur-sm transition-colors focus:border-primary/60 focus:bg-background/80 focus:outline-none"
          />
        </div>

        {/* Smart Filter Switcher */}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted/50 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setFilterMode("all")}
            className={`rounded-lg py-1 font-medium transition-all ${
              filterMode === "all"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("الكل", "All")} ({conversations.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode("topologies")}
            className={`rounded-lg py-1 font-medium transition-all ${
              filterMode === "topologies"
                ? "bg-card text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("المخططات", "Topologies")} ({topologyCount})
          </button>
        </div>
      </div>

      {/* Scrollable Conversations List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2">
        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground space-y-1">
            <MessageSquare className="mx-auto h-6 w-6 opacity-35" />
            <p>
              {filterMode === "topologies"
                ? t("لا توجد محادثات بمخططات بعد.", "No topology threads yet.")
                : t("لا توجد محادثات محفوظة بعد.", "No saved conversations yet.")}
            </p>
            <p className="text-[11px] opacity-75">
              {t(
                "ابدأ الكتابة وسنحفظ محادثتك ومخططاتك تلقائياً.",
                "Start chatting to auto-save threads & topologies.",
              )}
            </p>
          </div>
        ) : (
          <>
            {renderGroup(t("المثبّتة", "Pinned"), pinned)}
            {renderGroup(t("اليوم", "Today"), today)}
            {renderGroup(t("السابقة", "Earlier"), earlier)}
          </>
        )}
      </div>

      {/* Quick Templates Trigger */}
      <div className="shrink-0 border-t border-border/50 px-2.5 py-2">
        <button
          type="button"
          onClick={() => {
            onOpenTemplates();
            onCloseMobile?.();
          }}
          className="glass-pill flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground"
        >
          <BookOpen className="h-4 w-4 text-primary" />
          {t("مكتبة القوالب الهندسية", "Engineering Templates")}
        </button>
      </div>

      {/* Bottom Profile & Settings Bar */}
      <div className="shrink-0 border-t border-border/50 bg-background/30 p-2.5">
        <div className="flex items-center gap-2">
          <Link
            to="/profile"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-muted"
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${avatarBg} font-display text-xs font-bold text-white shadow`}
            >
              {initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-foreground">
                {displayName}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {user
                  ? profile?.roleTitle || user.email
                  : t("وضع الضيف النشط", "Guest Mode")}
              </p>
            </div>
          </Link>

          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title={t("الملف الشخصي", "Profile")}
            >
              <Link to="/profile">
                <User className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button
              asChild
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title={t("الإعدادات", "Settings")}
            >
              <Link to="/settings">
                <Settings className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {user ? (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => void logout().catch(() => {})}
                title={t("تسجيل الخروج", "Sign out")}
              >
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                asChild
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-primary"
                title={t("تسجيل الدخول", "Sign in")}
              >
                <Link to="/auth">
                  <LogIn className="h-3.5 w-3.5" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>
      {loadError && (
        <div role="alert" className="p-3 text-xs">
          {t("تعذر تحميل المحادثات.", "Could not load conversations.")}
          <Button variant="ghost" onClick={onRetry}>
            {t("إعادة المحاولة", "Retry")}
          </Button>
        </div>
      )}
      {nextOffset != null && (
        <Button className="m-2 shrink-0" variant="outline" onClick={onLoadMore}>
          {t("تحميل المزيد", "Load more")}
        </Button>
      )}
    </div>
  );
}
