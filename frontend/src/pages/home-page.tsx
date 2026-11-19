import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileCode2,
  Globe,
  MessageSquare,
  Moon,
  Network,
  ShieldCheck,
  Sun,
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

  const totalSteps = 3;
  const isLast = step === totalSteps - 1;

  return (
    <div className="glass-canvas-bg flex min-h-[100dvh] flex-col text-foreground">
      {/* Minimal Top Bar */}
      <header className="flex h-16 shrink-0 items-center justify-between px-5 sm:px-8">
        <TopovaLogo size={28} compact />

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleLang}
            className="h-8 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
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
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label={t("تبديل المظهر", "Toggle theme")}
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => finish("/chat")}
            className="h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {t("تخطي", "Skip")}
          </Button>
        </div>
      </header>

      {/* Centered Single-Focus Stepper Canvas */}
      <main className="flex flex-1 flex-col items-center justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-lg">
          {/* Progress Indicator */}
          <div
            className="mb-8 flex items-center gap-2"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={totalSteps}
          >
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`${t("الخطوة", "Step")} ${idx + 1}`}
                onClick={() => setStep(idx)}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                  idx <= step ? "bg-primary" : "bg-border"
                }`}
              />
            ))}
          </div>

          <div className="surface-subtle overflow-hidden rounded-2xl p-6 sm:p-8">
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div
                  key="step-0"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="space-y-6"
                >
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

                  {/* Quick Workspace Setup */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (lang !== "ar") toggleLang();
                      }}
                      className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-start transition-colors ${
                        lang === "ar"
                          ? "border-primary bg-primary/8 text-foreground"
                          : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div>
                        <p className="text-xs font-semibold">العربية</p>
                        <p className="text-[11px] text-muted-foreground">
                          RTL واجهة
                        </p>
                      </div>
                      {lang === "ar" && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (lang !== "en") toggleLang();
                      }}
                      className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-start transition-colors ${
                        lang === "en"
                          ? "border-primary bg-primary/8 text-foreground"
                          : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <div>
                        <p className="text-xs font-semibold">English</p>
                        <p className="text-[11px] text-muted-foreground">
                          LTR Interface
                        </p>
                      </div>
                      {lang === "en" && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  </div>
                </motion.div>
              )}

              {step === 1 && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="space-y-6"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border bg-muted/60 text-primary">
                    <MessageSquare className="h-5 w-5" />
                  </div>

                  <div className="space-y-2.5">
                    <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                      {t(
                        "تحدّث بطبيعتك، والمخطط يُبنى أمامك",
                        "Describe in natural language, inspect live",
                      )}
                    </h2>
                    <p className="text-sm leading-7 text-muted-foreground sm:text-[15px]">
                      {t(
                        "يتعرف المساعد تلقائياً على لغة رسالتك (عربي أو إنجليزي) حتى لو بدّلت اللغة أثناء المحادثة، ويحوّل متطلباتك إلى مخطط تفاعلي مع تقييم أمان ومحاكاة حزم فورية.",
                        "The assistant automatically matches your message language — even when switching between Arabic and English mid-chat — and builds a live topology with security audits and packet tracing.",
                      )}
                    </p>
                  </div>

                  <ul className="space-y-2.5 text-sm text-foreground/90">
                    <li className="flex items-start gap-2.5">
                      <Network className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      <span>
                        {t(
                          "بناء وتعديل مخططات VLANs و OSPF و BGP و Zero-Trust ACLs لحظياً",
                          "Build and refine VLANs, OSPF, BGP, and Zero-Trust ACLs interactively",
                        )}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-primary" />
                      <span>
                        {t(
                          "فحص نقاط الفشل الوحيدة ومحاكاة الهجمات الجانبية وإصلاحها تلقائياً",
                          "Detect single points of failure, simulate attacks, and auto-harden",
                        )}
                      </span>
                    </li>
                  </ul>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                  className="space-y-6"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border bg-muted/60 text-primary">
                    <FileCode2 className="h-5 w-5" />
                  </div>

                  <div className="space-y-2.5">
                    <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                      {t(
                        "ملفات سيسكو جاهزة للتحميل داخل الشات",
                        "Direct Cisco deliverables right in chat",
                      )}
                    </h2>
                    <p className="text-sm leading-7 text-muted-foreground sm:text-[15px]">
                      {t(
                        "عندما تطلب ملفات Cisco Packet Tracer أو إعدادات التشغيل أو تقرير PDF، تظهر لك بطاقات تحميل مباشرة لكل ملف مع شرح واضح لكيفية تشغيله خطوة بخطوة.",
                        "Whenever you ask for Cisco Packet Tracer files, startup configs, CML/GNS3 topologies, or PDF reports, direct 1-click download cards appear right in the conversation with clear instructions.",
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs font-mono text-muted-foreground">
                    <span className="rounded-lg border bg-muted/50 px-2.5 py-1">
                      Packet Tracer Guide (.html)
                    </span>
                    <span className="rounded-lg border bg-muted/50 px-2.5 py-1">
                      Cisco IOS (.cfg)
                    </span>
                    <span className="rounded-lg border bg-muted/50 px-2.5 py-1">
                      CML (.yaml)
                    </span>
                    <span className="rounded-lg border bg-muted/50 px-2.5 py-1">
                      GNS3 (.gns3)
                    </span>
                    <span className="rounded-lg border bg-muted/50 px-2.5 py-1">
                      Executive Report (.pdf)
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Step Navigation Footer */}
            <div className="mt-8 flex items-center justify-between gap-3 border-t pt-5">
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
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => finish("/auth")}
                  >
                    {t("تسجيل الدخول", "Sign in")}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => finish("/chat")}
                    className="gap-1.5 px-5"
                  >
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
