import { useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileCode2,
  FlaskConical,
  Globe,
  Languages,
  MessageSquare,
  Moon,
  Network,
  ShieldCheck,
  Sparkles,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { TopovaLogo, TopovaMark } from "@/components/brand/topova-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useTheme } from "@/context/theme-context";

export const ONBOARDING_STORAGE_KEY = "topova:onboarding:completed";

function isOnboardingCompleted(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markOnboardingCompleted(): void {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    // ignore storage restrictions
  }
}

/** Feature tile used on the second step: icon, title and one line of detail. */
function FeatureTile({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <li className="flex gap-3 rounded-xl border bg-background/50 p-3.5 transition-colors hover:border-primary/40 hover:bg-primary/5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-5 text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
      </div>
    </li>
  );
}

/** Download-card preview used on the last step. */
function FormatTile({ ext, label, hint }: { ext: string; label: string; hint: string }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border bg-background/50 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5">
      <span
        dir="ltr"
        className="w-fit rounded-md bg-primary/12 px-2 py-0.5 font-mono text-xs font-bold text-primary"
      >
        {ext}
      </span>
      <p className="text-[13px] font-semibold leading-5 text-foreground">{label}</p>
      <p className="text-[11px] leading-4 text-muted-foreground">{hint}</p>
    </li>
  );
}

