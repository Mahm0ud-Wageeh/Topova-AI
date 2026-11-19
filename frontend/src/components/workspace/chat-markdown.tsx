import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(text.slice(last, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={key++}
          dir="ltr"
          className="mx-0.5 inline-block rounded-md bg-muted/90 px-1.5 py-0.5 font-mono text-[0.86em] text-cyan"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    last = regex.lastIndex;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }
  return parts;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore clipboard errors
    }
  }

  return (
    <div dir="ltr" className="my-3 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-3.5 py-2 font-mono text-[11px] text-slate-400">
        <span>{lang || "cli"}</span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto p-3.5 font-mono text-xs leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function detectRtl(text: string): boolean {
  const arMatches = text.match(/[\u0600-\u06FF]/g)?.length ?? 0;
  return arMatches >= 6;
}

/** Fluid, ChatGPT/Claude-grade Markdown renderer with clean RTL/LTR direction lock. */
export function ChatMarkdown({ content }: { content: string }) {
  const isRtl = detectRtl(content);
  const blockDir = isRtl ? "rtl" : "ltr";

  const segments: Array<{ type: "text"; body: string } | { type: "code"; lang: string; body: string }> = [];
  const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", body: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: "code", lang: match[1] || "", body: match[2].replace(/\n$/, "") });
    lastIndex = fenceRegex.lastIndex;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", body: content.slice(lastIndex) });
  }

  return (
    <div dir={blockDir} className="space-y-3 text-[15px] leading-8 text-foreground/95">
      {segments.map((seg, segIdx) => {
        if (seg.type === "code") {
          return <CodeBlock key={segIdx} lang={seg.lang} code={seg.body} />;
        }

        const lines = seg.body.split(/\r?\n/);
        const nodes: ReactNode[] = [];
        let i = 0;

        while (i < lines.length) {
          const line = lines[i].trim();
          if (!line) {
            i++;
            continue;
          }

          if (/^---+$/.test(line)) {
            nodes.push(<hr key={i} className="my-3 border-border/60" />);
            i++;
            continue;
          }

          const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
          if (headingMatch) {
            const level = headingMatch[1].length;
            const cls =
              level <= 2
                ? "mt-4 text-lg font-bold tracking-tight text-foreground"
                : "mt-3 text-base font-bold text-foreground";
            nodes.push(
              <p key={i} className={cls}>
                {renderInline(headingMatch[2])}
              </p>,
            );
            i++;
            continue;
          }

          if (line.includes("|") && i + 1 < lines.length && /^\|?[\s:-]+\|[\s|:-]+$/.test(lines[i + 1].trim())) {
            const parseRow = (r: string) =>
              r
                .trim()
                .replace(/^\|/, "")
                .replace(/\|$/, "")
                .split("|")
                .map((c) => c.trim());
            const headers = parseRow(line);
            const rows: string[][] = [];
            i += 2;
            while (i < lines.length && lines[i].trim().includes("|")) {
              rows.push(parseRow(lines[i]));
              i++;
            }
            nodes.push(
              <div key={`tbl-${i}`} className="my-3 overflow-x-auto rounded-xl border bg-card/40">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {headers.map((h, hi) => (
                        <th key={hi} className="px-3 py-2.5 text-start font-semibold">
                          {renderInline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={ri} className="border-b last:border-0">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-muted-foreground">
                            {renderInline(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>,
            );
            continue;
          }

          if (/^([-*•]|\d+\.)\s+/.test(line)) {
            const listItems: string[] = [];
            const ordered = /^\d+\.\s+/.test(line);
            while (i < lines.length && /^([-*•]|\d+\.)\s+/.test(lines[i].trim())) {
              listItems.push(lines[i].trim().replace(/^([-*•]|\d+\.)\s+/, ""));
              i++;
            }
            const Tag = ordered ? "ol" : "ul";
            nodes.push(
              <Tag
                key={`list-${i}`}
                className={`my-2 space-y-1.5 ps-6 ${ordered ? "list-decimal" : "list-disc"}`}
              >
                {listItems.map((item, li) => (
                  <li key={li} className="leading-8">
                    {renderInline(item)}
                  </li>
                ))}
              </Tag>,
            );
            continue;
          }

          nodes.push(
            <p key={i} className="whitespace-pre-wrap break-words leading-8">
              {renderInline(line)}
            </p>,
          );
          i++;
        }

        return <div key={segIdx}>{nodes}</div>;
      })}
    </div>
  );
}
