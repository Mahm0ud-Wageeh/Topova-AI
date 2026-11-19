import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  Mail,
  Moon,
  Sun,
  User,
} from "lucide-react";
import { TopovaLogo, TopovaMark } from "@/components/brand/topova-logo";
import {
  CLERK_PUBLISHABLE_KEY,
  ClerkGoogleSignInButton,
  GoogleLogo,
} from "@/components/auth/clerk-bridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useTheme } from "@/context/theme-context";
import { ONBOARDING_STORAGE_KEY } from "@/pages/home-page";

function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
  } catch {
    // ignore storage errors
  }
}

export function AuthPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login, register, user } = useAuth();
  const { lang, toggleLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  useEffect(() => {
    const err = searchParams.get("error");
    if (!err) return;
    if (err === "google_not_configured") {
      toast.info(
        t(
          "تسجيل الدخول عبر Google يتطلب إضافة GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في ملف البيئة (.env).",
          "Google Sign-In requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your server .env configuration.",
        ),
      );
    } else {
      toast.error(
        t(
          "تعذر إتمام تسجيل الدخول عبر Google. حاول مرة أخرى أو استخدم البريد الإلكتروني.",
          "Could not complete Google Sign-In. Please try again or sign in with email.",
        ),
      );
    }
    searchParams.delete("error");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        await register(name, email, password);
        toast.success(
          t(
            "تم إنشاء الحساب ونقل محادثات ومشاريع وضع الضيف إليه.",
            "Account created and guest conversations & projects synced.",
          ),
        );
      } else {
        await login(email, password);
        toast.success(t("تم تسجيل الدخول بنجاح.", "Signed in successfully."));
      }
      markOnboarded();
      navigate("/chat", { replace: true });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("فشلت عملية المصادقة", "Authentication failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  function handleGoogleSignIn() {
    setGoogleBusy(true);
    markOnboarded();
    window.location.assign("/api/v1/auth/google");
  }

  function handleGuestContinue() {
    markOnboarded();
    navigate("/chat", { replace: true });
  }

  return (
    <div className="glass-canvas-bg flex min-h-[100dvh] flex-col text-foreground lg:flex-row">
      {/* Left Architectural Glass Brand Column (Desktop) */}
      <aside className="glass-panel relative hidden flex-col justify-between border-e p-10 lg:flex lg:w-[44%] xl:w-[42%]">
        <div className="flex items-center justify-between">
          <Link to="/chat" className="inline-flex items-center">
            <TopovaLogo size={32} compact />
          </Link>
        </div>

        <div className="max-w-md space-y-6">
          <div className="space-y-3">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground xl:text-4xl">
              {t(
                "هندسة الشبكات بدقة احترافية، من الفكرة إلى ملفات التشغيل",
                "Precision network architecture, from prompt to lab deployment",
              )}
            </h1>
            <p className="text-sm leading-7 text-muted-foreground">
              {t(
                "احفظ محادثاتك ومخططاتك التفاعلية، وصدّر ملفات Cisco Packet Tracer و CML و GNS3 مباشرة مع سجل مراجعات كامل.",
                "Sync your conversations, interactive topologies, and direct Cisco Packet Tracer, CML, and GNS3 deliverables across every session.",
              )}
            </p>
          </div>

          <ul className="space-y-3 pt-2 text-sm text-foreground/90">
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              <span>
                {t(
                  "مزامنة تلقائية للمحادثات والمخططات عبر أجهزتك",
                  "Automatic cloud sync for threads and topology revisions",
                )}
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              <span>
                {t(
                  "نقل فوري لكل أعمالك من وضع الضيف عند التسجيل",
                  "Seamless transfer of all guest designs upon sign-in",
                )}
              </span>
            </li>
            <li className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
              <span>
                {t(
                  "تخصيص ذاكرة الوكيل الذكي وتفضيلات التوجيه والأمان",
                  "Persistent AI engineering memory and routing defaults",
                )}
              </span>
            </li>
          </ul>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Topova AI</span>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="hover:text-foreground">
              {t("الخصوصية", "Privacy")}
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              {t("الشروط", "Terms")}
            </Link>
          </div>
        </div>
      </aside>

      {/* Right Authentication Panel */}
      <div className="flex flex-1 flex-col">
        {/* Top Utility Controls */}
        <header className="flex h-16 shrink-0 items-center justify-between px-5 sm:px-8">
          <div className="lg:hidden">
            <Link to="/chat" className="inline-flex items-center">
              <TopovaLogo size={28} compact />
            </Link>
          </div>
          <div className="ms-auto flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={toggleLang}
              className="h-8 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
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
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 pb-12 pt-4 sm:px-8">
          <div className="w-full max-w-[420px] space-y-6">
            {/* Heading */}
            <div className="space-y-2 text-center lg:text-start">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border bg-card lg:hidden">
                <TopovaMark size={26} />
              </div>
              <h2 className="font-display text-2xl font-bold tracking-tight">
                {user
                  ? t("مرحباً بعودتك", "Welcome back")
                  : mode === "login"
                    ? t("تسجيل الدخول إلى حسابك", "Sign in to your account")
                    : t("إنشاء حساب هندسي جديد", "Create your account")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {user
                  ? t(
                      "حسابك متصل وجاهز للمتابعة.",
                      "Your account is active and ready.",
                    )
                  : mode === "login"
                    ? t(
                        "استخدم حساب Google أو بريدك الإلكتروني للمتابعة.",
                        "Continue with Google or your email credentials.",
                      )
                    : t(
                        "سجّل في ثوانٍ لحفظ محادثاتك ومشاريع الشبكات.",
                        "Get started in seconds to save your threads and topologies.",
                      )}
              </p>
            </div>

            {user ? (
              <div className="surface-subtle space-y-4 rounded-2xl p-6 text-center">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {user.name}
                  </p>
                  <p dir="ltr" className="text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <Button
                  onClick={() => navigate("/chat")}
                  className="h-10 w-full gap-2"
                >
                  {t("فتح مساحة المحادثة", "Open Workspace")}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </Button>
              </div>
            ) : (
              <div className="surface-subtle space-y-5 rounded-2xl p-6">
                {/* Mode Segmented Control */}
                <div className="grid grid-cols-2 rounded-xl bg-muted/70 p-1">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                      mode === "login"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("تسجيل الدخول", "Sign in")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className={`rounded-lg py-2 text-xs font-semibold transition-colors ${
                      mode === "register"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("إنشاء حساب", "Create account")}
                  </button>
                </div>

                {/* Official Google Sign-In Button (uses Clerk when configured, direct OAuth fallback otherwise) */}
                {CLERK_PUBLISHABLE_KEY ? (
                  <ClerkGoogleSignInButton
                    disabled={busy}
                    onStart={markOnboarded}
                  />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={googleBusy || busy}
                    onClick={handleGoogleSignIn}
                    className="h-11 w-full justify-center gap-2.5 rounded-xl border-input bg-background text-sm font-medium hover:bg-muted/60"
                  >
                    {googleBusy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <GoogleLogo className="h-4 w-4 shrink-0" />
                    )}
                    <span>
                      {t("المتابعة باستخدام Google", "Continue with Google")}
                    </span>
                  </Button>
                )}

                {/* Crisp Divider */}
                <div className="relative flex items-center py-0.5">
                  <div className="flex-grow border-t border-border" />
                  <span className="mx-3 shrink-0 text-xs text-muted-foreground">
                    {t("أو عبر البريد الإلكتروني", "or with email")}
                  </span>
                  <div className="flex-grow border-t border-border" />
                </div>

                {/* Email & Password Form */}
                <form onSubmit={onSubmit} className="space-y-4">
                  {mode === "register" && (
                    <div className="space-y-1.5">
                      <label
                        htmlFor="auth-name"
                        className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                      >
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("الاسم الكامل", "Full name")}
                      </label>
                      <Input
                        id="auth-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        maxLength={80}
                        autoComplete="name"
                        placeholder={t("مثال: محمود أحمد", "e.g. Alex Morgan")}
                        className="h-10 rounded-xl"
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-email"
                      className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                    >
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      {t("البريد الإلكتروني", "Email address")}
                    </label>
                    <Input
                      id="auth-email"
                      dir="ltr"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      placeholder="engineer@company.com"
                      className="h-10 rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="auth-password"
                        className="flex items-center gap-1.5 text-xs font-medium text-foreground"
                      >
                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("كلمة المرور", "Password")}
                      </label>
                      {mode === "register" && (
                        <span className="text-[11px] text-muted-foreground">
                          {t("10 أحرف على الأقل", "Min. 10 characters")}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id="auth-password"
                        dir="ltr"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={mode === "register" ? 10 : 1}
                        autoComplete={
                          mode === "register"
                            ? "new-password"
                            : "current-password"
                        }
                        placeholder="••••••••••"
                        className="h-10 rounded-xl pe-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={
                          showPassword
                            ? t("إخفاء كلمة المرور", "Hide password")
                            : t("إظهار كلمة المرور", "Show password")
                        }
                        className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={busy || googleBusy}
                    className="h-10 w-full gap-2 rounded-xl font-semibold"
                  >
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {mode === "login"
                      ? t("تسجيل الدخول", "Sign in")
                      : t("إنشاء الحساب", "Create account")}
                  </Button>
                </form>

                {/* Guest Mode Fallback */}
                <div className="border-t pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 w-full text-xs text-muted-foreground hover:text-foreground"
                    onClick={handleGuestContinue}
                  >
                    {t(
                      "المتابعة كضيف بدون حساب",
                      "Continue as Guest without an account",
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
