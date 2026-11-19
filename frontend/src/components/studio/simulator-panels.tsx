import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Flame,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Skull,
  Zap,
} from "lucide-react";
import type { AttackSimulationResult } from "@/lib/network-engine/attack-sim";
import type { TrafficForecastResult, TrafficProfile } from "@/lib/network-engine/traffic";
import type {
  BuiltTopology,
  FaultState,
  PacketTraceResult,
  SpofAnalysis,
} from "@/lib/network-engine/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/language-context";

/* ---------------- 1. PACKET FLOW & CHAOS SPOF PANEL ---------------- */
export function PacketSimulatorPanel({
  topology,
  spof,
  faults,
  chaosMode,
  trace,
  activeHopIndex,
  onToggleChaos,
  onResetFaults,
  onRunTrace,
}: {
  topology: BuiltTopology;
  spof: SpofAnalysis;
  faults: FaultState;
  chaosMode: boolean;
  trace: PacketTraceResult | null;
  activeHopIndex: number;
  onToggleChaos: () => void;
  onResetFaults: () => void;
  onRunTrace: (req: { sourceId: string; destinationId: string; protocol: "ICMP" | "TCP" | "UDP"; port?: number }) => void;
}) {
  const { t } = useLanguage();
  const [src, setSrc] = useState(topology.devices[topology.devices.length - 1]?.id ?? "");
  const [dst, setDst] = useState(topology.devices.find((d) => d.type === "SERVER")?.id ?? topology.devices[0]?.id ?? "");
  const [protocol, setProtocol] = useState<"ICMP" | "TCP" | "UDP">("TCP");
  const [port, setPort] = useState("443");

  const validSrc = topology.devices.some((d) => d.id === src) ? src : topology.devices[0]?.id ?? "";
  const validDst = topology.devices.some((d) => d.id === dst) ? dst : topology.devices[topology.devices.length - 1]?.id ?? "";
  const faultCount = faults.disabledDevices.length + faults.disabledLinks.length;

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold flex items-center gap-1.5">
            <Play className="h-4 w-4 text-cyan" />
            {t("تتبع حزمة البيانات", "Live Packet Flow")}
          </span>
          <Badge variant="ai">L2/L3 + ACL</Badge>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs">
            {t("المصدر", "Source")}
            <select
              value={validSrc}
              onChange={(e) => setSrc(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 font-mono text-xs"
            >
              {topology.devices.map((d) => (
                <option key={d.id} value={d.id}>{d.label} ({d.type})</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            {t("الوجهة", "Destination")}
            <select
              value={validDst}
              onChange={(e) => setDst(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 font-mono text-xs"
            >
              {topology.devices.map((d) => (
                <option key={d.id} value={d.id}>{d.label} ({d.type})</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            {t("البروتوكول", "Protocol")}
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value as "ICMP" | "TCP" | "UDP")}
              className="h-8 rounded-md border bg-background px-2 font-mono text-xs"
            >
              <option value="ICMP">ICMP (Ping)</option>
              <option value="TCP">TCP</option>
              <option value="UDP">UDP</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs">
            {t("المنفذ", "Port")}
            <Input
              dir="ltr"
              type="number"
              disabled={protocol === "ICMP"}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="h-8 font-mono text-xs"
            />
          </label>
        </div>

        <Button
          size="sm"
          className="w-full"
          disabled={!validSrc || !validDst}
          onClick={() =>
            onRunTrace({
              sourceId: validSrc,
              destinationId: validDst,
              protocol,
              port: protocol === "ICMP" ? undefined : Number(port) || 443,
            })
          }
        >
          <Play className="h-3.5 w-3.5" />
          {t("إطلاق الحزمة ومحاكاة المسار", "Send Animated Packet")}
        </Button>
      </div>

      {trace && (
        <div className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Badge variant={trace.reachable ? "success" : "destructive"}>{trace.verdict.toUpperCase()}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{trace.totalLatencyMs} ms</span>
          </div>
          <p className="text-xs text-muted-foreground">{trace.summary}</p>
          <ol className="space-y-1.5 pt-1">
            {trace.hops.map((hop, idx) => (
              <li
                key={`${hop.step}-${hop.deviceId}`}
                className={`rounded-md border p-2 text-xs transition-colors ${
                  idx === activeHopIndex ? "border-cyan bg-cyan/10" : "bg-muted/20"
                }`}
              >
                <div className="flex items-center justify-between font-mono">
                  <span className="font-bold">
                    #{hop.step} {hop.label}
                  </span>
                  <span className="text-[10px] text-cyan">
                    {hop.layer} · TTL {hop.ttl} {hop.vlanTag ? `· V${hop.vlanTag}` : ""}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{hop.reason}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Chaos Fault Injection & Tarjan SPOF */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold flex items-center gap-1.5 text-amber-400">
            <Flame className="h-4 w-4" />
            {t("وضع الفوضى وكشف SPOF", "Chaos Mode & Tarjan SPOF")}
          </span>
          <Badge variant="warning">{spof.redundancyScore}/100</Badge>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={chaosMode ? "destructive" : "outline"}
            className="flex-1"
            onClick={onToggleChaos}
          >
            <Zap className="h-3.5 w-3.5" />
            {chaosMode ? t("إيقاف وضع الأعطال", "Exit Chaos Mode") : t("تفعيل قطع الروابط", "Enable Chaos Mode")}
          </Button>
          {faultCount > 0 && (
            <Button size="sm" variant="ghost" onClick={onResetFaults} title={t("استعادة الكل", "Restore all")}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
          <div className="rounded border bg-background/60 p-1.5">
            <p className="font-mono font-bold text-amber-400">{spof.criticalDevices.length}</p>
            <p className="text-[10px] text-muted-foreground">{t("نقاط فشل", "SPOF Nodes")}</p>
          </div>
          <div className="rounded border bg-background/60 p-1.5">
            <p className="font-mono font-bold text-rose-400">{spof.unreachableDevices.length}</p>
            <p className="text-[10px] text-muted-foreground">{t("معزول", "Isolated")}</p>
          </div>
          <div className="rounded border bg-background/60 p-1.5">
            <p className="font-mono font-bold text-emerald-400">{Math.round(spof.connectedRatio * 100)}%</p>
            <p className="text-[10px] text-muted-foreground">{t("متصل", "Online")}</p>
          </div>
        </div>
        {spof.suggestions.map((s, i) => (
          <p key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            {s}
          </p>
        ))}
      </div>
    </div>
  );
}

/* ---------------- 2. RED-TEAM ATTACK-PATH SIMULATOR ---------------- */
export function AttackSimulatorPanel({
  topology,
  attack,
  onRunAttack,
  onClearAttack,
  onContainZeroTrust,
}: {
  topology: BuiltTopology;
  attack: AttackSimulationResult | null;
  onRunAttack: (entryId: string) => void;
  onClearAttack: () => void;
  onContainZeroTrust: () => void;
}) {
  const { t } = useLanguage();
  const defaultEntry =
    topology.devices.find((d) => d.type === "CAMERA" || d.type === "AP" || d.type === "PC")?.id ??
    topology.devices[0]?.id ??
    "";
  const [entryId, setEntryId] = useState(defaultEntry);
  const validEntry = topology.devices.some((d) => d.id === entryId) ? entryId : defaultEntry;

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold flex items-center gap-1.5 text-rose-400">
            <Skull className="h-4 w-4" />
            {t("محاكي الهجمات والحركة الجانبية", "Red-Team Attack Simulator")}
          </span>
          <Badge variant="destructive">RED TEAM</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "اختر جهازاً مخترقاً لاختبار مدى قدرة المهاجم على الوصول إلى الخوادم والراوترات الحساسة.",
            "Pick a compromised entry node to calculate exact lateral movement blast radius against critical servers & routers.",
          )}
        </p>

        <label className="grid gap-1 text-xs">
          {t("نقطة الاختراق الافتراضية", "Compromised Entry Node")}
          <select
            value={validEntry}
            onChange={(e) => setEntryId(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 font-mono text-xs"
          >
            {topology.devices.map((d) => (
              <option key={d.id} value={d.id}>{d.label} ({d.type})</option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <Button size="sm" variant="destructive" className="flex-1" disabled={!validEntry} onClick={() => onRunAttack(validEntry)}>
            <ShieldAlert className="h-3.5 w-3.5" />
            {t("محاكاة الانتشار الجانبي", "Simulate Attack")}
          </Button>
          {attack && (
            <Button size="sm" variant="outline" onClick={onClearAttack}>
              {t("مسح", "Clear")}
            </Button>
          )}
        </div>
      </div>

      {attack && (
        <div className="rounded-lg border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{t("نطاق الخطر على الأصول الحساسة", "Critical Asset Exposure")}</p>
              <p className={`font-mono text-2xl font-bold ${attack.contained ? "text-emerald-400" : "text-rose-400"}`}>
                {attack.blastRadiusPercent}%
              </p>
            </div>
            <Badge variant={attack.contained ? "success" : "destructive"}>
              {attack.contained ? t("مُحتوى بالكامل", "CONTAINED") : `${attack.exposedCriticalAssets.length} ${t("معرّض", "EXPOSED")}`}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{attack.recommendation}</p>
          {!attack.contained && (
            <Button size="sm" className="w-full gap-1.5" onClick={onContainZeroTrust}>
              <ShieldCheck className="h-4 w-4" />
              {t("تطبيق العزل الصفري وإعادة الفحص", "Apply Zero-Trust Containment")}
            </Button>
          )}
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {attack.steps.map((s) => (
              <div key={s.targetId} className="rounded border bg-muted/20 p-2 text-xs">
                <div className="flex items-center justify-between font-mono">
                  <span className="font-bold">{s.targetLabel}</span>
                  <Badge variant={s.severity === "contained" ? "success" : "destructive"} className="text-[10px]">
                    {s.severity.toUpperCase()}
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{s.vector}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 3. TRAFFIC LOAD & BOTTLENECK FORECASTER ---------------- */
export function TrafficLoadPanel({
  profile,
  multiplier,
  showHeatmap,
  traffic,
  onProfileChange,
  onMultiplierChange,
  onToggleHeatmap,
}: {
  profile: TrafficProfile;
  multiplier: number;
  showHeatmap: boolean;
  traffic: TrafficForecastResult;
  onProfileChange: (p: TrafficProfile) => void;
  onMultiplierChange: (m: number) => void;
  onToggleHeatmap: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-semibold flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-cyan" />
            {t("محاكي الأحمال والازدحام", "Traffic Load Forecaster")}
          </span>
          <Button size="sm" variant={showHeatmap ? "default" : "outline"} className="h-7 text-xs" onClick={onToggleHeatmap}>
            {showHeatmap ? t("إخفاء الخريطة", "Heatmap ON") : t("تفعيل الخريطة", "Heatmap OFF")}
          </Button>
        </div>

        <label className="grid gap-1 text-xs">
          {t("نمط التشغيل", "Workload Profile")}
          <select
            value={profile}
            onChange={(e) => onProfileChange(e.target.value as TrafficProfile)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="office">{t("مكاتب عادية", "Standard Office")}</option>
            <option value="surveillance">{t("مراقبة كاميرات 4K", "4K CCTV Surveillance")}</option>
            <option value="voip">{t("اتصالات VoIP مكثفة", "Heavy VoIP / Unified Comms")}</option>
            <option value="cloud-backup">{t("نسخ احتياطي سحابي", "Cloud Backup Burst")}</option>
          </select>
        </label>

        <label className="grid gap-1 text-xs">
          <div className="flex justify-between">
            <span>{t("مضاعف الضغط", "Stress Multiplier")}</span>
            <span className="font-mono font-bold text-primary">{multiplier.toFixed(1)}x</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={5}
            step={0.5}
            value={multiplier}
            onChange={(e) => onMultiplierChange(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </label>

        <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
          <div className="rounded border bg-background/60 p-1.5">
            <p className="font-mono font-bold">{traffic.totalDemandMbps}M</p>
            <p className="text-[10px] text-muted-foreground">{t("إجمالي الطلب", "Demand")}</p>
          </div>
          <div className="rounded border bg-background/60 p-1.5">
            <p className="font-mono font-bold text-amber-400">{traffic.peakUtilizationPercent}%</p>
            <p className="text-[10px] text-muted-foreground">{t("الذروة", "Peak Util")}</p>
          </div>
          <div className="rounded border bg-background/60 p-1.5">
            <p className="font-mono font-bold text-rose-400">{traffic.congestedLinks}</p>
            <p className="text-[10px] text-muted-foreground">{t("مختنقة", "Bottlenecks")}</p>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        {traffic.links.map((l) => (
          <div key={l.linkId} className="rounded-md border p-2 text-xs">
            <div className="flex items-center justify-between font-mono">
              <span className="font-semibold">
                {l.from} ↔ {l.to}
              </span>
              <Badge
                variant={l.status === "congested" ? "destructive" : l.status === "elevated" ? "warning" : "success"}
                className="text-[10px]"
              >
                {l.loadMbps} / {l.capacityMbps} Mbps ({l.utilizationPercent}%)
              </Badge>
            </div>
            {l.recommendation && <p className="mt-1 text-[11px] text-amber-400">{l.recommendation}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
