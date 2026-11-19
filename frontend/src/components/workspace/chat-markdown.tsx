import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

export function detectTextDirection(text: string): "rtl" | "ltr" {
  const arMatches = text.match(/[\u0600-\u06FF]/g)?.length ?? 0;
  return arMatches >= 2 ? "rtl" : "ltr";
}

function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
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
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={key++} className="italic text-foreground/90">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={key++}
          dir="ltr"
          style={{ unicodeBidi: "isolate" }}
          className="mx-0.5 inline-block rounded-md border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[0.84em] text-foreground"
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
    <div
      dir="ltr"
      style={{ unicodeBidi: "isolate" }}
      className="glass-code my-3.5 overflow-hidden rounded-2xl text-zinc-100"
    >
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-2 font-mono text-[11px] text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="inline-flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </span>
          <span className="ms-1 text-zinc-300">{lang || "cli"}</span>
        </div>
        <button
          type="button"
          onClick={() => void handleCopy()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-0.5 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-80 overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Per-block bidirectional Markdown renderer with isolated LTR code & clean RTL Arabic flow. */
export function ChatMarkdown({ content }: { content: string }) {
  const rootDir = detectTextDirection(content);

  const segments: Array<
    { type: "text"; body: string } | { type: "code"; lang: string; body: string }
  > = [];
  const fenceRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        body: content.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: "code",
      lang: match[1] || "",
      body: match[2].replace(/\n$/, ""),
    });
    lastIndex = fenceRegex.lastIndex;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", body: content.slice(lastIndex) });
  }

  return (
    <div
      dir={rootDir}
      className="space-y-3 text-start text-[15px] leading-8 text-foreground/95"
    >
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
            nodes.push(<hr key={i} className="my-3 border-border/70" />);
            i++;
            continue;
          }

          // Blockquotes (> ...)
          if (line.startsWith(">")) {
            const quoteLines: string[] = [];
            while (i < lines.length && lines[i].trim().startsWith(">")) {
              quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
              i++;
            }
            const quoteText = quoteLines.join("\n");
            const quoteDir = detectTextDirection(quoteText);
            nodes.push(
              <blockquote
                key={`bq-${i}`}
                dir={quoteDir}
                className="glass-surface my-3 rounded-2xl px-4 py-3 text-sm leading-7 text-muted-foreground"
              >
                {quoteLines.map((ql, qi) => (
                  <p key={qi} className="whitespace-pre-wrap break-words">
                    {renderInline(ql)}
                  </p>
                ))}
              </blockquote>,
            );
            continue;
          }

          const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
          if (headingMatch) {
            const level = headingMatch[1].length;
            const headingDir = detectTextDirection(headingMatch[2]);
            const cls =
              level <= 2
                ? "mt-4 text-lg font-bold tracking-tight text-foreground"
                : "mt-3 text-base font-semibold text-foreground";
            nodes.push(
              <p key={i} dir={headingDir} className={cls}>
                {renderInline(headingMatch[2])}
              </p>,
            );
            i++;
            continue;
          }

          if (
            line.includes("|") &&
            i + 1 < lines.length &&
            /^\|?[\s:-]+\|[\s|:-]+$/.test(lines[i + 1].trim())
          ) {
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
              <div
                key={`tbl-${i}`}
                className="glass-surface my-3.5 overflow-x-auto rounded-2xl"
              >
                <table className="w-full border-collapse text-sm tabular-nums">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      {headers.map((h, hi) => (
                        <th
                          key={hi}
                          className="px-3.5 py-2.5 text-start font-semibold text-foreground"
                        >
                          {renderInline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, ri) => (
                      <tr key={ri} className="border-b last:border-0">
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="px-3.5 py-2 text-muted-foreground"
                          >
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
            while (
              i < lines.length &&
              /^([-*•]|\d+\.)\s+/.test(lines[i].trim())
            ) {
              listItems.push(
                lines[i].trim().replace(/^([-*•]|\d+\.)\s+/, ""),
              );
              i++;
            }
            const Tag = ordered ? "ol" : "ul";
            nodes.push(
              <Tag
                key={`list-${i}`}
                className={`my-2 space-y-1.5 ps-6 ${ordered ? "list-decimal" : "list-disc"}`}
              >
                {listItems.map((item, li) => (
                  <li
                    key={li}
                    dir={detectTextDirection(item)}
                    className="leading-8"
                  >
                    {renderInline(item)}
                  </li>
                ))}
              </Tag>,
            );
            continue;
          }

          nodes.push(
            <p
              key={i}
              dir={detectTextDirection(line)}
              className="whitespace-pre-wrap break-words leading-8"
            >
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

interface StreamingChatMarkdownProps {
  content: string;
  streaming: boolean;
  onProgress?: () => void;
  onComplete?: () => void;
}

/** Smooth 60fps word-snapped live typewriter reveal for incoming AI responses. */
export function StreamingChatMarkdown({
  content,
  streaming,
  onProgress,
  onComplete,
}: StreamingChatMarkdownProps) {
  const [visibleLen, setVisibleLen] = useState<number>(() =>
    streaming ? 0 : content.length,
  );
  const completedRef = useRef(!streaming);
  const onProgressRef = useRef(onProgress);
  const onCompleteRef = useRef(onComplete);
  onProgressRef.current = onProgress;
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!streaming) {
      setVisibleLen(content.length);
      completedRef.current = true;
      return;
    }

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setVisibleLen(content.length);
      completedRef.current = true;
      onCompleteRef.current?.();
      return;
    }

    completedRef.current = false;
    setVisibleLen(0);

    // Adaptive speed: crisp & natural for short replies, smooth ~2.5s cap for long replies
    const targetDurationMs = Math.min(3200, Math.max(700, content.length * 10));
    const charsPerMs = content.length / targetDurationMs;

    let rafId = 0;
    let startTime = 0;
    let lastScrollTick = 0;

    const step = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      let nextLen = Math.min(
        content.length,
        Math.max(1, Math.floor(elapsed * charsPerMs)),
      );

      // Snap to nearest whitespace boundary within +8 chars so Arabic ligatures never break mid-word
      if (nextLen < content.length) {
        const slice = content.slice(nextLen, nextLen + 8);
        const spaceIdx = slice.search(/[\s\n]/);
        if (spaceIdx > 0) {
          nextLen += spaceIdx;
        }
      }

      setVisibleLen(nextLen);

      if (now - lastScrollTick > 60) {
        lastScrollTick = now;
        onProgressRef.current?.();
      }

      if (nextLen >= content.length) {
        if (!completedRef.current) {
          completedRef.current = true;
          onProgressRef.current?.();
          onCompleteRef.current?.();
        }
        return;
      }

      rafId = requestAnimationFrame(step);
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [content, streaming]);

  if (!streaming || visibleLen >= content.length) {
    return <ChatMarkdown content={content} />;
  }

  let partial = content.slice(0, visibleLen);
  // Auto-close any open fenced code block while streaming so it renders cleanly inside its glass code card
  const fenceCount = (partial.match(/```/g) ?? []).length;
  if (fenceCount % 2 === 1) {
    partial += "\n```";
  }

  return (
    <div className="relative">
      <ChatMarkdown content={partial} />
      <span
        aria-hidden="true"
        className="streaming-caret mt-1"
      />
    </div>
  );
}
