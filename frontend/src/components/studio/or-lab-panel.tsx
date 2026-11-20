import { useMemo, useState } from "react";
import { CheckCircle2, Gauge, GitBranch, Rocket, ShieldAlert, XCircle } from "lucide-react";
import {
  analyzeCapacity,
  designParetoFrontier,
  type ArchitectureCandidate,
  type ArchitectureKind,
  type DesignRequirements,
} from "@/lib/network-engine/or-optimizer";
import { verifyDesign } from "@/lib/network-engine/or-verify";
import type { AclRule, BuiltTopology, NetworkPlan } from "@/lib/network-engine/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";

interface OrLabPanelProps {
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls: AclRule[];
  onApplyArchitecture: (candidate: ArchitectureCandidate) => void;
  onEliminateSpofs: () => void;
}

type VendorName = NonNullable<DesignRequirements["vendors"]>[number];
const VENDORS: VendorName[] = ["Cisco", "Ubiquiti", "MikroTik", "Juniper"];

const SLA_OPTIONS = [
  { value: 0.999, label: "99.9%" },
  { value: 0.9999, label: "99.99%" },
];

function countOf(topology: BuiltTopology, type: string): number {
  return topology.devices.filter((d) => d.type === type).length;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(v >= 0.9999 ? 4 : 3)}%`;
}

export function OrLabPanel({ topology, plan, acls, onApplyArchitecture, onEliminateSpofs }: OrLabPanelProps) {
  const { t } = useLanguage();
  const [budget, setBudget] = useState(60_000);
  const [sla, setSla] = useState(0.9999);

  const base = useMemo(
    () => ({
      pcs: countOf(topology, "PC") || 40,
      servers: countOf(topology, "SERVER"),
      aps: countOf(topology, "AP"),
      cameras: countOf(topology, "CAMERA"),
      phones: countOf(topology, "IP_PHONE"),
      printers: countOf(topology, "PRINTER"),
    }),
    [topology],
  );
  const [vendors, setVendors] = useState<VendorName[]>([]);
  const pareto = useMemo(
    () => designParetoFrontier({ ...base, budgetUsd: budget, targetAvailability: sla, vendors }),
    [base, budget, sla, vendors],
  );
  const hasTopology = topology.devices.length > 0;
  const capacity = useMemo(() => (hasTopology ? analyzeCapacity(topology) : null), [topology, hasTopology]);
  const verification = useMemo(() => (hasTopology ? verifyDesign(topology, plan, acls) : null), [topology, plan, acls, hasTopology]);

  const kinds: { id: ArchitectureKind; ar: string; en: string }[] = [
    { id: "min-cost", ar: "الأقل تكلفة", en: "Min-Cost" },
    { id: "balanced", ar: "متوازن للمؤسسات", en: "Balanced Enterprise" },
    { id: "max-resilience", ar: "أقصى اعتمادية HA", en: "Max-Resilience HA" },
  ];

  const worst = capacity ? capacity.links.slice().sort((a, b) => b.utilization - a.utilization).slice(0, 4) : [];
  const n1Total = capacity?.n1.scenarios.length ?? 0;
  const n1Ok = capacity ? n1Total - capacity.n1.failing.length : 0;

  return (
    <div className="space-y-5 text-sm">
      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 font-display text-xs font-bold">
          <Rocket className="h-4 w-4 text-primary" />
          {t("جبهة باريتو: التكلفة × التأخير × الاعتمادية", "Pareto frontier: cost x latency x resilience")}
        </h3>
        <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-muted/20 p-3">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
            {t("سقف الميزانية (USD)", "Budget cap (USD)")}
            <input
              type="number"
              min={1000}
              step={1000}
              value={budget}
              onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0))}
              className="h-8 w-32 rounded-lg border bg-background px-2 font-mono text-xs text-foreground"
            />
          </label>
          <div className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
            {t("هدف التوافر", "Availability SLA")}
            <div className="flex gap-1">
              {SLA_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setSla(o.value)}
                  className={`h-8 rounded-lg border px-2.5 text-xs transition-colors ${
                    sla === o.value ? "border-primary bg-primary/15 text-primary" : "hover:bg-muted text-foreground"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
            {t("المورّد", "Vendor")}
            <div className="flex flex-wrap gap-1">
              {VENDORS.map((v) => {
                const on = vendors.includes(v);
                return (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setVendors((prev) => (on ? prev.filter((x) => x !== v) : [...prev, v]))}
                    className={`h-8 rounded-lg border px-2.5 text-xs transition-colors ${
                      on ? "border-primary bg-primary/15 text-primary" : "text-foreground hover:bg-muted"
                    }`}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            {pareto.derived.accessPorts} ports · {pareto.derived.poePorts} PoE · {pareto.derived.poeWatts} W · {pareto.requirements.peakTrafficMbps} Mbps
          </p>
        </div>

        {!pareto.feasible && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-xs text-red-600 dark:text-red-300">
            {pareto.reason}
          </p>
        )}
        {pareto.feasible && pareto.reason && (
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300">
            {pareto.reason}
          </p>
        )}

        <div className="grid gap-2.5 sm:grid-cols-1 2xl:grid-cols-3">
          {kinds.map((k) => {
            const c = pareto.picks[k.id];
            if (!c) return null;
            return (
              <article key={k.id} className="flex flex-col gap-2 rounded-xl border bg-card p-3 transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold">{t(k.ar, k.en)}</h4>
                  <div className="flex gap-1">
                    <Badge variant={c.survivesN1 ? "success" : "warning"} className="text-[10px]">
                      {c.survivesN1 ? "N-1 ✓" : t("بلا N-1", "No N-1")}
                    </Badge>
                    <Badge variant={c.meetsSla ? "success" : "warning"} className="text-[10px]">
                      {c.meetsSla ? t("يحقق SLA", "Meets SLA") : t("دون SLA", "Below SLA")}
                    </Badge>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
                  <dt className="text-muted-foreground">{t("التكلفة", "CAPEX")}</dt>
                  <dd dir="ltr" className="text-end font-semibold">${c.costUsd.toLocaleString("en-US")}</dd>
                  <dt className="text-muted-foreground">{t("التأخير", "Latency")}</dt>
                  <dd dir="ltr" className="text-end">{c.latencyMs} ms</dd>
                  <dt className="text-muted-foreground">{t("التوافر", "Availability")}</dt>
                  <dd dir="ltr" className="text-end">{pct(c.availability)}</dd>
                  <dt className="text-muted-foreground">{t("التوقف/سنة", "Downtime/yr")}</dt>
                  <dd dir="ltr" className="text-end">{c.downtimeMinPerYear} min</dd>
                  <dt className="text-muted-foreground">{t("البنية", "Layout")}</dt>
                  <dd dir="ltr" className="text-end">{c.coreRouters}R · {c.firewalls}FW · {c.ispLinks}ISP · {c.uplinkMbps / 1000}G</dd>
                </dl>
                <p dir="ltr" className="text-[10px] text-muted-foreground">
                  {c.accessSwitches.map((i) => `${i.quantity}× ${i.sku}`).join(" + ")}
                </p>
                <Button size="sm" className="mt-auto h-8 text-xs" onClick={() => onApplyArchitecture(c)}>
                  {t("طبّق هذا التصميم", "Apply This Architecture")}
                </Button>
              </article>
            );
          })}
        </div>
        {pareto.feasible && (
          <p className="text-[10px] text-muted-foreground">
            {t(
              `${pareto.frontier.length} تصميمًا غير مهيمَن عليه من ${pareto.candidatesEvaluated} مرشحًا. الأسعار تقديرية وليست عروض أسعار.`,
              `${pareto.frontier.length} non-dominated of ${pareto.candidatesEvaluated} candidates. Prices are street estimates, not quotes.`,
            )}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 font-display text-xs font-bold">
          <Gauge className="h-4 w-4 text-primary" />
          {t("السعة والطوابير و N-1 للمخطط الحالي", "Capacity, queueing & N-1 for the live topology")}
        </h3>
        {!capacity ? (
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            {t("لا يوجد مخطط نشط بعد. طبّق أحد التصاميم أعلاه.", "No active topology yet. Apply one of the architectures above.")}
          </p>
        ) : (
          <div className="space-y-3 rounded-xl border bg-card p-3">
            <div className="grid grid-cols-3 gap-2 text-center font-mono text-[11px]">
              <div className="rounded-lg bg-muted/40 p-2">
                <p dir="ltr" className="text-sm font-bold">{capacity.maxFlowMbps}/{capacity.totalDemandMbps}</p>
                <p className="text-muted-foreground">{t("أقصى تدفق Mbps", "Max-flow Mbps")}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2">
                <p dir="ltr" className="text-sm font-bold">ρ {capacity.worstUtilization}</p>
                <p className="text-muted-foreground">{t("أسوأ رابط", "Worst link")}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-2">
                <p dir="ltr" className="text-sm font-bold">{n1Ok}/{n1Total}</p>
                <p className="text-muted-foreground">{t("نجاة N-1", "N-1 survived")}</p>
              </div>
            </div>

            <div>
              <p className="mb-1 text-[11px] font-semibold">{t("عنق الزجاجة (M/M/1)", "Bottleneck meter (M/M/1)")}</p>
              <ul className="space-y-1.5">
                {worst.map((l) => (
                  <li key={l.id} className="space-y-0.5">
                    <div dir="ltr" className="flex justify-between font-mono text-[10px]">
                      <span>{l.from}↔{l.to}</span>
                      <span>{l.loadMbps}/{l.capacityMbps} Mbps · W={l.delayMs === null ? "∞" : `${l.delayMs} ms`}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={1} aria-valuenow={Math.min(1, l.utilization)}>
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          l.utilization >= 0.85 ? "bg-red-500" : l.utilization >= 0.8 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${Math.min(100, l.utilization * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-start justify-between gap-2 rounded-lg border p-2.5">
              <div className="flex items-start gap-2 text-xs">
                {capacity.n1.survivesAll ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                )}
                <span>
                  {capacity.n1.survivesAll
                    ? t("كل عطل فردي لرابط أو جهاز يبقى فيه كامل الحمل.", "Every single link/device failure keeps the full load flowing.")
                    : t(
                        `${capacity.n1.failing.length} سيناريو N-1 يفقد حركة. الأسوأ: ${capacity.n1.failing[0]?.label} (${capacity.n1.failing[0]?.servedPercent}%).`,
                        `${capacity.n1.failing.length} N-1 scenario(s) drop traffic. First: ${capacity.n1.failing[0]?.label} (${capacity.n1.failing[0]?.servedPercent}% served).`,
                      )}
                </span>
              </div>
              {!capacity.n1.survivesAll && (
                <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-[11px]" onClick={onEliminateSpofs}>
                  <GitBranch className="h-3.5 w-3.5" />
                  {t("أزل نقاط الفشل", "Fix SPOFs")}
                </Button>
              )}
            </div>
          </div>
        )}
      </section>

      {verification && (
        <section className="space-y-2">
          <h3 className="font-display text-xs font-bold">{t("التحقق الحتمي", "Deterministic verification")}</h3>
          <ul className="space-y-1">
            {verification.checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2 rounded-lg border p-2 text-xs">
                {c.status === "pass" ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : c.status === "warn" ? (
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                )}
                <span>
                  <strong>{c.title}:</strong> {c.detail}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
