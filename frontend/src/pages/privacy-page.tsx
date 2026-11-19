import { Link } from "react-router-dom";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";

export function PrivacyPage() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="container max-w-3xl flex-1 space-y-6 py-12">
        <header className="space-y-2 border-b pb-5">
          <h1 className="font-display text-3xl font-bold">{t("سياسة الخصوصية", "Privacy Policy")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("كيف تعالج منصة Topova AI المحادثات، وخطط الشبكات، والملفات المرفقة، وحسابات المستخدمين.", "How Topova AI handles conversations, network blueprints, attached configs, and account data.")}
          </p>
        </header>
        <section className="space-y-4 text-sm leading-7 text-muted-foreground">
          <p>
            {t(
              "تعمل المحركات الهندسية ومحاكيات الحزم والأمان محلياً على خادم التطبيق دون الحاجة لإرسال بيانات شبكتك إلى أطراف خارجية ما لم تقم بتفعيل مفتاح ذكاء اصطناعي خارجي.",
              "Deterministic simulation, security auditing, PoE/BOM calculation, and Cisco config import run locally without sending topology data to third parties unless an external AI API key is configured.",
            )}
          </p>
          <p>
            {t(
              "في وضع الضيف يتم ربط المشاريع بمعرّف محلي خاص بمتصفحك، وعند إنشاء حساب يتم نقل مشاريعك إليه وحماية كلمة المرور بتشفير scrypt.",
              "Guest Mode scopes saved projects to a random local browser identifier. Creating an optional account hashes passwords with salted scrypt and issues signed HS256 JWT tokens.",
            )}
          </p>
        </section>
        <Button asChild variant="outline">
          <Link to="/">{t("العودة للرئيسية", "Back to home")}</Link>
        </Button>
      </main>
      <Footer />
    </div>
  );
}
