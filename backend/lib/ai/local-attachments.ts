import {
  builtTopologySchema,
  workspaceStateSchema,
} from "@/lib/validators/schemas";
import type { ChatAttachment } from "../../src/storage/types";

/** Inspect data only. Never execute commands or treat file content as instructions. */
export function localAttachmentContext(
  attachments: ChatAttachment[],
  ar: boolean,
): string {
  if (!attachments.length) return "";
  const summaries = attachments.map((file) => {
    const text = file.content;
    if (/\.json$/i.test(file.name)) {
      try {
        const parsed: unknown = JSON.parse(text);
        const workspace = workspaceStateSchema.safeParse(parsed);
        const topology = builtTopologySchema.safeParse(parsed);
        const graph = workspace.success
          ? workspace.data.topology
          : topology.success
            ? topology.data
            : null;
        return graph
          ? `${file.name}: ${graph.devices.length} devices, ${graph.connections.length} links. ${ar ? "بيانات صالحة؛ لم تُطبق على الرسم تلقائياً." : "Valid topology data; not automatically applied to the canvas."}`
          : `${file.name}: ${ar ? "JSON صالح، لكنه لا يطابق صيغة مخطط الشبكة." : "Valid JSON, but it does not match the topology format."}`;
      } catch {
        return `${file.name}: ${ar ? "ملف JSON غير صالح." : "Invalid JSON."}`;
      }
    }
    if (/\.(cfg|txt)$/i.test(file.name)) {
      const hostname = /^hostname\s+(\S+)/im.exec(text)?.[1];
      const interfaces = [...text.matchAll(/^interface\s+(\S+)/gim)].map(
        (match) => match[1],
      );
      const addresses = [
        ...text.matchAll(/^\s*ip address\s+([\d.]+)\s+([\d.]+)/gim),
      ].map((match) => `${match[1]} ${match[2]}`);
      return `${file.name}: ${hostname ? `hostname ${hostname}; ` : ""}${interfaces.length} interfaces${interfaces.length ? ` (${interfaces.slice(0, 12).join(", ")})` : ""}; ${addresses.length} IPv4 assignments${addresses.length ? ` (${addresses.slice(0, 12).join(", ")})` : ""}.`;
    }
    return `${file.name}: ${text.split(/\r?\n/).length} lines. ${ar ? "تمت قراءة الملف كنص فقط؛ التحليل الدلالي لهذه الصيغة غير متاح محلياً." : "Read as text only; semantic analysis of this format is unavailable locally."}`;
  });
  return `${ar ? "فحص المرفقات محلياً" : "Local attachment inspection"}\n${summaries.map((summary) => `- ${summary}`).join("\n")}\n${ar ? "الفحص المحلي لا ينفذ الأوامر ولا يستنتج شبكة كاملة من ملف إعداد واحد. الذاكرة الحوارية والتعليمات الحرة تتطلب المحرك الخارجي." : "Local inspection does not execute commands or infer a complete network from one config. Conversational memory and free-form instructions require the external engine."}`;
}
