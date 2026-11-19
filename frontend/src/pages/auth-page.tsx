import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Lock, Mail, User } from "lucide-react";
import { TopovaMark } from "@/components/brand/topova-logo";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";

export function AuthPage() {
  const navigate = useNavigate();
  const { login, register, user } = useAuth();
  const { t } = useLanguage();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "register") {
        await register(name, email, password);
        toast.success(
          t(
            "تم إنشاء الحساب ونقل محادثات ومشاريع وضع الضيف إليه.",
            "Account created and guest conversations & projects adopted.",
          ),
        );
      } else {
        await login(email, password);
        toast.success(t("تم تسجيل الدخول بنجاح.", "Signed in successfully."));
      }
      navigate("/chat");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("فشلت العملية", "Authentication failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="container flex flex-1 items-center justify-center py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2">
              <TopovaMark size={52} />
            </div>
            <CardTitle className="text-2xl">
              {mode === "login"
                ? t("تسجيل الدخول إلى Topova AI", "Sign in to Topova AI")
                : t("إنشاء حساب جديد", "Create your Topova AI account")}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t(
                "يمكنك استخدام الموقع بالكامل كضيف، أو تسجيل حساب لمزامنة مشاريعك عبر الجلسات.",
                "Guest Mode works out of the box. Sign in to keep projects synced across devices (guest projects transfer automatically).",
              )}
            </p>
          </CardHeader>
          <CardContent>
            {user ? (
              <div className="space-y-4 text-center">
                <p className="text-sm">
                  {t("أنت مسجل الدخول حالياً باسم", "Currently signed in as")}{" "}
                  <strong>{user.name}</strong> ({user.email})
                </p>
                <Button onClick={() => navigate("/chat")} className="w-full">
                  {t("الانتقال إلى مساحة المحادثة", "Open AI Chat Workspace")}
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                {mode === "register" && (
                  <label className="grid gap-1.5 text-sm font-medium">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {t("الاسم", "Full name")}
                    </span>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      maxLength={80}
                      placeholder="Mahmoud"
                    />
                  </label>
                )}
                <label className="grid gap-1.5 text-sm font-medium">
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("البريد الإلكتروني", "Email")}
                  </span>
                  <Input
                    dir="ltr"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="engineer@nettopo.ai"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  <span className="flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    {t("كلمة المرور", "Password")}
                  </span>
                  <Input
                    dir="ltr"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={mode === "register" ? 10 : 1}
                    placeholder="••••••••"
                  />
                </label>
                <Button type="submit" disabled={busy} className="w-full">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === "login"
                    ? t("دخول", "Sign in")
                    : t("إنشاء حساب", "Create account")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate("/chat")}
                >
                  {t(
                    "المتابعة كضيف والدخول مباشرة للشات",
                    "Continue as Guest — Launch Chat",
                  )}
                </Button>
                <div className="text-center text-xs text-muted-foreground">
                  {mode === "login" ? (
                    <button
                      type="button"
                      onClick={() => setMode("register")}
                      className="text-primary underline"
                    >
                      {t(
                        "ليس لديك حساب؟ أنشئ حساباً جديداً",
                        "Need an account? Register now",
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setMode("login")}
                      className="text-primary underline"
                    >
                      {t(
                        "لديك حساب بالفعل؟ سجّل الدخول",
                        "Already have an account? Sign in",
                      )}
                    </button>
                  )}
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
