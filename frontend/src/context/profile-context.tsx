import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "@/api/client";
import { useAuth } from "@/context/auth-context";

export type AccentTheme = "blue" | "cyan" | "emerald" | "violet";
export type AgentWorkMode = "auto" | "architect" | "security" | "executive";

export interface UserPreferences {
  defaultMode: AgentWorkMode;
  defaultRouting: "OSPF" | "EIGRP" | "BGP" | "STATIC";
  autoVlan: boolean;
  autoApplyCanvas: boolean;
  showThinkingByDefault: boolean;
  accentTheme: AccentTheme;
}

export interface UserProfile {
  ownerId: string;
  displayName: string;
  roleTitle: string;
  organization: string;
  bio: string;
  avatarColor: AccentTheme;
  customInstructions: string;
  memoryNotes: string[];
  preferences: UserPreferences;
  updatedAt: string;
}

export interface ProfileStats {
  conversationCount: number;
  pinnedConversationCount: number;
  totalMessages: number;
  projectCount: number;
  totalDevicesArchitected: number;
}

interface ProfileResponse {
  profile: UserProfile;
  stats: ProfileStats;
  account: { isGuest: boolean; email: string | null };
}

interface ProfileContextValue {
  profile: UserProfile | null;
  stats: ProfileStats | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfile: (
    patch: Partial<
      Omit<UserProfile, "ownerId" | "updatedAt" | "preferences">
    > & {
      preferences?: Partial<UserPreferences>;
    },
  ) => Promise<UserProfile>;
}

const ACCENT_HSL: Record<AccentTheme, { primary: string; ring: string }> = {
  blue: { primary: "217 91% 60%", ring: "217 91% 60%" },
  cyan: { primary: "192 91% 46%", ring: "192 91% 46%" },
  emerald: { primary: "158 76% 42%", ring: "158 76% 42%" },
  violet: { primary: "263 83% 62%", ring: "263 83% 62%" },
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshSequence = useRef(0);

  const applyAccent = useCallback((accent: AccentTheme | undefined) => {
    const cfg = ACCENT_HSL[accent ?? "blue"] ?? ACCENT_HSL.blue;
    document.documentElement.style.setProperty("--primary", cfg.primary);
    document.documentElement.style.setProperty("--ring", cfg.ring);
  }, []);

  const refreshProfile = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const data = await apiRequest<ProfileResponse>("/api/v1/profile");
      if (sequence !== refreshSequence.current) return;
      setProfile(data.profile);
      setStats(data.stats);
      applyAccent(data.profile.preferences.accentTheme);
    } catch {
      // resilient fallback if offline
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, [applyAccent]);

  useEffect(() => {
    if (authLoading) return;
    setProfile(null);
    setStats(null);
    setLoading(true);
    void refreshProfile();
  }, [user?.id, authLoading, refreshProfile]);

  const updateProfile = useCallback(
    async (
      patch: Partial<
        Omit<UserProfile, "ownerId" | "updatedAt" | "preferences">
      > & {
        preferences?: Partial<UserPreferences>;
      },
    ) => {
      const data = await apiRequest<ProfileResponse>("/api/v1/profile", {
        method: "PATCH",
        body: patch,
      });
      setProfile(data.profile);
      setStats(data.stats);
      applyAccent(data.profile.preferences.accentTheme);
      return data.profile;
    },
    [applyAccent],
  );

  return (
    <ProfileContext.Provider
      value={{ profile, stats, loading, refreshProfile, updateProfile }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
