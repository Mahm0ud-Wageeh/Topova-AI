// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { detectMessageLanguage } from "@server/ai/agent";
import { signGuestSession } from "../backend/src/middleware/auth";
import { createApp } from "../backend/src/app";
import { LocalJsonStore } from "../backend/src/storage/local-store";

function parseSse(text: string) {
  return text
    .split("\n\n")
    .map((f) => f.trim())
    .filter((f) => f && !f.startsWith(":"))
    .map((f) => {
      const event = /^event: (.+)$/m.exec(f)?.[1] ?? "message";
      const data = JSON.parse(/^data: (.+)$/m.exec(f)?.[1] ?? "null");
      return { event, data };
    });
}

describe("SSE progress streaming on /conversations/:id/messages", () => {
  let baseUrl = "";
  let close: () => Promise<void> = async () => {};
  let dir = "";
  const headers = {
    "Content-Type": "application/json",
    "X-NetTopo-Guest": signGuestSession("guest-stream-1"),
  };

  beforeAll(async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    dir = mkdtempSync(join(tmpdir(), "nettopo-sse-"));
    const { app } = createApp({ store: new LocalJsonStore(join(dir, "s.json")), disableRateLimit: true });
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise((resolve) => server.close(() => resolve()));
  });
  afterAll(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  async function newConversation() {
    const r = await fetch(`${baseUrl}/api/v1/conversations`, { method: "POST", headers, body: "{}" });
    return (await r.json()).conversation as { id: string; version?: number };
  }

  it("streams progress events then a result identical in shape to the JSON route", async () => {
    const conv = await newConversation();
    const res = await fetch(`${baseUrl}/api/v1/conversations/${conv.id}/messages?stream=1`, {
      method: "POST",
      headers: { ...headers, Accept: "text/event-stream" },
      body: JSON.stringify({ message: "Design 1 router, 1 switch and 4 PCs", expectedVersion: conv.version ?? 1 }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = parseSse(await res.text());
    expect(events[0].event).toBe("open");
    expect(events.some((e) => e.event === "progress" && e.data.type === "step")).toBe(true);
    const last = events.at(-1)!;
    expect(last.event).toBe("result");
    expect(last.data.assistantMessage.role).toBe("assistant");
    expect(last.data.result.mutated).toBe(true);
    expect(last.data.conversation.id).toBe(conv.id);
  });

  it("returns pre-stream validation errors as normal JSON, not a broken stream", async () => {
    const conv = await newConversation();
    const res = await fetch(`${baseUrl}/api/v1/conversations/${conv.id}/messages?stream=1`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: "" }),
    });
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("still answers plain JSON when streaming is not requested", async () => {
    const conv = await newConversation();
    const res = await fetch(`${baseUrl}/api/v1/conversations/${conv.id}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message: "Design 1 router, 1 switch and 2 PCs", expectedVersion: conv.version ?? 1 }),
    });
    expect(res.headers.get("content-type")).toContain("application/json");
    expect((await res.json()).result.mutated).toBe(true);
  });
});

describe("bilingual detection", () => {
  it("keeps Arabic prose that mentions English technical nouns as Arabic", () => {
    expect(detectMessageLanguage("صمم شبكة بها 3 routers و firewall قوي")).toBe("ar");
  });
  it("keeps English prose that quotes one Arabic word as English", () => {
    expect(detectMessageLanguage("Please design a network for the office named مصر with two switches")).toBe("en");
  });
  it("ignores Arabic/English inside code spans and fences", () => {
    expect(detectMessageLanguage("صمم شبكة ثم شغّل `show ip route` و ```hostname R1```")).toBe("ar");
  });
  it("falls back to the previous turn for command-only input", () => {
    expect(detectMessageLanguage("show ip route", [{ role: "user", content: "اعرض الجدول من فضلك" }])).toBe("ar");
  });
});
