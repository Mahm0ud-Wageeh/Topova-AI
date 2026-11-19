import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiRequest, setAuthToken } from "@/api/client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest<{ user: AuthUser }>("/api/v1/auth/me")
      .then((res) => {
        if (active) setUser(res.user);
      })
      .catch(() => {
        if (active) {
          setAuthToken(null);
          setUser(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const expired = () => setUser(null);
    window.addEventListener("nettopo:session-expired", expired);
    return () => window.removeEventListener("nettopo:session-expired", expired);
  }, []);

  async function login(email: string, password: string) {
    const res = await apiRequest<{ token: string; user: AuthUser }>(
      "/api/v1/auth/login",
      {
        method: "POST",
        body: { email, password },
      },
    );
    setAuthToken(res.token);
    setUser(res.user);
  }

  async function register(name: string, email: string, password: string) {
    const res = await apiRequest<{ token: string; user: AuthUser }>(
      "/api/v1/auth/register",
      {
        method: "POST",
        body: { name, email, password },
      },
    );
    setAuthToken(res.token);
    setUser(res.user);
  }

  async function logout() {
    await apiRequest("/api/v1/auth/logout", { method: "POST" });
    setAuthToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
