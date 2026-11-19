import { useState } from "react";
import { Brain, Check, ChevronUp, ChevronDown, Wrench } from "lucide-react";
import { useLanguage } from "@/context/language-context";
import type { ChatMessageItem } from "./workspace-types";
/** Unified single collapsible reasoning + tool execution pill (zero visual clutter). */
export function UnifiedThinkingPill({
  steps,
  toolCalls,
  defaultOpen,
}: {
  steps?: ChatMessageItem["thinkingSteps"];
  toolCalls?: ChatMessageItem["toolCalls"];
  defaultOpen: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(defaultOpen);

  const stepList = steps ?? [];
  const toolList = toolCalls ?? [];
  const totalCount = stepList.length;

  if (totalCount === 0 && toolList.length === 0) return null;

  return (
    <div className="mb-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="glass-pill inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-primary/40 hover:text-foreground"
      >
        <Brain className="h-3.5 w-3.5 text-primary" />
        <span>
          {toolList.length > 0
            ? t(
                `تم التفكير وتنفيذ ${toolList.length} أداة هندسية`,
                `Thought & executed ${toolList.length} engineering tool${toolList.length > 1 ? "s" : ""}`,
              )
            : t(
                `خطوات التفكير (${totalCount})`,
                `Thinking process (${totalCount})`,
              )}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div className="glass-surface mt-2 space-y-2 rounded-2xl p-3.5">
          {stepList.map((step, idx) => (
            <div key={idx} className="flex items-start gap-2.5 text-xs">
              <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Check className="h-2.5 w-2.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p dir="auto" className="font-semibold text-foreground/90">
                  {step.title}
                </p>
                <p dir="auto" className="text-[11px] text-muted-foreground">
                  {step.detail}
                </p>
              </div>
            </div>
          ))}

          {toolList.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-border/50 pt-2">
              {toolList.map((tc, ti) => (
                <span
                  key={ti}
                  dir="ltr"
                  className="glass-pill inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[10px] text-muted-foreground"
                >
                  <Wrench className="h-3 w-3 text-primary" />
                  {tc.summary}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
