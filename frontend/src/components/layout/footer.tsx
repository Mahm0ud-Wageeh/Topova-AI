import { Link } from "react-router-dom";
import { TopovaLogo } from "@/components/brand/topova-logo";
import { useLanguage } from "@/context/language-context";

export function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="border-t bg-background">
      <div className="container flex flex-col items-center gap-4 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <Link to="/" className="flex items-center">
          <TopovaLogo size={28} compact />
        </Link>
        <p>&copy; {new Date().getFullYear()} Topova AI Systems</p>
        <nav className="flex items-center gap-5 text-xs">
          <Link to="/chat" className="hover:text-foreground">
            {t("مساحة العمل", "AI Workspace")}
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            {t("الخصوصية", "Privacy")}
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            {t("الشروط", "Terms")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
