import { MotionConfig } from "framer-motion";
import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { TopovaMark } from "@/components/brand/topova-logo";
import { AuthProvider } from "@/context/auth-context";
import { LanguageProvider } from "@/context/language-context";
import { ProfileProvider } from "@/context/profile-context";
import { ThemeProvider, useTheme } from "@/context/theme-context";
import { HomePage } from "@/pages/home-page";

const LegacyProjectPage = lazy(() =>
  import("@/pages/legacy-project-page").then((m) => ({
    default: m.LegacyProjectPage,
  })),
);

const ChatWorkspacePage = lazy(() =>
  import("@/pages/chat-workspace-page").then((m) => ({
    default: m.ChatWorkspacePage,
  })),
);
const ProfilePage = lazy(() =>
  import("@/pages/profile-page").then((m) => ({ default: m.ProfilePage })),
);
const SettingsPage = lazy(() =>
  import("@/pages/settings-page").then((m) => ({ default: m.SettingsPage })),
);
const AuthPage = lazy(() =>
  import("@/pages/auth-page").then((m) => ({ default: m.AuthPage })),
);
const PrivacyPage = lazy(() =>
  import("@/pages/privacy-page").then((m) => ({ default: m.PrivacyPage })),
);
const TermsPage = lazy(() =>
  import("@/pages/terms-page").then((m) => ({ default: m.TermsPage })),
);
const NotFoundPage = lazy(() =>
  import("@/pages/not-found-page").then((m) => ({ default: m.NotFoundPage })),
);

function RouteLoader() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <TopovaMark size={44} className="animate-pulse" />
        <span className="text-xs font-medium text-muted-foreground">
          Topova AI
        </span>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { theme } = useTheme();
  return (
    <>
      <Suspense fallback={<RouteLoader />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatWorkspacePage />} />
          <Route path="/chat/:conversationId" element={<ChatWorkspacePage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/sign-in" element={<Navigate to="/auth" replace />} />
          <Route path="/sign-up" element={<Navigate to="/auth" replace />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />

          {/* Redirect legacy fragmented routes seamlessly into the unified AI Workspace */}
          <Route path="/studio" element={<Navigate to="/chat" replace />} />
          <Route path="/studio/:projectId" element={<LegacyProjectPage />} />
          <Route path="/result/new" element={<Navigate to="/chat" replace />} />
          <Route path="/result/:projectId" element={<LegacyProjectPage />} />
          <Route path="/planner" element={<Navigate to="/chat" replace />} />
          <Route path="/designs" element={<Navigate to="/chat" replace />} />
          <Route path="/review" element={<Navigate to="/chat" replace />} />
          <Route path="/projects" element={<Navigate to="/chat" replace />} />
          <Route path="/dashboard" element={<Navigate to="/chat" replace />} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <Toaster richColors position="top-center" theme={theme} />
    </>
  );
}

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <ProfileProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </ProfileProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
