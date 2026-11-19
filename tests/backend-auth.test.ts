// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { createApp } from "../backend/src/app";
import {
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  signGuestSession,
} from "../backend/src/middleware/auth";
import { LocalJsonStore } from "../backend/src/storage/local-store";
import { startApi } from "./api-harness";

afterEach(() => vi.unstubAllEnvs());
it("refuses production without a dedicated strong secret", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("JWT_SECRET", "");
  vi.stubEnv("CLERK_SECRET_KEY", "some-clerk-key");
  expect(() => createApp({ store: new LocalJsonStore() })).toThrow(
    "JWT_SECRET",
  );
});
it("hashes passwords asynchronously with distinct salts", async () => {
  const a = await hashPassword("StrongPassword123!");
  const b = await hashPassword("StrongPassword123!");
  expect(a).not.toBe(b);
  expect(await verifyPassword("StrongPassword123!", a)).toBe(true);
  expect(await verifyPassword("wrong", a)).toBe(false);
});
it("rejects JWT tampering and rotation invalidates old signatures", () => {
  vi.stubEnv("JWT_SECRET", "a".repeat(40));
  const token = signJwt({ id: "audit-user", email: "audit@example.test" });
  expect(verifyJwt(token)?.sub).toBe("audit-user");
  expect(verifyJwt(token + "x")).toBeNull();
  vi.stubEnv("JWT_SECRET", "b".repeat(40));
  expect(verifyJwt(token)).toBeNull();
});
it("issues signed guest sessions, isolates missing and forged guest IDs, and preserves signed guest data", async () => {
  const api = await startApi();
  try {
    const signed = signGuestSession("guest-auth-test");
    const headers = {
      "Content-Type": "application/json",
      "X-NetTopo-Guest": signed,
    };
    const created = await fetch(`${api.url}/api/v1/conversations`, {
      method: "POST",
      headers,
      body: JSON.stringify({ title: "private" }),
    });
    expect(created.status).toBe(201);
    expect(
      (
        await (
          await fetch(`${api.url}/api/v1/conversations`, { headers })
        ).json()
      ).conversations,
    ).toHaveLength(1);
    for (const raw of [undefined, "guest-auth-test", signed + "bad"]) {
      const response = await fetch(`${api.url}/api/v1/conversations`, {
        headers: raw ? { "X-NetTopo-Guest": raw } : {},
      });
      expect((await response.json()).conversations).toHaveLength(0);
    }
    const invalid = await fetch(`${api.url}/api/v1/conversations`, {
      headers: { Authorization: "Bearer invalid" },
    });
    expect(invalid.status).toBe(401);
  } finally {
    await api.close();
  }
});
it("persists account sessions in HttpOnly cookies and clears them on logout", async () => {
  const api = await startApi();
  try {
    const response = await fetch(`${api.url}/api/v1/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "cookie@example.test",
        name: "Engineer",
        password: "Password123!",
      }),
    });
    expect(response.status).toBe(201);
    const session = response.headers
      .getSetCookie()
      .find((value) => value.startsWith("nettopo_session="))!;
    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=Strict");
    const cookie = session.split(";")[0];
    expect(
      (
        await fetch(`${api.url}/api/v1/auth/me`, {
          headers: { Cookie: cookie },
        })
      ).status,
    ).toBe(200);
    const logout = await fetch(`${api.url}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(logout.headers.getSetCookie().join(";")).toContain(
      "nettopo_session=;",
    );
    const csrf = await fetch(`${api.url}/api/v1/conversations`, {
      method: "POST",
      headers: {
        Origin: "https://untrusted.example",
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: "{}",
    });
    expect(csrf.status).toBe(403);
  } finally {
    await api.close();
  }
});

it("limits repeated sign-in attempts by account and IP", async () => {
  const api = await startApi(new LocalJsonStore(), false);
  try {
    for (let i = 0; i < 15; i++) expect((await fetch(`${api.url}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "limited@example.test", password: "wrong" }) })).status).toBe(401);
    const limited = await fetch(`${api.url}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "limited@example.test", password: "wrong" }) });
    expect(limited.status).toBe(429); expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
  } finally { await api.close(); }
});
it("preserves a signed guest cookie when browser storage cannot persist the token", async () => {
  const api = await startApi();
  try {
    const response = await fetch(`${api.url}/api/v1/auth/guest`);
    const first = await response.json();
    const cookie = response.headers.getSetCookie().filter((value) => value.startsWith("nettopo_guest=")).at(-1)!.split(";")[0];
    const next = await (await fetch(`${api.url}/api/v1/auth/guest`, { headers: { Cookie: cookie } })).json();
    const id = (token: string) => JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).id;
    expect(id(first.token)).toBe(id(next.token));
  } finally { await api.close(); }
});
