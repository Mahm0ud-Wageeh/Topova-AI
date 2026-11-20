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

export type AgentProgressEvent =
  | { type: "status"; message: string }
  | { type: "step"; step: { title: string; detail: string; status: "done" } };

function parseSseFrame(frame: string): { event: string; data: string } | null {
  let event = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue; // heartbeat/comment
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  return data.length ? { event, data: data.join("\n") } : null;
}

/**
 * POST that consumes Server-Sent Events when the server streams, and falls
 * back to a plain JSON body when it does not (e.g. idempotent replays or
 * proxies that buffer). Resolves with the payload of the final `result` event.
 */
export async function apiRequestStream<T>(
  path: string,
  options: {
    body: unknown;
    timeoutMs?: number;
    signal?: AbortSignal;
    onProgress?: (event: AgentProgressEvent) => void;
  },
): Promise<T> {
  const headers = new Headers();
  headers.set("Accept", "text/event-stream, application/json");
  headers.set("X-NetTopo-Guest", await ensureGuestSession());
  headers.set("Content-Type", "application/json");
  const requestGeneration = sessionGeneration;
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? 65_000);
  const signal = options.signal
    ? AbortSignal.any([timeoutSignal, options.signal])
    : timeoutSignal;

  const res = await fetch(path, {
    credentials: "same-origin",
    method: "POST",
    headers,
    body: JSON.stringify(options.body),
    signal,
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

  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("text/event-stream") || !res.body) {
    return (await res.json()) as T;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) !== -1) {
      const frame = parseSseFrame(buffer.slice(0, cut));
      buffer = buffer.slice(cut + 2);
      if (!frame) continue;
      let payload: unknown;
      try {
        payload = JSON.parse(frame.data);
      } catch {
        continue;
      }
      if (frame.event === "progress") {
        options.onProgress?.(payload as AgentProgressEvent);
      } else if (frame.event === "result") {
        return payload as T;
      } else if (frame.event === "error") {
        const e = payload as { status?: number; code?: string; message?: string };
        throw new ApiError(
          e.status ?? 500,
          e.code ?? "STREAM_ERROR",
          e.message ?? "The request failed.",
          payload,
        );
      }
    }
  }
  throw new ApiError(
    502,
    "STREAM_INTERRUPTED",
    "The connection ended before the answer arrived. Your message was kept; retry to continue.",
  );
}
