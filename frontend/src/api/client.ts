const GUEST_KEY = "nettopo:guest-session";
let authToken: string | null = null;
let sessionGeneration = 0;
let guestSession: string | null = null;
let guestRequest: Promise<string> | null = null;

export function getGuestId(): string {
  return guestSession ?? "";
}

async function ensureGuestSession(): Promise<string> {
  if (guestSession) return guestSession;
  try {
    guestSession = localStorage.getItem(GUEST_KEY);
  } catch {
    /* memory-only session */
  }
  if (guestSession) return guestSession;
  guestRequest ??= fetch("/api/v1/auth/guest", {
    credentials: "same-origin",
    signal: AbortSignal.timeout(10_000),
  })
    .then(async (response) => {
      if (!response.ok)
        throw new Error("Could not create a guest session. Please retry.");
      const data = (await response.json()) as { token: string };
      guestSession = data.token;
      try {
        localStorage.setItem(GUEST_KEY, data.token);
      } catch {
        /* memory-only session */
      }
      return data.token;
    })
    .finally(() => {
      guestRequest = null;
    });
  return guestRequest;
}

export function getAuthToken(): string | null {
  return authToken;
}
export function setAuthToken(token: string | null) {
  authToken = token;
  sessionGeneration++;
  // Account sessions persist in an HttpOnly cookie, never in browser storage.
  try {
    localStorage.removeItem("nettopo:jwt");
  } catch {
    /* storage blocked */
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly payload?: unknown,
  ) {
    super(message);
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    timeoutMs?: number;
    accept?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers = new Headers();
  headers.set("Accept", options.accept ?? "application/json");
  headers.set("X-NetTopo-Guest", await ensureGuestSession());
  const requestGeneration = sessionGeneration;
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");

  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? 20_000);
  const combinedSignal = options.signal
    ? AbortSignal.any([timeoutSignal, options.signal])
    : timeoutSignal;

  const res = await fetch(path, {
    credentials: "same-origin",
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: combinedSignal,
  });

  if (!res.ok) {
    if (res.status === 401 && requestGeneration === sessionGeneration) {
      setAuthToken(null);
      window.dispatchEvent(new Event("nettopo:session-expired"));
    }
    const errBody = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      res.status,
      errBody?.error?.code ?? "REQUEST_FAILED",
      errBody?.error?.message ?? `Request failed (${res.status})`,
      errBody,
    );
  }

  return (await res.json()) as T;
}
