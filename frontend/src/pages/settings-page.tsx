import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Brain,
  Globe,
  Keyboard,
  Moon,
  Palette,
  Plus,
  Save,
  Settings,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { useLanguage } from "@/context/language-context";
import {
  useProfile,
  type AccentTheme,
  type AgentWorkMode,
  type UserPreferences,
} from "@/context/profile-context";
import { useTheme } from "@/context/theme-context";

const ACCENT_PALETTES: { id: AccentTheme; labelAr: string; labelEn: string; swatch: string }[] = [
  { id: "blue", labelAr: "أزرق كهربائي", labelEn: "Electric Blue", swatch: "bg-blue-500" },
  { id: "cyan", labelAr: "سماوي سيبراني", labelEn: "Cyber Cyan", swatch: "bg-cyan-500" },
  { id: "emerald", labelAr: "أخضر هندسي", labelEn: "Emerald NOC", swatch: "bg-emerald-500" },
  { id: "violet", labelAr: "بنفسجي ملكي", labelEn: "Royal Violet", swatch: "bg-violet-500" },
];

export function SettingsPage() {
  const { lang, toggleLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { profile, updateProfile } = useProfile();

  const [customInstructions, setCustomInstructions] = useState("");
  const [memoryNotes, setMemoryNotes] = useState<string[]>([]);
  const [newMemory, setNewMemory] = useState("");
  const [prefs, setPrefs] = useState<UserPreferences>({
    defaultMode: "auto",
    defaultRouting: "OSPF",
    autoVlan: true,
    autoApplyCanvas: true,
    showThinkingByDefault: false,
    accentTheme: "blue",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setCustomInstructions(profile.customInstructions);
      setMemoryNotes(profile.memoryNotes);
      setPrefs(profile.preferences);
    }
  }, [profile]);

  function addMemory() {
    const cleaned = newMemory.trim();
    if (!cleaned || memoryNotes.length >= 12) return;
    setMemoryNotes((prev) => [...prev, cleaned]);
    setNewMemory("");
  }

  async function saveAll() {
    setSaving(true);
    try {
      await updateProfile({
        customInstructions,
        memoryNotes,
        preferences: prefs,
      });
      toast.success(t("تم حفظ جميع الإعدادات والذاكرة المخصصة.", "Settings & custom AI memory saved."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("تعذر الحفظ", "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="container flex-1 py-8 space-y-6 max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold flex items-center gap-2">
              <Settings className="h-6 w-6 text-primary" />
              {t("إعدادات المنصة وتخصيص المساعد الذكي", "Platform Settings & AI Personalization")}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                "خصص طريقة تفكير المساعد، والذاكرة الهندسية الدائمة، ومعايير الشبكات الافتراضية، ومظهر المنصة.",
                "Customize assistant instructions, persistent engineering memory, default network standards, and visual theme.",
              )}
            </p>
          </div>

          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/chat">{t("العودة للمحادثة", "Back to Chat")}</Link>
            </Button>
            <Button size="sm" disabled={saving} onClick={() => void saveAll()} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? t("جاري الحفظ...", "Saving...") : t("حفظ الإعدادات", "Save Settings")}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* AI Personalization & Memory */}
          <Card className="lg:col-span-7">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Brain className="h-4 w-4 text-cyan" />
                {t("التعليمات المخصصة والذاكرة الهندسية", "Custom Instructions & Persistent Memory")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">
                  {t("كيف تريد أن يتعامل معك المساعد الذكي؟", "Custom Instructions for Topova AI")}
                </label>
                <Textarea
                  rows={4}
                  dir="auto"
                  maxLength={1500}
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder={t(
                    "مثال: ركّز دائماً على أفضل ممارسات Cisco Enterprise، واشرح الإجابات بالعربية مع جداول مختصرة وقابلة للعرض في مشروع التخرج...",
                    "e.g. Always prioritize Cisco Enterprise best practices, include concise comparison tables, and highlight security trade-offs...",
                  )}
                />
              </div>

              <div className="space-y-2.5">
                <label className="text-xs font-semibold flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  {t("ذاكرة المهندس الدائمة (يتذكرها المساعد في كل محادثة)", "Persistent Engineer Memory Notes")}
                </label>
                <div className="flex gap-2">
                  <Input
                    dir="auto"
                    value={newMemory}
                    onChange={(e) => setNewMemory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addMemory();
                      }
                    }}
                    placeholder={t("مثال: افصل كاميرات المراقبة دائماً في VLAN 30", "e.g. Always isolate CCTV in VLAN 30")}
                  />
                  <Button type="button" variant="secondary" size="sm" onClick={addMemory} className="gap-1">
                    <Plus className="h-4 w-4" />
                    {t("إضافة", "Add")}
                  </Button>
                </div>

                {memoryNotes.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-3 text-center text-xs text-muted-foreground">
                    {t("أضف ملاحظاتك وتفضيلاتك الهندسية ليتذكرها المساعد تلقائياً في كل جلسة.", "Add persistent facts or preferences for the assistant to remember across chats.")}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {memoryNotes.map((note, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 rounded-xl border bg-muted/25 px-3 py-2 text-xs"
                      >
                        <span dir="auto">{note}</span>
                        <button
                          type="button"
                          onClick={() => setMemoryNotes((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right Column: Engineering Defaults + Appearance + Shortcuts */}
          <div className="space-y-5 lg:col-span-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sliders className="h-4 w-4 text-primary" />
                  {t("المعايير الهندسية الافتراضية", "Engineering Defaults")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3.5 text-xs">
                <div className="space-y-1.5">
                  <label className="font-semibold">{t("وضع العمل الافتراضي", "Default Agent Mode")}</label>
                  <select
                    value={prefs.defaultMode}
                    onChange={(e) => setPrefs((p) => ({ ...p, defaultMode: e.target.value as AgentWorkMode }))}
                    className="h-9 w-full rounded-lg border bg-background px-2.5 text-xs"
                  >
                    <option value="auto">{t("الوكيل الذكي التلقائي", "Auto Agent")}</option>
                    <option value="architect">{t("مهندس معماري عميق", "Deep Architect")}</option>
                    <option value="security">{t("فاحص أمان واختراق", "Security & Red-Team")}</option>
                    <option value="executive">{t("ملخص تنفيذي سريع", "Executive Brief")}</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="font-semibold">{t("بروتوكول التوجيه الافتراضي", "Default Routing Protocol")}</label>
                  <select
                    value={prefs.defaultRouting}
                    onChange={(e) =>
                      setPrefs((p) => ({
                        ...p,
                        defaultRouting: e.target.value as UserPreferences["defaultRouting"],
                      }))
                    }
                    className="h-9 w-full rounded-lg border bg-background px-2.5 text-xs font-mono"
                  >
                    <option value="OSPF">OSPF</option>
                    <option value="EIGRP">EIGRP</option>
                    <option value="BGP">BGP</option>
                    <option value="STATIC">STATIC</option>
                  </select>
                </div>

                <label className="flex items-center justify-between rounded-xl border bg-muted/20 p-2.5 cursor-pointer">
                  <span>{t("تفعيل عزل VLANs تلقائياً", "Auto-enable VLAN segmentation")}</span>
                  <input
                    type="checkbox"
                    checked={prefs.autoVlan}
                    onChange={(e) => setPrefs((p) => ({ ...p, autoVlan: e.target.checked }))}
                    className="h-4 w-4 accent-primary"
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border bg-muted/20 p-2.5 cursor-pointer">
                  <span>{t("فتح خطوات التفكير تلقائياً في الردود", "Expand Thinking accordion by default")}</span>
                  <input
                    type="checkbox"
                    checked={prefs.showThinkingByDefault}
                    onChange={(e) => setPrefs((p) => ({ ...p, showThinkingByDefault: e.target.checked }))}
                    className="h-4 w-4 accent-primary"
                  />
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Palette className="h-4 w-4 text-cyan" />
                  {t("المظهر واللغة", "Appearance & Language")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={toggleTheme} className="gap-1.5">
                    {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    {theme === "dark" ? t("الوضع النهاري", "Light Mode") : t("الوضع الداكن", "Dark Mode")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={toggleLang} className="gap-1.5">
                    <Globe className="h-4 w-4" />
                    {lang === "ar" ? "English" : "العربية"}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {ACCENT_PALETTES.map((pal) => (
                    <button
                      key={pal.id}
                      type="button"
                      onClick={() => setPrefs((p) => ({ ...p, accentTheme: pal.id }))}
                      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-medium ${
                        prefs.accentTheme === pal.id
                          ? "border-primary bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className={`h-3 w-3 rounded-full ${pal.swatch}`} />
                      {t(pal.labelAr, pal.labelEn)}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Keyboard className="h-4 w-4 text-muted-foreground" />
                  {t("اختصارات لوحة المفاتيح", "Keyboard Shortcuts")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("لوحة الأوامر والبحث السريع", "Command Palette & Search")}</span>
                  <kbd dir="ltr" className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl + K</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("بدء محادثة جديدة", "New Conversation")}</span>
                  <kbd dir="ltr" className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl + Shift + O</kbd>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("إظهار / إخفاء القائمة الجانبية", "Toggle Sidebar")}</span>
                  <kbd dir="ltr" className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl + B</kbd>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
