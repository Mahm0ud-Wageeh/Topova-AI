import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Bot,
  Calculator,
  Check,
  Download,
  Send,
  ShieldCheck,
  Sparkles,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import type { SecurityAuditReport } from "@/lib/network-engine/auditor";
import type { BomEstimateReport, CostTierId } from "@/lib/network-engine/bom";
import type { CopilotProposal } from "@/lib/network-engine/copilot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/language-context";

/* ---------------- 1. CONVERSATIONAL AI CO-PILOT ---------------- */
export function CopilotPanel({
  proposal,
  busy,
  onSendInstruction,
  onApplyProposal,
  onDiscardProposal,
}: {
  proposal: CopilotProposal | null;
  busy: boolean;
  onSendInstruction: (instruction: string) => void;
  onApplyProposal: () => void;
  onDiscardProposal: () => void;
}) {
  const { t } = useLanguage();
  const [text, setText] = useState("");

  const quickPrompts = [
    t("أضف 4 كاميرات و NVR مع عزل VLAN", "Add 4 cameras and an NVR with VLAN isolation"),
    t("أضف جدار حماية وراوتر احتياطي مع OSPF", "Add a firewall and redundant router with OSPF"),
    t("طبّق العزل الصفري وقواعد ACL", "Apply Zero-Trust hardening and ACLs"),
    t("أضف 2 اكسس بوينت و 4 هواتف IP", "Add 2 access points and 4 IP phones"),
  ];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    onSendInstruction(text.trim());
    setText("");
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="ai-zone rounded-lg p-3 space-y-2.5">
        <div className="flex items-center gap-1.5 font-semibold text-cyan">
          <Bot className="h-4 w-4" />
          {t("المهندس الذكي التفاعلي", "AI Network Co-Pilot")}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "عدّل شبكتك الحية بالمحادثة؛ سيعرض لك النظام معاينة للفروقات قبل تطبيق أي تعديل.",
            "Iterate on your live topology in Arabic or English. Preview structural diffs before applying.",
          )}
        </p>

        <form onSubmit={submit} className="flex gap-1.5">
          <Input
            dir="auto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("اطلب تعديلاً على الشبكة...", "Ask to modify topology...")}
            className="h-8 text-xs"
          />
          <Button type="submit" size="sm" className="h-8 px-2.5" disabled={busy || !text.trim()}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>

        <div className="flex flex-wrap gap-1.5 pt-1">
          {quickPrompts.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onSendInstruction(p)}
              className="rounded-md border bg-background/70 px-2 py-1 text-[11px] text-muted-foreground hover:border-cyan hover:text-foreground"
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {proposal && (
        <div className="rounded-lg border border-cyan/50 bg-card p-3 space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="ai">{t("معاينة الفروقات", "DIFF PREVIEW")}</Badge>
            <div className="flex gap-1.5">
              <Button size="sm" className="h-7 gap-1 text-xs" onClick={onApplyProposal}>
                <Check className="h-3.5 w-3.5" />
                {t("تطبيق", "Apply")}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onDiscardProposal}>
                <X className="h-3.5 w-3.5" />
                {t("إلغاء", "Discard")}
              </Button>
            </div>
          </div>

          <p className="text-xs leading-5">{proposal.summary}</p>

          <div className="space-y-1 font-mono text-[11px]">
            {proposal.diff.addedDevices.map((d) => (
              <div key={d.id} className="text-emerald-400">
                + Device: {d.label} ({d.type})
              </div>
            ))}
            {proposal.diff.removedDevices.map((d) => (
              <div key={d.id} className="text-rose-400">
                - Device: {d.label} ({d.type})
              </div>
            ))}
            {proposal.diff.vlanChange && <div className="text-cyan">~ VLANs: {proposal.diff.vlanChange}</div>}
            {proposal.diff.routingChange && <div className="text-cyan">~ Routing: {proposal.diff.routingChange}</div>}
            {proposal.diff.aclDelta !== 0 && (
              <div className="text-emerald-400">
                {proposal.diff.aclDelta > 0 ? `+ ${proposal.diff.aclDelta}` : proposal.diff.aclDelta} Zero-Trust ACL rule(s)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 2. ZERO-TRUST SECURITY & RESILIENCE AUDITOR ---------------- */
export function SecurityAuditPanel({
  audit,
  onAutoRemediate,
}: {
  audit: SecurityAuditReport;
  onAutoRemediate: () => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{t("درجة الجاهزية والأمان", "Security & Resilience Score")}</p>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold text-primary">{audit.overallScore}</span>
              <span className="text-xs text-muted-foreground">/ 100</span>
            </div>
          </div>
          <Badge
            variant={audit.overallScore >= 85 ? "success" : audit.overallScore >= 60 ? "warning" : "destructive"}
            className="px-3 py-1 font-mono text-sm"
          >
            {audit.grade}
          </Badge>
        </div>

        <div className="space-y-2">
          {audit.pillars.map((p) => {
            const pct = Math.round((p.score / p.maxScore) * 100);
            return (
              <div key={p.id} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium">{p.label}</span>
                  <span className="font-mono">{p.score}/{p.maxScore}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      p.status === "strong" ? "bg-emerald-500" : p.status === "warning" ? "bg-amber-500" : "bg-rose-500"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">{p.detail}</p>
              </div>
            );
          })}
        </div>

        <Button size="sm" className="w-full gap-1.5" onClick={onAutoRemediate}>
          <Wand2 className="h-4 w-4" />
          {t("إصلاح تلقائي شامل (Zero-Trust + تكرار)", "One-Click Auto-Remediate")}
        </Button>
      </div>

      {audit.findings.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
          <ShieldCheck className="h-4 w-4" />
          {t("الشبكة مطابقة لأعلى معايير الأمان والتكرار.", "All security & resilience checks passed.")}
        </div>
      ) : (
        <div className="space-y-2">
          {audit.findings.map((f) => (
            <div key={f.id} className="rounded-lg border p-2.5 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                  {f.title}
                </span>
                <Badge variant={f.severity === "critical" ? "destructive" : "warning"} className="text-[10px]">
                  {f.severity.toUpperCase()}
                </Badge>
              </div>
              <p className="text-muted-foreground">{f.detail}</p>
              <p className="text-cyan">{f.remediation}</p>
            </div>
          ))}
        </div>
      )}

      {audit.recommendedAcls.length > 0 && (
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-cyan" />
            {t("قوائم الوصول الصفرية (ACL)", "Zero-Trust ACL Policies")} ({audit.recommendedAcls.length})
          </p>
          <div className="space-y-1 font-mono text-[11px]">
            {audit.recommendedAcls.map((r) => (
              <div key={r.id} className="rounded bg-slate-950 px-2 py-1 text-slate-200">
                <span className={r.action === "permit" ? "text-emerald-400" : "text-rose-400"}>
                  {r.action.toUpperCase()}
                </span>{" "}
                {r.protocol} V{r.sourceVlan} → V{r.destinationVlan}
                {r.port ? `:${r.port}` : ""}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 3. BOM, COST & POE POWER BUDGET ---------------- */
export function BomCostPanel({ bom }: { bom: BomEstimateReport }) {
  const { t } = useLanguage();
  const [tierId, setTierId] = useState<CostTierId>("enterprise");
  const tier = bom.tiers.find((x) => x.id === tierId) ?? bom.tiers[1];

  function downloadCsv() {
    const url = URL.createObjectURL(new Blob([bom.csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "nettopo-bom-enterprise.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-4 text-sm">
      {/* PoE Gauge */}
      <div className={`rounded-lg border p-3 space-y-2 ${bom.poe.overloaded ? "border-rose-500/50 bg-rose-500/10" : "bg-muted/30"}`}>
        <div className="flex items-center justify-between">
          <span className="font-semibold flex items-center gap-1.5">
            <Zap className={`h-4 w-4 ${bom.poe.overloaded ? "text-rose-400" : "text-amber-400"}`} />
            {t("ميزانية الطاقة PoE+", "PoE+ Power Budget")}
          </span>
          <Badge variant={bom.poe.overloaded ? "destructive" : "success"}>
            {bom.poe.requiredWatts}W / {bom.poe.availableWatts}W
          </Badge>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${bom.poe.overloaded ? "bg-rose-500" : "bg-cyan"}`}
            style={{ width: `${Math.min(100, bom.poe.utilizationPercent)}%` }}
          />
        </div>
        {bom.poe.overloaded && (
          <p className="text-xs font-medium text-rose-400">
            {t("تحذير: استهلاك PoE يتجاوز سعة السويتشات! أضف سويتش PoE+ إضافي.", "PoE overload! Add another PoE+ switch or upgrade to 740W models.")}
          </p>
        )}
      </div>

      {/* 3-Tier Switcher */}
      <div className="grid grid-cols-3 gap-1.5">
        {bom.tiers.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTierId(item.id)}
            className={`rounded-lg border p-2 text-start transition-colors ${
              item.id === tierId ? "border-primary bg-primary/10" : "bg-card hover:border-primary/40"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">{item.label.split(" ")[0]}</p>
            <p className="mt-0.5 font-mono text-sm font-bold">${item.totalUsd.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{item.rackUnits}U Rack</p>
          </button>
        ))}
      </div>

      <div className="rounded-lg border p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold flex items-center gap-1.5">
              <Calculator className="h-4 w-4 text-primary" />
              {tier.label}
            </p>
            <p className="text-[11px] text-muted-foreground">{tier.summary}</p>
          </div>
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={downloadCsv}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
        </div>

        <div className="divide-y text-xs">
          {tier.items.map((item) => (
            <div key={`${item.category}-${item.sku}`} className="flex items-center justify-between py-2">
              <div className="min-w-0">
                <p className="font-mono font-semibold truncate">{item.quantity}x {item.sku}</p>
                <p className="text-[11px] text-muted-foreground truncate">{item.description}</p>
              </div>
              <span className="font-mono font-semibold shrink-0 ms-2">${item.totalUsd.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
