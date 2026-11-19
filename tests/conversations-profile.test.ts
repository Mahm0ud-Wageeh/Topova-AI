import { buildTopology, planNetwork } from "@/lib/network-engine";
import { signGuestSession } from "../backend/src/middleware/auth";
// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../backend/src/app";
import { LocalJsonStore } from "../backend/src/storage/local-store";

describe("AI Platform Conversations, Profile, Memory & White-Label Guarantees", () => {
  let baseUrl = "";
  let closeServer: () => Promise<void> = async () => {};
  let tempDir = "";

  beforeAll(async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    tempDir = mkdtempSync(join(tmpdir(), "nettopo-platform-conv-"));
    const store = new LocalJsonStore(join(tempDir, "store.json"));
    const { app } = createApp({ store, disableRateLimit: true });
    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    closeServer = () => new Promise((resolve) => server.close(() => resolve()));
  });

  afterAll(async () => {
    await closeServer();
    rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it("supports multi-conversation CRUD, pinning, search, message attachments, and topology persistence", async () => {
    const guestHeaders = {
      "Content-Type": "application/json",
      "X-NetTopo-Guest": signGuestSession("guest-alpha-1001"),
    };

    const topology = buildTopology({ devices: [{ type: "ROUTER", count: 1 }, { type: "SWITCH", count: 1 }, { type: "PC", count: 2 }], options: { vlan: true } });
    // 1. Create conversation
    const createRes = await fetch(`${baseUrl}/api/v1/conversations`, {
      method: "POST",
      headers: guestHeaders,
      body: JSON.stringify({ mode: "architect", workspaceState: { projectName: "Test design", topology, plan: planNetwork(topology), acls: [] } }),
    });
    expect(createRes.status).toBe(201);
    const { conversation } = await createRes.json();
    expect(conversation.id).toMatch(/^cht/);

    // 2. Send a message with an attached Cisco config & trigger auto-remediation
    const msgRes = await fetch(`${baseUrl}/api/v1/conversations/${conversation.id}/messages`, {
      method: "POST",
      headers: guestHeaders,
      body: JSON.stringify({
        message: "أصلح الشبكة تلقائياً وأمنها بالكامل",
        mode: "security",
        attachments: [{ name: "r1.cfg", content: "hostname R1\ninterface Gi0/0\n ip address 10.0.0.1 255.255.255.0" }],
      }),
    });
    expect(msgRes.status).toBe(200);
    const msgData = await msgRes.json();
    expect(msgData.conversation.messages).toHaveLength(2);
    expect(msgData.conversation.title).toContain("أصلح الشبكة");
    expect(msgData.conversation.workspaceState?.topology?.devices?.length).toBeGreaterThan(0);
    expect(msgData.assistantMessage.thinkingSteps.length).toBeGreaterThan(0);
    expect(msgData.assistantMessage.followUpSuggestions.length).toBeGreaterThan(0);
    // Strict white-label check
    const raw = JSON.stringify(msgData).toLowerCase();
    expect(raw).not.toContain("gemini");
    expect(raw).not.toContain("google");

    // 3. Pin & rename conversation
    const patchRes = await fetch(`${baseUrl}/api/v1/conversations/${conversation.id}`, {
      method: "PATCH",
      headers: guestHeaders,
      body: JSON.stringify({ title: "Campus Zero-Trust Core", pinned: true }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.conversation.pinned).toBe(true);
    expect(patched.conversation.title).toBe("Campus Zero-Trust Core");

    // 4. Search conversations
    const listRes = await fetch(`${baseUrl}/api/v1/conversations?q=Zero-Trust`, {
      headers: guestHeaders,
    });
    expect(listRes.status).toBe(200);
    const { conversations } = await listRes.json();
    expect(conversations).toHaveLength(1);
    expect(conversations[0].pinned).toBe(true);
    expect(conversations[0].hasTopology).toBe(true);

    // 5. Isolation: another guest cannot read or delete this conversation
    const otherRes = await fetch(`${baseUrl}/api/v1/conversations/${conversation.id}`, {
      headers: { "X-NetTopo-Guest": signGuestSession("guest-beta-2002") },
    });
    expect(otherRes.status).toBe(404);
  });

  it("persists profile, custom instructions, memory notes & adopts guest conversations on registration", async () => {
    const guestId = "guest-adopt-3003";
    const guestHeaders = {
      "Content-Type": "application/json",
      "X-NetTopo-Guest": signGuestSession(guestId),
    };

    // Update guest profile & memory
    const profPatch = await fetch(`${baseUrl}/api/v1/profile`, {
      method: "PATCH",
      headers: guestHeaders,
      body: JSON.stringify({
        displayName: "Eng. Mahmoud",
        roleTitle: "Principal Network Architect",
        customInstructions: "Always use Cisco Catalyst best practices.",
        memoryNotes: ["Isolate CCTV in VLAN 30", "Prefer OSPF area 0"],
        preferences: {
          defaultMode: "architect",
          defaultRouting: "OSPF",
          accentTheme: "cyan",
          showThinkingByDefault: true,
        },
      }),
    });
    expect(profPatch.status).toBe(200);
    const { profile } = await profPatch.json();
    expect(profile.displayName).toBe("Eng. Mahmoud");
    expect(profile.memoryNotes).toHaveLength(2);
    expect(profile.preferences.accentTheme).toBe("cyan");

    // Create a guest chat
    await fetch(`${baseUrl}/api/v1/conversations`, {
      method: "POST",
      headers: guestHeaders,
      body: JSON.stringify({ title: "Guest Campus Draft" }),
    });

    // Register a new account with the same X-NetTopo-Guest header -> adopts profile & chat!
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: "POST",
      headers: guestHeaders,
      body: JSON.stringify({
        name: "Mahmoud",
        email: "mahmoud.platform@nettopo.ai",
        password: "StrongPassword123!",
      }),
    });
    expect(regRes.status).toBe(201);
    const { token } = await regRes.json();

    // Authenticated user now owns the adopted conversation & profile!
    const authedHeaders = { Authorization: `Bearer ${token}` };
    const convsRes = await fetch(`${baseUrl}/api/v1/conversations`, { headers: authedHeaders });
    const convsData = await convsRes.json();
    expect(convsData.conversations.some((c: { title: string }) => c.title === "Guest Campus Draft")).toBe(true);

    const authedProfileRes = await fetch(`${baseUrl}/api/v1/profile`, { headers: authedHeaders });
    const authedProfileData = await authedProfileRes.json();
    expect(authedProfileData.profile.displayName).toBe("Eng. Mahmoud");
    expect(authedProfileData.profile.memoryNotes).toContain("Isolate CCTV in VLAN 30");
    expect(authedProfileData.stats.conversationCount).toBeGreaterThanOrEqual(1);
    expect(authedProfileData.account.isGuest).toBe(false);
  });
});