function StepHeading({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border bg-muted/60 text-primary">
        {icon}
      </div>
      <div className="space-y-2.5">
        <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        <p className="text-sm leading-7 text-muted-foreground sm:text-[15px]">{children}</p>
      </div>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { lang, toggleLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [step, setStep] = useState(0);

  // Returning users or already signed-in users go straight to the workspace — Welcome never reappears.
  if (!authLoading && (user || isOnboardingCompleted())) {
    return <Navigate to="/chat" replace />;
  }

  function finish(destination: "/chat" | "/auth" = "/chat") {
    markOnboardingCompleted();
    navigate(destination, { replace: true });
  }

  const steps = [
    { icon: Sparkles, label: t("البداية", "Welcome") },
    { icon: MessageSquare, label: t("المحادثة", "Chat") },
    { icon: FileCode2, label: t("الملفات", "Files") },
  ];
  const totalSteps = steps.length;
  const isLast = step === totalSteps - 1;

  const motionProps = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
    transition: { duration: 0.18, ease: "easeOut" as const },
  };

  return (
    <div className="glass-canvas-bg flex min-h-[100dvh] flex-col text-foreground">
      {/* Minimal Top Bar */}
      <header className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-8">
        <TopovaLogo size={28} compact />

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleLang}
            className="h-9 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-label={t("تبديل اللغة", "Toggle language")}
          >
            <Globe className="h-3.5 w-3.5" />
            {lang === "ar" ? "English" : "العربية"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
            aria-label={t("تبديل المظهر", "Toggle theme")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => finish("/chat")}
            className="h-9 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {t("تخطي", "Skip")}
          </Button>
        </div>
      </header>

      {/* Centered Single-Focus Stepper Canvas */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-8 sm:py-10">
        <div className="w-full max-w-2xl">
          {/* Labelled stepper */}
          <nav aria-label={t("خطوات التعريف", "Onboarding steps")} className="mb-5 sm:mb-6">
            <ol className="flex items-center">
              {steps.map((s, idx) => {
                const done = idx < step;
                const active = idx === step;
                return (
                  <li key={s.label} className="flex flex-1 items-center last:flex-none">
                    <button
                      type="button"
                      aria-current={active ? "step" : undefined}
                      onClick={() => setStep(idx)}
                      className="touch-compact group flex items-center gap-2.5 rounded-full py-1 pe-1 text-start"
                    >
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border text-sm font-semibold transition-all duration-200 ${
                          done
                            ? "border-primary bg-primary text-primary-foreground"
                            : active
                              ? "border-primary bg-primary/10 text-primary ring-4 ring-primary/15"
                              : "border-border bg-background/60 text-muted-foreground group-hover:border-primary/50"
                        }`}
                      >
                        {done ? <Check className="h-4 w-4" /> : <s.icon className="h-4 w-4" />}
                      </span>
                      <span
                        className={`text-xs font-semibold sm:text-sm ${
                          active ? "block text-foreground" : "hidden text-muted-foreground sm:block"
                        }`}
                      >
                        {s.label}
                      </span>
                    </button>
                    {idx < totalSteps - 1 && (
                      <span
                        aria-hidden="true"
                        className={`mx-2 h-0.5 flex-1 rounded-full transition-colors duration-300 sm:mx-3 ${
                          idx < step ? "bg-primary" : "bg-border"
                        }`}
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="glass-panel overflow-hidden rounded-3xl p-5 sm:p-8">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div key="step-0" {...motionProps} className="space-y-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border bg-muted/60">
                    <TopovaMark size={30} />
                  </div>

                  <div className="space-y-2.5">
                    <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                      {t("مرحباً بك في Topova AI", "Welcome to Topova AI")}
                    </h1>
                    <p className="text-sm leading-7 text-muted-foreground sm:text-[15px]">
                      {t(
                        "مساحة عمل هندسية متكاملة لتصميم الشبكات، فحص الأمان، وتجهيز ملفات سيسكو الجاهزة من خلال محادثة ذكية بالعربية أو الإنجليزية.",
                        "A focused network engineering workspace for designing topologies, auditing security, and generating ready-to-use Cisco configurations in English or Arabic.",
                      )}
                    </p>
                  </div>

                  {/* Interface language */}
                  <div>
                    <p className="mb-2 text-xs font-semibold text-muted-foreground">
                      {t("لغة الواجهة", "Interface language")}
                    </p>
                    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                      {(
                        [
                          { id: "ar", title: "العربية", sub: t("واجهة من اليمين لليسار", "Right-to-left interface") },
                          { id: "en", title: "English", sub: t("واجهة من اليسار لليمين", "Left-to-right interface") },
                        ] as const
                      ).map((opt) => {
                        const selected = lang === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => {
                              if (!selected) toggleLang();
                            }}
                            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-start transition-colors ${
                              selected
                                ? "border-primary bg-primary/10 text-foreground"
                                : "border-border bg-background/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            }`}
                          >
                            <span>
                              <span className="block text-sm font-semibold">{opt.title}</span>
                              <span className="block text-[11px] text-muted-foreground">{opt.sub}</span>
                            </span>
                            <span
                              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                                selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                              }`}
                            >
                              {selected && <Check className="h-3 w-3" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div key="step-1" {...motionProps} className="space-y-6">
                  <StepHeading
                    icon={<MessageSquare className="h-5 w-5" />}
                    title={t("تحدّث بطبيعتك، والمخطط يُبنى أمامك", "Describe it in plain language, inspect it live")}
                  >
                    {t(
                      "يتعرف المساعد تلقائياً على لغة رسالتك حتى لو بدّلتها أثناء المحادثة، ويحوّل متطلباتك إلى مخطط تفاعلي تم التحقق منه رياضياً.",
                      "The assistant matches your language even when you switch mid-chat, and turns your requirements into a live topology verified with real math.",
                    )}
                  </StepHeading>

                  <ul className="grid gap-3 sm:grid-cols-2">
                    <FeatureTile
                      icon={Network}
                      title={t("بناء الشبكات لحظياً", "Live topology building")}
                      body={t(
                        "VLANs و OSPF و BGP و Zero-Trust ACLs من وصف بسيط.",
                        "VLANs, OSPF, BGP and Zero-Trust ACLs from a short description.",
                      )}
                    />
                    <FeatureTile
                      icon={ShieldCheck}
                      title={t("الأمان والاختراق", "Security & Red-Team")}
                      body={t(
                        "كشف نقاط الفشل ومحاكاة الهجمات وإصلاح تلقائي.",
                        "Find single points of failure, simulate attacks, auto-harden.",
                      )}
                    />
                    <FeatureTile
                      icon={FlaskConical}
                      title={t("مختبر التحسين الرياضي", "Optimization lab")}
                      body={t(
                        "تصاميم باريتو (تكلفة/تأخير/اعتمادية) و N-1 وإثبات VLSM.",
                        "Pareto designs (cost, latency, resilience), N-1 failover and VLSM proofs.",
                      )}
                    />
                    <FeatureTile
                      icon={Languages}
                      title={t("ثنائي اللغة", "Bilingual by design")}
                      body={t(
                        "ردود بلغتك: عربي RTL أو إنجليزي LTR بشكل سليم.",
                        "Replies in your language: clean Arabic RTL or English LTR.",
                      )}
                    />
                  </ul>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step-2" {...motionProps} className="space-y-6">
                  <StepHeading
                    icon={<FileCode2 className="h-5 w-5" />}
                    title={t("ملفات سيسكو جاهزة للتحميل داخل الشات", "Cisco deliverables, right in the chat")}
                  >
                    {t(
                      "عند طلب الملفات تظهر بطاقات تحميل مباشرة لكل ملف مع شرح خطوة بخطوة لطريقة تشغيله.",
                      "Ask for files and 1-click download cards appear in the conversation, each with step-by-step instructions.",
                    )}
                  </StepHeading>

                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <FormatTile ext=".html" label="Packet Tracer Guide" hint={t("دليل بناء تفاعلي", "Interactive build guide")} />
                    <FormatTile ext=".cfg" label="Cisco IOS" hint={t("إعدادات لكل جهاز", "Per-device startup config")} />
                    <FormatTile ext=".csv" label={t("جدول الكابلات", "Cabling matrix")} hint={t("منفذ لمنفذ", "Port-to-port")} />
                    <FormatTile ext=".yaml" label="CML" hint={t("استيراد مباشر", "Direct import")} />
                    <FormatTile ext=".gns3" label="GNS3" hint={t("مشروع جاهز", "Ready project")} />
                    <FormatTile ext=".pdf" label={t("تقرير تنفيذي", "Executive report")} hint={t("للعرض والمناقشة", "For presentations")} />
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Step Navigation Footer */}
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t pt-5 sm:mt-8">
              {step > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                  className="gap-1.5"
                >
                  <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                  {t("السابق", "Back")}
                </Button>
              ) : (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t(`خطوة ${step + 1} من ${totalSteps}`, `Step ${step + 1} of ${totalSteps}`)}
                </span>
              )}

              {isLast ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => finish("/auth")}>
                    {t("تسجيل الدخول", "Sign in")}
                  </Button>
                  <Button type="button" onClick={() => finish("/chat")} className="gap-1.5 px-5">
                    {t("ابدأ الآن", "Get Started")}
                    <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  onClick={() => setStep((s) => Math.min(totalSteps - 1, s + 1))}
                  className="gap-1.5 px-5"
                >
                  {t("التالي", "Next")}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
