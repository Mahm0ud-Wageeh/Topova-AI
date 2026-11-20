import { Link, useLocation } from "react-router-dom";
import {
  Globe,
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { TopovaLogo } from "@/components/brand/topova-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { useProfile } from "@/context/profile-context";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/lib/utils";

export function Navbar() {
  const { pathname } = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { lang, toggleLang, t } = useLanguage();
  const { user, logout } = useAuth();
  const { profile } = useProfile();

  const navLinks = [
    { to: "/chat", label: t("المحادثة الذكية", "AI Workspace"), icon: MessageSquare },
    { to: "/profile", label: t("الملف الشخصي", "Profile"), icon: User },
    { to: "/settings", label: t("الإعدادات", "Settings"), icon: Settings },
  ];

  return (
    <header className="glass-panel sticky top-0 z-40 w-full border-x-0 border-t-0">
      <div className="container flex h-16 items-center justify-between gap-2 px-3 sm:px-6">
        <Link to="/" className="flex shrink-0 items-center">
          <TopovaLogo size={34} showBadge />
        </Link>

        <nav className="flex items-center gap-1">
          {navLinks.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
            return (
              <Button
                key={item.to}
                asChild
                variant={active ? "secondary" : "ghost"}
                size="sm"
                className={cn("h-10 gap-1.5 px-3 sm:h-8 sm:px-2.5", active && "text-primary")}
              >
                <Link to={item.to}>
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              </Button>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleLang}
            className="h-10 gap-1 px-2.5 text-xs font-semibold sm:h-8 sm:px-2"
            aria-label="Toggle language"
          >
            <Globe className="h-3.5 w-3.5" />
            {lang === "ar" ? "EN" : "عربي"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-10 w-10 sm:h-8 sm:w-8"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {user ? (
            <div className="flex items-center gap-1">
              <Link
                to="/profile"
                className="hidden items-center gap-1.5 rounded-full border bg-muted/60 px-2.5 py-1 text-xs font-medium hover:border-primary/50 md:inline-flex"
              >
                {profile?.displayName || user.name}
              </Link>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 sm:h-8 sm:w-8"
                onClick={logout}
                title={t("تسجيل الخروج", "Sign out")}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button asChild size="sm" variant="outline" className="h-10 gap-1.5 px-3 sm:h-8 sm:px-2.5">
              <Link to="/auth">
                <LogIn className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("دخول", "Sign in")}</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
