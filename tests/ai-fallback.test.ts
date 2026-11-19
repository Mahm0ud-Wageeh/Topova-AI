// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

function configureOnlyGroq() {
  for (const name of ["GEMINI_API_KEY", "CEREBRAS_API_KEY", "OPENROUTER_API_KEY", "Z_API_KEY",
    "MISTRAL_API_KEY", "HUGGINGFACE_API_KEY", "OLLAMA_BASE_URL"]) vi.stubEnv(name, "");
  vi.stubEnv("GROQ_API_KEY", "test");
  vi.stubEnv("GROQ_MODEL", "");
  vi.spyOn(console, "warn").mockImplementation(() => {});
}

const description = "1 router, 2 switches, 4 PCs";

it("falls back after a retired model and skips it on the next request", async () => {
  configureOnlyGroq();
  const fetchStub = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetchStub);
  const { parsePrompt } = await import("@server/ai");
  const intent = await parsePrompt(description);
  expect(intent.devices).toContainEqual({ type: "SWITCH", count: 2 });
  await parsePrompt(description);
  expect(fetchStub).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchStub.mock.calls[0][1].body).model).toBe("openai/gpt-oss-20b");
});

it("aborts a stalled provider and still returns local intent", async () => {
  configureOnlyGroq();
  let providerSignal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => {
    providerSignal = init.signal!;
    return new Promise((_resolve, reject) => {
      providerSignal!.addEventListener("abort", () => reject(providerSignal!.reason), { once: true });
    });
  }));
  const { parsePrompt } = await import("@server/ai");
  const intent = await parsePrompt(description);
  expect(providerSignal?.aborted).toBe(true);
  expect(intent.devices).toContainEqual({ type: "PC", count: 4 });
}, 5_000);
