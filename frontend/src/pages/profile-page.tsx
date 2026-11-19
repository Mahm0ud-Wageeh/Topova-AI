import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Building2,
  LogIn,
  MessageSquare,
  Network,
  Pin,
  Save,
  Settings,
  Sparkles,
  User,
} from "lucide-react";
import { apiRequest } from "@/api/client";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import type { ConversationSummary } from "@/components/workspace/workspace-types";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useProfile, type AccentTheme } from "@/context/profile-context";

const AVATAR_COLORS: { id: AccentTheme; label: string; bg: string }[] = [
  { id: "blue", label: "Electric Blue", bg: "from-blue-500 to-sky-500" },
  { id: "cyan", label: "Cyber Cyan", bg: "from-cyan-500 to-teal-500" },
  { id: "emerald", label: "Emerald NOC", bg: "from-emerald-500 to-green-500" },
  { id: "violet", label: "Royal Violet", bg: "from-violet-500 to-purple-500" },
];

export function ProfilePage() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { profile, stats, updateProfile } = useProfile();

  const [displayName, setDisplayName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [bio, setBio] = useState("");
  const [avatarColor, setAvatarColor] = useState<AccentTheme>("blue");
  const [saving, setSaving] = useState(false);
  const [pinnedChats, setPinnedChats] = useState<ConversationSummary[]>([]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setRoleTitle(profile.roleTitle);
      setOrganization(profile.organization);
      setBio(profile.bio);
      setAvatarColor(profile.avatarColor);
    }
  }, [profile]);

  useEffect(() => {
    apiRequest<{ conversations: ConversationSummary[] }>("/api/v1/conversations")
      .then(({ conversations }) => {
        setPinnedChats(conversations.filter((c) => c.pinned).slice(0, 6));
      })
      .catch(() => {});
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({ displayName, roleTitle, organization, bio, avatarColor });
      toast.success(t("تم حفظ الملف الشخصي بنجاح.", "Profile updated successfully."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("تعذر الحفظ", "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  const initials =
    (displayName || user?.name || "NT")
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "NT";
  const activeBg = AVATAR_COLORS.find((c) => c.id === avatarColor)?.bg ?? AVATAR_COLORS[0].bg;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="container flex-1 py-8 space-y-6 max-w-5xl">
        {/* Profile Hero Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-gradient-to-r from-primary/10 via-card to-cyan/10 p-6">
          <div className="flex items-center gap-4">
            <div
              className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${activeBg} font-display text-2xl font-bold text-white shadow-lg`}
            >
              {initials}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold">{displayName || t("مهندس شبكات", "Network Engineer")}</h1>
                <Badge variant={user ? "success" : "secondary"}>
                  {user ? t("حساب موثّق", "Registered Account") : t("وضع الضيف", "Guest Mode")}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {roleTitle || t("مهندس معماري للشبكات", "Network Architect")}
                {organization ? ` · ${organization}` : ""}
              </p>
              {user?.email && <p className="font-mono text-xs text-muted-foreground mt-0.5">{user.email}</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link to="/settings">
                <Settings className="h-4 w-4" />
                {t("الإعدادات والذاكرة", "Settings & AI Memory")}
              </Link>
            </Button>
            <Button asChild size="sm" className="gap-1.5">
              <Link to="/chat">
                <Sparkles className="h-4 w-4" />
                {t("العودة للمحادثة", "Back to AI Chat")}
              </Link>
            </Button>
          </div>
        </div>

        {/* Engineering Activity Stats */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("المحادثات الذكية", "AI Conversations")}</p>
                <p className="mt-1 font-display text-2xl font-bold">{stats?.conversationCount ?? 0}</p>
              </div>
              <MessageSquare className="h-8 w-8 text-primary/70" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("إجمالي الرسائل", "Total Messages")}</p>
                <p className="mt-1 font-display text-2xl font-bold">{stats?.totalMessages ?? 0}</p>
              </div>
              <Sparkles className="h-8 w-8 text-cyan/70" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("المحادثات المثبّتة", "Pinned Threads")}</p>
                <p className="mt-1 font-display text-2xl font-bold">{stats?.pinnedConversationCount ?? 0}</p>
              </div>
              <Pin className="h-8 w-8 text-amber-400/70" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-xs text-muted-foreground">{t("الأجهزة المصمّمة", "Devices Architected")}</p>
                <p className="mt-1 font-display text-2xl font-bold">{stats?.totalDevicesArchitected ?? 0}</p>
              </div>
              <Network className="h-8 w-8 text-violet-400/70" />
            </CardContent>
          </Card>
        </div>

        {/* Profile Form + Pinned Threads */}
        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-primary" />
                {t("تعديل بيانات الملف الشخصي", "Edit Engineer Profile")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => void handleSave(e)} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">{t("الاسم المعروض", "Display Name")}</label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder={t("مثال: م. محمود", "e.g. Eng. Mahmoud")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold">{t("اللقب الهندسي", "Engineering Role")}</label>
                    <Input
                      value={roleTitle}
                      onChange={(e) => setRoleTitle(e.target.value)}
                      placeholder={t("مهندس شبكات / أمن سيبراني", "Senior Network Architect")}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("الجامعة أو الشركة", "Organization / University")}
                  </label>
                  <Input
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder={t("اختياري", "Optional")}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold">{t("نبذة مختصرة", "Short Bio")}</label>
                  <Textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={t("تخصصك أو مجالات اهتمامك في الشبكات...", "Your networking focus areas...")}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold">{t("لون الصورة الرمزية", "Avatar Accent")}</label>
                  <div className="flex flex-wrap gap-2">
                    {AVATAR_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setAvatarColor(c.id)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-medium ${
                          avatarColor === c.id ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        <span className={`h-3.5 w-3.5 rounded-full bg-gradient-to-br ${c.bg}`} />
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button type="submit" disabled={saving} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? t("جاري الحفظ...", "Saving...") : t("حفظ التغييرات", "Save Profile")}
                </Button>
              </form>
            </CardContent>
          </Card>

          <div className="space-y-4 lg:col-span-5">
            {!user && (
              <Card className="border-primary/40 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t("ترقية جلسة الضيف إلى حساب دائم", "Sync Your Guest Workspace")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-xs text-muted-foreground">
                  <p>
                    {t(
                      "أنت تعمل حالياً بوضع الضيف. يمكنك إنشاء حساب مجاني في ثوانٍ وسيتم نقل كل محادثاتك وملفك ومشاريعك تلقائياً.",
                      "You're currently in Guest Mode. Create a free account anytime to automatically migrate all your chats, profile, and projects.",
                    )}
                  </p>
                  <Button asChild size="sm" className="w-full gap-1.5">
                    <Link to="/auth">
                      <LogIn className="h-3.5 w-3.5" />
                      {t("تسجيل الدخول / إنشاء حساب", "Sign In / Register")}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Pin className="h-4 w-4 text-amber-400" />
                  {t("المحادثات المثبّتة", "Pinned Conversations")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pinnedChats.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    {t("لا توجد محادثات مثبّتة حالياً.", "No pinned conversations yet.")}
                  </p>
                ) : (
                  pinnedChats.map((c) => (
                    <Link
                      key={c.id}
                      to={`/chat/${encodeURIComponent(c.id)}`}
                      className="flex items-center justify-between rounded-xl border bg-muted/20 px-3 py-2 text-xs hover:border-primary/50"
                    >
                      <span dir="auto" className="truncate font-medium">
                        {c.title}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {c.messageCount}
                      </Badge>
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
