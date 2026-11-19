import { GoogleGenAI } from "@google/genai";

export interface AiProvider {
  name: string;
  available: () => boolean;
  parse: (text: string, signal: AbortSignal) => Promise<unknown>;
}

// Shared instruction: force strict JSON matching our intent shape.
export const SYSTEM_PROMPT = `You convert a network description (Arabic or English) into JSON.
Return ONLY valid JSON, no prose, in this exact shape:
{
 "devices":[{"type":"ROUTER|SWITCH|SERVER|PC|FIREWALL|AP|PRINTER|CAMERA|NVR|IP_PHONE","count":number}],
 "explicitConnections":[{"from":"label","to":"label"}],
 "options":{"vlan":boolean,"routingProtocol":"OSPF"|"EIGRP"|"RIP"|"BGP"|"STATIC"|null}
}
Type mapping hints (Arabic -> type):
- طابعة/طابعات -> PRINTER
- كاميرا/كاميرات/مراقبة -> CAMERA
- مسجل/NVR/DVR -> NVR
- تليفون/هاتف/voip -> IP_PHONE
- اكسس بوينت/واي فاي/wifi -> AP
- سيرفر/خادم -> SERVER
- جهاز/كمبيوتر/حاسوب -> PC
- راوتر/موجه -> ROUTER
- سويتش/مبدل -> SWITCH
- جدار حماية/فايروول -> FIREWALL
Infer counts from the text. If VLAN/segmentation/isolation is mentioned, set vlan true.`;

export const DEFAULT_GEMINI_MODEL = "gemini-4-hydrogen";
export const FAST_GEMINI_MODEL = "gemini-3.5-flash-lite";

function stripToJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end >= 0 ? body.slice(start, end + 1) : body;
}

function responseError(response: Response) {
  return Object.assign(new Error("Provider request failed."), {
    status: response.status,
  });
}

function openAiCompatProvider(config: {
  name: string;
  envKey: string;
  modelEnv: string;
  baseUrl: string;
  defaultModel?: string;
}): AiProvider {
  const apiKey = () => process.env[config.envKey]?.trim();
  const model = () =>
    process.env[config.modelEnv]?.trim() || config.defaultModel;
  return {
    name: config.name,
    available: () => Boolean(apiKey() && model()),
    async parse(text, signal) {
      const response = await fetch(config.baseUrl + "/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model(),
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: text },
          ],
          response_format: { type: "json_object" },
        }),
        signal,
      });
      if (!response.ok) throw responseError(response);
      const data = await response.json();
      return JSON.parse(
        stripToJson(data?.choices?.[0]?.message?.content ?? ""),
      );
    },
  };
}

const INTENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    devices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
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
            ],
          },
          count: { type: "integer" },
        },
        required: ["type", "count"],
      },
    },
    explicitConnections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
        },
        required: ["from", "to"],
      },
    },
    options: {
      type: "object",
      properties: {
        vlan: { type: "boolean" },
        routingProtocol: { type: "string", nullable: true },
      },
    },
  },
  required: ["devices"],
};

export const geminiProvider: AiProvider = {
  name: "gemini",
  available: () => Boolean(process.env.GEMINI_API_KEY?.trim()),
  async parse(text, signal) {
    const apiKey = process.env.GEMINI_API_KEY!.trim();
    const ai = new GoogleGenAI({ apiKey });
    const configured = process.env.GEMINI_MODEL?.trim();
    const candidates = [
      configured,
      FAST_GEMINI_MODEL,
      DEFAULT_GEMINI_MODEL,
    ].filter((m, i, arr): m is string => Boolean(m) && arr.indexOf(m) === i);

    let lastErr: unknown;
    for (const model of candidates) {
      if (signal.aborted) break;
      try {
        const interaction = await ai.interactions.create(
          {
            model,
            input: text,
            system_instruction: SYSTEM_PROMPT,
            response_format: INTENT_JSON_SCHEMA as never,
          },
          { signal },
        );
        const rawText = interaction.output_text ?? "";
        return JSON.parse(stripToJson(rawText));
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr ?? new Error("Gemini parse failed");
  },
};

export const huggingFaceProvider = openAiCompatProvider({
  name: "huggingface",
  envKey: "HUGGINGFACE_API_KEY",
  modelEnv: "HUGGINGFACE_MODEL",
  baseUrl: "https://router.huggingface.co/v1",
});

export const ollamaProvider: AiProvider = {
  name: "ollama",
  available: () => Boolean(process.env.OLLAMA_BASE_URL?.trim()),
  async parse(text, signal) {
    const response = await fetch(
      process.env.OLLAMA_BASE_URL!.trim().replace(/\/$/, "") + "/api/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OLLAMA_MODEL?.trim() || "llama3",
          system: SYSTEM_PROMPT,
          prompt: text,
          stream: false,
          format: "json",
        }),
        signal,
      },
    );
    if (!response.ok) throw responseError(response);
    const data = await response.json();
    return JSON.parse(stripToJson(data.response ?? ""));
  },
};

export const groqProvider = openAiCompatProvider({
  name: "groq",
  envKey: "GROQ_API_KEY",
  modelEnv: "GROQ_MODEL",
  baseUrl: "https://api.groq.com/openai/v1",
  defaultModel: "openai/gpt-oss-20b",
});

export const cerebrasProvider = openAiCompatProvider({
  name: "cerebras",
  envKey: "CEREBRAS_API_KEY",
  modelEnv: "CEREBRAS_MODEL",
  baseUrl: "https://api.cerebras.ai/v1",
});

export const openRouterProvider = openAiCompatProvider({
  name: "openrouter",
  envKey: "OPENROUTER_API_KEY",
  modelEnv: "OPENROUTER_MODEL",
  baseUrl: "https://openrouter.ai/api/v1",
});

export const mistralProvider = openAiCompatProvider({
  name: "mistral",
  envKey: "MISTRAL_API_KEY",
  modelEnv: "MISTRAL_MODEL",
  baseUrl: "https://api.mistral.ai/v1",
  defaultModel: "mistral-small-latest",
});

export const zaiProvider = openAiCompatProvider({
  name: "zai",
  envKey: "Z_API_KEY",
  modelEnv: "ZAI_MODEL",
  baseUrl: "https://api.z.ai/api/paas/v4",
});
