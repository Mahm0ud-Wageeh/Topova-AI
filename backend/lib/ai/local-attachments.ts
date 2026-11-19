import {
  builtTopologySchema,
  workspaceStateSchema,
} from "@/lib/validators/schemas";
import type { ChatAttachment } from "../../src/storage/types";

/** Deep deterministic inspection of pasted/attached configs, JSON, CSV, logs, and images. */
export function localAttachmentContext(
  attachments: ChatAttachment[],
  ar: boolean,
): string {
  if (!attachments.length) return "";
  const summaries = attachments.map((file) => {
    const text = file.content;

    if (
      file.mimeType?.startsWith("image/") ||
      text.startsWith("data:image/")
    ) {
      const kb = Math.max(1, Math.round((text.length * 3) / 4 / 1024));
      return ar
        ? `**${file.name}** (صورة ~${kb} KB): تم استلام الصورة بنجاح. يتطلب التحليل البصري الكامل للمخططات والنصوص داخل الصور تفعيل المحرك الذكي السحابي.`
        : `**${file.name}** (Image ~${kb} KB): Received cleanly. Full visual diagram & OCR inspection requires the cloud AI engine.`;
    }

    if (/\.json$/i.test(file.name) || /^\s*[{[]/.test(text)) {
      try {
        const parsed: unknown = JSON.parse(text);
        const workspace = workspaceStateSchema.safeParse(parsed);
        const topology = builtTopologySchema.safeParse(parsed);
        const graph = workspace.success
          ? workspace.data.topology
          : topology.success
            ? topology.data
            : null;
        if (graph) {
          return `${file.name}: ${graph.devices.length} devices, ${graph.connections.length} links. ${ar ? "بيانات مخطط شبكة صالحة؛ لم تُطبق على الرسم تلقائياً." : "Valid topology data; not automatically applied to the canvas."}`;
        }
        const keys =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? Object.keys(parsed as Record<string, unknown>).slice(0, 8)
            : [];
        return `${file.name}: ${ar ? `ملف JSON صالح${keys.length ? ` (المفاتيح: ${keys.join("، ")})` : ""}.` : `Valid JSON${keys.length ? ` (keys: ${keys.join(", ")})` : ""}.`}`;
      } catch {
        if (/\.json$/i.test(file.name)) {
          return `${file.name}: ${ar ? "ملف JSON غير صالح." : "Invalid JSON."}`;
        }
      }
    }

    const looksLikeCisco =
      /\.(cfg|conf|txt)$/i.test(file.name) ||
      /(^hostname\s+|^interface\s+|ip address\s+\d|router\s+(ospf|eigrp|bgp|rip)|access-list\s+)/im.test(
        text,
      );

    if (looksLikeCisco) {
      const hostname = /^hostname\s+(\S+)/im.exec(text)?.[1];
      const interfaces = [...text.matchAll(/^interface\s+(\S+)/gim)].map(
        (m) => m[1],
      );
      const addresses = [
        ...text.matchAll(/^\s*ip address\s+([\d.]+)\s+([\d.]+)/gim),
      ].map((m) => `${m[1]} ${m[2]}`);
      const vlans = [...text.matchAll(/^vlan\s+(\d+)/gim)].map((m) => m[1]);
      const routing = [
        ...text.matchAll(/^router\s+(ospf|eigrp|bgp|rip)\b/gim),
      ].map((m) => m[1].toUpperCase());
      const aclCount = (text.match(/^(?:ip\s+)?access-list\b/gim) ?? []).length;

      const warnings: string[] = [];
      if (/transport input\s+.*telnet/i.test(text)) {
        warnings.push(
          ar ? "بروتوكول Telnet غير المشفر مفعّل" : "Unencrypted Telnet enabled",
        );
      }
      if (
        /^enable password\s+/im.test(text) &&
        !/^enable secret\s+/im.test(text)
      ) {
        warnings.push(
          ar
            ? "استخدام enable password بدلاً من enable secret"
            : "Uses enable password instead of enable secret",
        );
      }
      if (/^no service password-encryption/im.test(text)) {
        warnings.push(
          ar
            ? "تشفير كلمات المرور معطّل (no service password-encryption)"
            : "Password encryption disabled",
        );
      }

      const details = [
        hostname ? `hostname ${hostname}` : null,
        `${interfaces.length} interfaces${interfaces.length ? ` (${interfaces.slice(0, 10).join(", ")})` : ""}`,
        `${addresses.length} IPv4${addresses.length ? ` (${addresses.slice(0, 8).join(", ")})` : ""}`,
        vlans.length ? `VLANs: ${[...new Set(vlans)].join(", ")}` : null,
        routing.length ? `Routing: ${[...new Set(routing)].join(", ")}` : null,
        aclCount ? `ACLs: ${aclCount}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      const warnSuffix = warnings.length
        ? `\n  - ${ar ? "تنبيهات أمنية:" : "Security flags:"} ${warnings.join(ar ? "، " : "; ")}`
        : "";
      return `**${file.name}**: ${details}.${warnSuffix}`;
    }

    const lineCount = text.split(/\r?\n/).length;
    return `**${file.name}**: ${lineCount} ${ar ? "سطر تم استلامه وقراءته بنجاح." : "lines read successfully."}`;
  });

  return `${ar ? "### تحليل المحتوى المرفق" : "### Attached Content Analysis"}\n${summaries.map((s) => `- ${s}`).join("\n")}\n${ar ? "الفحص المحلي لا ينفذ الأوامر ولا يستنتج شبكة كاملة من ملف إعداد واحد تلقائياً." : "Local inspection does not execute commands or infer a complete network from one config automatically."}`;
}
