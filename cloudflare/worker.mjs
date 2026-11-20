/**
 * Topova AI on Cloudflare Workers.
 *
 * The SPA is served from Workers Static Assets (global edge, free tier).
 * `/api/*` is forwarded to the existing Express + PostgreSQL backend so the
 * deployment keeps one database, one set of secrets and identical behaviour.
 * Server-Sent Events stream through unchanged.
 */
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function json(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function proxyApi(request, env, url) {
  const backend = new URL(env.BACKEND_ORIGIN);

  // The backend trusts its own origin only. Rewriting Origin below is safe only
  // because we first refuse state-changing requests from any other site.
  const origin = request.headers.get("Origin");
  if (UNSAFE.has(request.method) && origin && origin !== url.origin) {
    return json(403, "ORIGIN_DENIED", "This origin is not allowed.");
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }

  const target = new URL(url.pathname + url.search, backend);
  const headers = new Headers(request.headers);
  headers.delete("host");
  if (UNSAFE.has(request.method)) headers.set("Origin", backend.origin);
  else headers.delete("Origin");
  headers.set("X-Forwarded-Host", url.host);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) headers.set("X-Real-Client-IP", ip);

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
    init.duplex = "half";
  }

  let upstream;
  try {
    upstream = await fetch(new Request(target, init));
  } catch {
    return json(502, "UPSTREAM_UNAVAILABLE", "The API is temporarily unreachable. Please retry.");
  }

  const out = new Headers(upstream.headers);
  out.set("Cache-Control", "no-store");
  out.delete("Access-Control-Allow-Origin");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return proxyApi(request, env, url);
    }
    return env.ASSETS.fetch(request);
  },
};
