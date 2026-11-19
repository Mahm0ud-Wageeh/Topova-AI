import { describe, expect, it } from "vitest";
import { detectMessageLanguage, runNetworkAgentChat } from "@server/ai/agent";
import { buildTopology } from "@/lib/network-engine/topology-builder";
import { planNetwork } from "@/lib/network-engine/planner";
import { startApi } from "./api-harness";

describe("Bilingual RTL/LTR Agent, Direct File Export Cards & Google OAuth", () => {
  it("matches current message language and switches mid-conversation like ChatGPT", () => {
    expect(detectMessageLanguage("صمم شبكة شركة بـ OSPF و VLANs")).toBe("ar");
    expect(detectMessageLanguage("Design an enterprise campus with OSPF")).toBe("en");

    // Switching from Arabic to English mid-chat
    expect(
      detectMessageLanguage("Now run a security audit on this topology", [
        { role: "user", content: "صمم لي شبكة شركة" },
        { role: "assistant", content: "تم تصميم الشبكة" },
      ]),
    ).toBe("en");

    // Switching from English to Arabic mid-chat
    expect(
      detectMessageLanguage("اعطني ملف الباكت تريسر .ptk", [
        { role: "user", content: "Design 1 router and 2 switches" },
        { role: "assistant", content: "Prepared a design" },
      ]),
    ).toBe("ar");

    // Neutral CLI command inherits previous user message language
    expect(
      detectMessageLanguage("show ip route", [
        { role: "user", content: "صمم شبكة فرع" },
      ]),
    ).toBe("ar");
  });

  it("returns direct downloadable exportCards when user requests .pkt / .ptk Packet Tracer files", async () => {
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const topology = buildTopology({
        devices: [
          { type: "ROUTER", count: 1 },
          { type: "SWITCH", count: 1 },
          { type: "PC", count: 2 },
        ],
        options: { vlan: true, routingProtocol: "OSPF" },
      });
      const plan = planNetwork(topology, undefined, {
        vlan: true,
        routingProtocol: "OSPF",
      });

      const resAr = await runNetworkAgentChat({
        message: "اعطني ملف .ptk بتاع سيسكو باكت تريسر عشان احمله",
        lang: "en", // even if UI lang is English, Arabic prompt MUST get Arabic reply!
        state: { topology, plan, acls: [] },
      });

      expect(resAr.detectedLang).toBe("ar");
      expect(resAr.reply).toContain(".pkt");
      expect(resAr.exportCards?.length).toBeGreaterThanOrEqual(2);
      expect(resAr.exportCards?.some((c) => c.id === "pt-guide")).toBe(true);
      expect(resAr.exportCards?.some((c) => c.id === "cisco-cfg")).toBe(true);

      const resEn = await runNetworkAgentChat({
        message: "Give me the Cisco Packet Tracer .pkt file to download",
        lang: "ar", // even if UI lang is Arabic, English prompt MUST get English reply!
        state: { topology, plan, acls: [] },
      });

      expect(resEn.detectedLang).toBe("en");
      expect(resEn.exportCards?.length).toBeGreaterThanOrEqual(2);
    } finally {
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    }
  });

  it("exposes Google OAuth provider status and graceful redirect when unconfigured", async () => {
    const api = await startApi();
    try {
      const providersRes = await fetch(`${api.url}/api/v1/auth/providers`);
      expect(providersRes.status).toBe(200);
      const providers = (await providersRes.json()) as { google: boolean };
      expect(typeof providers.google).toBe("boolean");

      if (!providers.google) {
        const redirectRes = await fetch(`${api.url}/api/v1/auth/google`, {
          redirect: "manual",
        });
        expect(redirectRes.status).toBe(302);
        expect(redirectRes.headers.get("location")).toContain(
          "/auth?error=google_not_configured",
        );
      }
    } finally {
      await api.close();
    }
  });
});
