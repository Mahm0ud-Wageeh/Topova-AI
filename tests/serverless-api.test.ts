import { randomBytes } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { createApp } from "../backend/src/app";
import { LocalJsonStore } from "../backend/src/storage/local-store";

afterEach(() => vi.unstubAllEnvs());

it("serves production API requests without requiring or serving the SPA build", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("JWT_SECRET", randomBytes(48).toString("hex"));
  vi.stubEnv("NETTOPO_AUTHORIZED_ORIGINS", "https://example.test");
  const { app } = createApp({
    store: new LocalJsonStore(),
    disableRateLimit: true,
    serveFrontend: false,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const health = await fetch(`${url}/api/v1/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok" });
    const missing = await fetch(`${url}/api/missing`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
    expect((await fetch(`${url}/chat`)).status).toBe(404);
    const denied = await fetch(`${url}/api/v1/auth/login`, {
      method: "POST",
      headers: { Origin: "https://untrusted.test", "Content-Type": "application/json" },
      body: "{}",
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: "ORIGIN_DENIED" } });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
