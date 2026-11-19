import { ruleParse } from "@/lib/network-engine/parser/rule-parser";
import type { DeviceType, ParsedIntent } from "@/lib/network-engine/types";
import {
  cerebrasProvider,
  geminiProvider,
  groqProvider,
  huggingFaceProvider,
  mistralProvider,
  ollamaProvider,
  openRouterProvider,
  zaiProvider,
  type AiProvider,
} from "./providers";

// Tried in order; Google Gemini (official @google/genai Interactions API) is primary,
// with fast multi-provider fallback and the deterministic rule parser as final safety net.
const PROVIDERS: AiProvider[] = [
  geminiProvider,
  groqProvider,
  cerebrasProvider,
  openRouterProvider,
  zaiProvider,
  mistralProvider,
  huggingFaceProvider,
  ollamaProvider,
];
const cooldownUntil = new Map<string, number>();
const TOTAL_PROVIDER_MS = 8_000;
const SINGLE_PROVIDER_MS = 3_000;
const VALID_TYPES: DeviceType[] = [
  "ROUTER",
  "SWITCH",
  "SERVER",
  "PC",
  "FIREWALL",
  "AP",
  "PRINTER",
  "CAMERA",
  "NVR",
  "IP_PHONE",
];

const MAX_TOTAL_DEVICES = 500;
const VALID_PROTOCOLS = new Set(["OSPF", "EIGRP", "RIP", "BGP", "STATIC"]);

/** Coerce arbitrary LLM JSON into a safe ParsedIntent (merges duplicates, caps totals, drops junk). */
function normalizeIntent(raw: unknown): ParsedIntent {
  const obj = (raw ?? {}) as Record<string, any>;
  const counts = new Map<DeviceType, number>();
  let remaining = MAX_TOTAL_DEVICES;
  if (Array.isArray(obj.devices)) {
    for (const d of obj.devices) {
      if (remaining <= 0) break;
      if (!VALID_TYPES.includes(d?.type)) continue;
      const n = Math.max(
        1,
        Math.min(remaining, Math.floor(Number(d.count) || 1)),
      );
      counts.set(
        d.type as DeviceType,
        (counts.get(d.type as DeviceType) ?? 0) + n,
      );
      remaining -= n;
    }
  }
  const devices = [...counts.entries()].map(([type, count]) => ({
    type,
    count,
  }));
  const rawProtocol =
    typeof obj.options?.routingProtocol === "string"
      ? obj.options.routingProtocol.trim().toUpperCase()
      : undefined;
  const options = {
    vlan: Boolean(obj.options?.vlan),
    routingProtocol:
      rawProtocol && VALID_PROTOCOLS.has(rawProtocol) ? rawProtocol : undefined,
  };
  const explicitConnections = Array.isArray(obj.explicitConnections)
    ? obj.explicitConnections
        .filter(
          (c: any) =>
            typeof c?.from === "string" &&
            c.from.trim() &&
            typeof c?.to === "string" &&
            c.to.trim(),
        )
        .map((c: any) => ({ from: c.from.trim(), to: c.to.trim() }))
    : undefined;
  return { devices, explicitConnections, options };
}

/**
 * Parse a natural-language network description into a structured intent.
 * Tries each available AI provider in order; always falls back to the
 * deterministic rule parser so it works with no API keys.
 */
export async function parsePrompt(
  text: string,
  _lang: "ar" | "en" | "auto" = "auto",
  callerSignal?: AbortSignal,
): Promise<ParsedIntent> {
  const deadline = AbortSignal.timeout(TOTAL_PROVIDER_MS);
  const requestSignal = callerSignal
    ? AbortSignal.any([deadline, callerSignal])
    : deadline;
  for (const provider of PROVIDERS) {
    if (requestSignal.aborted) break;
    if (
      !provider.available() ||
      (cooldownUntil.get(provider.name) ?? 0) > Date.now()
    )
      continue;
    const signal = AbortSignal.any([
      requestSignal,
      AbortSignal.timeout(SINGLE_PROVIDER_MS),
    ]);
    try {
      const intent = normalizeIntent(await provider.parse(text, signal));
      if (intent.devices.length > 0) return intent;
    } catch (err) {
      if (callerSignal?.aborted) break;
      const status = (err as { status?: unknown } | null)?.status;
      if (
        status === 400 ||
        status === 401 ||
        status === 402 ||
        status === 403 ||
        status === 404 ||
        status === 429
      ) {
        cooldownUntil.set(provider.name, Date.now() + 60_000);
      }
      console.warn(
        `[ai] ${provider.name}: ${typeof status === "number" ? `HTTP ${status}` : signal.aborted ? "deadline exceeded" : "response unavailable"}`,
      );
    }
  }
  return normalizeIntent(ruleParse(text));
}
