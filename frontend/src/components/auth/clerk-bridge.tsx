import {
  AuthenticateWithRedirectCallback,
  ClerkProvider,
  useAuth as useClerkAuth,
  useClerk,
  useSignIn,
  useUser,
} from "@clerk/clerk-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { TopovaMark } from "@/components/brand/topova-logo";
import { Button } from "@/components/ui/button";
import { setAvatarUrl } from "@/components/auth/avatar-store";
import { useAuth } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";
import { ONBOARDING_STORAGE_KEY } from "@/pages/home-page";

const metaEnv = (
  import.meta as unknown as { env?: Record<string, string | undefined> }
).env;

export const CLERK_PUBLISHABLE_KEY: string =
  metaEnv?.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
  metaEnv?.VITE_CLERK_PUBLISHABLE_KEY ||
  "";

export function GoogleLogo({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 0 0 0 10.76l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

/** Keeps local Express JWT session synchronized with Clerk sign-in & sign-out. */
function ClerkSessionBridge() {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const clerk = useClerk();
  const { user: clerkUser } = useUser();
  const { user, loading: authLoading, syncClerkSession } = useAuth();
  const syncingRef = useRef(false);

  // Publish the Google profile photo so the sidebar and profile page can show it.
  useEffect(() => {
    if (!isLoaded) return;
    setAvatarUrl(isSignedIn && clerkUser?.hasImage ? clerkUser.imageUrl : null);
  }, [isLoaded, isSignedIn, clerkUser?.imageUrl, clerkUser?.hasImage]);

  useEffect(() => {
    const onLogout = () => {
      if (isSignedIn) {
        void clerk.signOut().catch(() => {});
      }
    };
    window.addEventListener("nettopo:logout", onLogout);
    return () => window.removeEventListener("nettopo:logout", onLogout);
  }, [clerk, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || authLoading || user || syncingRef.current) {
      return;
    }
    syncingRef.current = true;
    void (async () => {
      try {
        const token = await getToken();
        if (token) {
          await syncClerkSession(token);
          try {
            localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
          } catch {
            // ignore
          }
        }
      } catch {
        // silent fallback; user can retry on /auth
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [isLoaded, isSignedIn, authLoading, user, getToken, syncClerkSession]);

  return null;
}

export function ClerkOptionalProvider({ children }: { children: ReactNode }) {
  if (!CLERK_PUBLISHABLE_KEY) {
    return <>{children}</>;
  }
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      {children}
    </ClerkProvider>
  );
}

export function ClerkSessionWatcher() {
  if (!CLERK_PUBLISHABLE_KEY) return null;
  return <ClerkSessionBridge />;
}

export function ClerkSsoCallbackPage() {
  if (!CLERK_PUBLISHABLE_KEY) {
    return null;
  }
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background">
      <TopovaMark size={40} className="animate-pulse" />
      <AuthenticateWithRedirectCallback
        signInForceRedirectUrl="/auth/sso-complete"
        signUpForceRedirectUrl="/auth/sso-complete"
      />
    </div>
  );
}

function ClerkSsoCompleteInner() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { syncClerkSession } = useAuth();
  const { t } = useLanguage();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || ranRef.current) return;
    ranRef.current = true;
    void (async () => {
      try {
        if (!isSignedIn) {
          navigate("/auth", { replace: true });
          return;
        }
        const token = await getToken();
        if (!token) {
          navigate("/auth", { replace: true });
          return;
        }
        await syncClerkSession(token);
        try {
          localStorage.setItem(ONBOARDING_STORAGE_KEY, "1");
        } catch {
          // ignore
        }
        toast.success(
          t("تم تسجيل الدخول عبر Google بنجاح.", "Signed in with Google."),
        );
        navigate("/chat", { replace: true });
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : t("تعذر مزامنة جلسة Google.", "Could not sync Google session."),
        );
        navigate("/auth", { replace: true });
      }
    })();
  }, [isLoaded, isSignedIn, getToken, syncClerkSession, navigate, t]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm">
        {t("جاري إتمام تسجيل الدخول...", "Completing sign-in...")}
      </p>
    </div>
  );
}

export function ClerkSsoCompletePage() {
  if (!CLERK_PUBLISHABLE_KEY) return null;
  return <ClerkSsoCompleteInner />;
}

export function ClerkGoogleSignInButton({
  disabled,
  onStart,
}: {
  disabled?: boolean;
  onStart?: () => void;
}) {
  const { isLoaded, signIn } = useSignIn();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (!isLoaded || !signIn) return;
    setBusy(true);
    onStart?.();
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/auth/sso-callback",
        redirectUrlComplete: "/auth/sso-complete",
      });
    } catch (err) {
      setBusy(false);
      toast.error(
        err instanceof Error
          ? err.message
          : t("تعذر فتح نافذة Google.", "Could not start Google Sign-In."),
      );
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || busy || !isLoaded}
      onClick={() => void handleClick()}
      className="h-11 w-full justify-center gap-2.5 rounded-xl border-input bg-background text-sm font-medium hover:bg-muted/60"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <GoogleLogo className="h-4 w-4 shrink-0" />
      )}
      <span>{t("المتابعة باستخدام Google", "Continue with Google")}</span>
    </Button>
  );
}
