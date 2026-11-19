import { Link } from "react-router-dom";
import { Network } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";

export function NotFoundPage() {
  const { t } = useLanguage();
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-primary to-cyan text-primary-foreground shadow-glow">
          <Network className="h-8 w-8" />
        </span>
        <p className="mb-2 font-mono text-6xl font-bold text-primary">404</p>
        <h1 className="font-display text-2xl font-bold">{t("الصفحة غير موجودة", "Page not found")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("المسار الذي تبحث عنه غير متاح أو تم نقله.", "The page you are looking for does not exist or has been moved.")}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild>
            <Link to="/">{t("الرئيسية", "Go home")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/studio">{t("افتح الاستوديو", "Open Studio")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
