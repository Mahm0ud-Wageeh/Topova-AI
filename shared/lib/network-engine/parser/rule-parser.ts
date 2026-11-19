import type { DeviceType, ParsedIntent } from "@/lib/network-engine/types";

const MAX_TOTAL_DEVICES = 500;

// Normalize Arabic hamza variants so "أربع"/"أجهزة" match cleanly.
function normalizeText(input: string): string {
  return input.toLowerCase().replace(/[أإآ]/g, "ا");
}

// English + Arabic number words -> value
const NUM_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
  "واحد": 1, "اثنين": 2, "اثنان": 2, "ثلاث": 3, "ثلاثة": 3,
  "اربع": 4, "اربعة": 4, "خمس": 5, "خمسة": 5, "ست": 6, "ستة": 6,
  "سبع": 7, "سبعة": 7, "ثمان": 8, "ثمانية": 8, "تسع": 9, "تسعة": 9,
  "عشر": 10, "عشرة": 10, "عشرين": 20, "ثلاثين": 30,
};

// device keywords (lowercased & hamza-normalized); longer/plural forms listed first.
const DEVICE_KEYWORDS: { type: DeviceType; words: string[] }[] = [
  { type: "ROUTER", words: ["routers", "router", "راوترات", "راوتر", "روتر", "موجهات", "موجه"] },
  { type: "SWITCH", words: ["switches", "switch", "سويتشات", "سويتش", "مبدلات", "مبدل"] },
  { type: "SERVER", words: ["servers", "server", "سيرفرات", "سيرفر", "خوادم", "خادم"] },
  { type: "PC", words: ["pcs", "pc", "computers", "computer", "hosts", "host", "اجهزة", "جهاز", "حاسوب", "كمبيوتر"] },
  { type: "FIREWALL", words: ["firewalls", "firewall", "جدران حماية", "جدار حماية", "فايروول"] },
  { type: "AP", words: ["access points", "access point", "aps", "ap", "نقاط وصول", "نقطة وصول", "اكسس بوينت"] },
  { type: "PRINTER", words: ["printers", "printer", "طابعات", "طابعة"] },
  { type: "CAMERA", words: ["cameras", "camera", "كاميرات", "كاميرا"] },
  { type: "NVR", words: ["nvrs", "nvr", "dvrs", "dvr", "مسجل"] },
  { type: "IP_PHONE", words: ["ip phones", "ip phone", "voip phones", "voip phone", "phones", "phone", "هواتف", "هاتف", "تليفونات", "تليفون"] },
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wordToNumber(token: string): number | null {
  if (/^\d+$/.test(token)) {
    const parsed = parseInt(token, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_TOTAL_DEVICES) : null;
  }
  return NUM_WORDS[token] ?? null;
}

const ALL_DEVICE_WORDS = new Set(DEVICE_KEYWORDS.flatMap((entry) => entry.words));
const BOUNDARY_WORDS = new Set(["and", "or", "with", "plus", "و", "مع"]);

function keywordPattern(word: string, allowConjunctionPrefix: boolean): string {
  const escaped = escapeRegex(word);
  // Arabic words frequently attach conjunction "و" and definite article "ال" (e.g., "وطابعة", "والراوتر").
  if (!/^[\u0600-\u06FF]/.test(word)) return escaped;
  return allowConjunctionPrefix ? `(?:و(?:ال)?|ال)?${escaped}` : `(?:ال)?${escaped}`;
}

/**
 * Count all occurrences of a device type across its singular/plural keywords
 * using a single combined alternation so mixed phrases like
 * "1 core router and 2 branch routers" sum accurately without double-counting,
 * and without stealing counts across conjunctions or other device nouns.
 */
function countForType(text: string, words: string[]): number | null {
  const sorted = [...words].sort((a, b) => b.length - a.length);
  const countedAlt = sorted.map((w) => keywordPattern(w, false)).join("|");
  const bareAlt = sorted.map((w) => keywordPattern(w, true)).join("|");
  const countedRe = new RegExp(
    `(?<![\\p{L}\\d])(\\d+|[\\p{L}]+)\\s+((?:[\\p{L}]+\\s+){0,2}?)(?:${countedAlt})(?![\\p{L}])`,
    "giu",
  );
  let count: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = countedRe.exec(text)) !== null) {
    const n = wordToNumber(m[1]);
    if (n === null) continue;
    const between = m[2].trim().split(/\s+/).filter(Boolean);
    if (between.some((tok) => BOUNDARY_WORDS.has(tok) || ALL_DEVICE_WORDS.has(tok))) continue;
    count = Math.min(MAX_TOTAL_DEVICES, (count ?? 0) + n);
  }
  if (count === null && new RegExp(`(?<![\\p{L}])(?:${bareAlt})(?![\\p{L}])`, "iu").test(text)) {
    return 1;
  }
  return count;
}

export function ruleParse(input: string): ParsedIntent {
  const text = normalizeText(input);
  const devices: ParsedIntent["devices"] = [];
  let remaining = MAX_TOTAL_DEVICES;

  for (const { type, words } of DEVICE_KEYWORDS) {
    if (remaining <= 0) break;
    const raw = countForType(text, words);
    if (raw !== null && raw > 0) {
      const capped = Math.min(raw, remaining);
      devices.push({ type, count: capped });
      remaining -= capped;
    }
  }

  const vlan = /(?<![\p{L}])(?:vlans?|segment(?:ation)?|فلان|تقسيم|عزل)(?![\p{L}])/iu.test(text);
  let routingProtocol: string | undefined;
  for (const p of ["ospf", "eigrp", "rip", "bgp", "static"]) {
    if (new RegExp(`\\b${p}\\b`, "i").test(text)) {
      routingProtocol = p.toUpperCase();
      break;
    }
  }

  return { devices, options: { vlan, routingProtocol } };
}