import { useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/api/client";
import { compareWorkspaces } from "@/lib/design/workspace-diff";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import type { ConversationDetail } from "./workspace-types";

export function DesignReview({
  conversation,
  onChange,
}: {
  conversation: ConversationDetail;
  onChange: (value: ConversationDetail) => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const revisions = conversation.workspaceRevisions ?? [];
  const proposal = conversation.pendingProposal;
  const revision = revisions.find((r) => r.number === selected) ?? revisions[0];
  const baseline = proposal ? conversation.workspaceState : revision?.snapshot;
  const target = proposal?.state ?? conversation.workspaceState;
  const changes = target ? compareWorkspaces(baseline, target) : [];
  async function action(path: string, body: object) {
    setBusy(true);
    try {
      const response = await apiRequest<{ conversation: ConversationDetail }>(
        `/api/v1/conversations/${conversation.id}/${path}`,
        { body: { ...body, expectedVersion: conversation.version ?? 1 } },
      );
      onChange(response.conversation);
      toast.success(t("تم حفظ التغيير.", "Change saved."));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("تعذر الحفظ. أعد المحاولة.", "Could not save. Retry."),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      open={proposal ? true : undefined}
      className="mx-3 mb-1.5 max-h-[40dvh] overflow-auto rounded-xl border bg-card p-2.5 sm:mx-6 sm:mb-2 sm:p-3"
    >
      <summary className="cursor-pointer text-xs font-semibold sm:text-sm">
        {proposal
          ? t(
              "راجع تعديلات الذكاء الاصطناعي قبل التطبيق",
              "Review AI changes before applying",
            )
          : t(
              "سجل النسخ والمقارنة والاسترجاع",
              "Version history, comparison & restore",
            )}{" "}
        {proposal ? `(${changes.length})` : `(${revisions.length})`}
      </summary>
      <div className="mt-3 space-y-3">
        {!proposal && (
          <label className="flex flex-wrap items-center gap-2 text-xs">
            {t(
              "قارن التصميم الحالي بالنسخة",
              "Compare current design with revision",
            )}
            <select
              aria-label={t("النسخة المرجعية", "Baseline revision")}
              className="min-h-11 rounded-md border bg-background px-2"
              value={revision?.number ?? ""}
              onChange={(event) => setSelected(Number(event.target.value))}
            >
              {revisions.map((entry) => (
                <option key={entry.number} value={entry.number}>
                  #{entry.number} · {entry.note}
                </option>
              ))}
            </select>
          </label>
        )}
        <ul className="space-y-2 text-xs">
          {changes.map((change, i) => (
            <li key={i} className="break-words border-b pb-2 last:border-0">
              <strong>
                {change.area} · {change.name}
              </strong>{" "}
              —{" "}
              {t(
                change.kind === "added"
                  ? "إضافة"
                  : change.kind === "removed"
                    ? "حذف"
                    : "تعديل",
                change.kind,
              )}
              {change.before && (
                <div className="mt-1 text-muted-foreground" dir="auto">
                  {t("قبل:", "Before:")} {change.before}
                </div>
              )}
              {change.after && (
                <div className="mt-1" dir="auto">
                  {t("بعد:", "After:")} {change.after}
                </div>
              )}
            </li>
          ))}
        </ul>
        {!changes.length && (
          <p className="text-xs text-muted-foreground">
            {t(
              "لا توجد اختلافات عن النسخة المحددة.",
              "No differences from the selected revision.",
            )}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {proposal ? (
            <>
              <Button
                disabled={busy}
                onClick={() =>
                  void action("proposal", {
                    proposalId: proposal.id,
                    accept: true,
                  })
                }
              >
                {t("قبول وتطبيق التعديلات", "Accept & apply changes")}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void action("proposal", {
                    proposalId: proposal.id,
                    accept: false,
                  })
                }
              >
                {t("رفض التعديلات", "Reject changes")}
              </Button>
            </>
          ) : (
            revision && (
              <Button
                variant="outline"
                disabled={busy || !changes.length}
                onClick={() =>
                  void action("restore", { revision: revision.number })
                }
              >
                {t(
                  "استرجاع النسخة مع الاحتفاظ بالسجل",
                  "Restore revision & keep history",
                )}
              </Button>
            )
          )}
        </div>
      </div>
    </details>
  );
}
