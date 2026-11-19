import { Link } from "react-router-dom";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";

export function TermsPage() {
  const { t } = useLanguage();
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="container max-w-3xl flex-1 space-y-6 py-12">
        <header className="space-y-2 border-b pb-5">
          <h1 className="font-display text-3xl font-bold">{t("شروط الاستخدام", "Terms of Service")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("شروط استخدام منصة Topova AI للتصميم والمحاكاة وتصدير إعدادات سيسكو.", "Terms governing Topova AI architecture, simulation, and Cisco export tools.")}
          </p>
        </header>
        <section className="space-y-4 text-sm leading-7 text-muted-foreground">
          <p>
            {t(
              "تُنتج منصة Topova AI إعدادات معملية وخطط عناوين وتقارير أمان لأغراض الهندسة والتصميم والمحاكاة؛ يجب مراجعة أسماء المنافذ الفعلية وسياسات الوصول في بيئة اختبار قبل التطبيق على أجهزة الإنتاج.",
              "Topova AI generates lab baseline configurations, IP/VLAN plans, and audit reports for design and education. Always verify physical port names and security policies in a lab before production deployment.",
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
