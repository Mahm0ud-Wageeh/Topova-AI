import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  Calculator,
  Download,
  Flame,
  FlaskConical,
  ImageDown,
  Maximize2,
  Minimize2,
  Network,
  Play,
  ShieldAlert,
  ShieldCheck,
  Table2,
  X,
} from "lucide-react";
import {
  analyzeSpof,
  assignAddressing,
  auditSecurityResilience,
  autoRemediateTopology,
  cableFor,
  computeLayout,
  estimateBomAndPoe,
  forecastTraffic,
  simulateAttackPath,
  tracePacket,
} from "@/lib/network-engine";
import type { AttackSimulationResult } from "@/lib/network-engine/attack-sim";
import { planSpofElimination, type ArchitectureCandidate } from "@/lib/network-engine/or-optimizer";
import { materializeArchitecture } from "@/lib/network-engine/or-verify";
import type { TrafficProfile } from "@/lib/network-engine/traffic";
import type {
  FaultState,
  LayoutMode,
  PacketTraceResult,
} from "@/lib/network-engine/types";
import { CliTerminalModal } from "@/components/studio/cli-terminal-modal";
import { BomCostPanel, SecurityAuditPanel } from "@/components/studio/engineering-panels";
import { OrLabPanel } from "@/components/studio/or-lab-panel";
import { IpPlanPanel } from "@/components/studio/output-panels";
import { AttackSimulatorPanel, PacketSimulatorPanel, TrafficLoadPanel } from "@/components/studio/simulator-panels";
import { TopologyCanvas } from "@/components/studio/topology-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";
import type { ConversationWorkspaceState } from "./workspace-types";

type DrawerTab = "canvas" | "audit" | "packet" | "attack" | "traffic" | "bom" | "ipplan" | "orlab";

interface ArtifactDrawerProps {
  workspace: ConversationWorkspaceState;
  packetTrace: PacketTraceResult | null;
  attack: AttackSimulationResult | null;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onWorkspaceChange: (next: ConversationWorkspaceState) => void;
  onPacketTraceChange: (trace: PacketTraceResult | null) => void;
  onAttackChange: (attack: AttackSimulationResult | null) => void;
  onOpenExport: () => void;
  onClose: () => void;
}

export function ArtifactDrawer({
  workspace,
  packetTrace,
  attack,
  fullscreen = false,
  onToggleFullscreen,
  onWorkspaceChange,
  onPacketTraceChange,
  onAttackChange,
  onOpenExport,
  onClose,
}: ArtifactDrawerProps) {
  const { t } = useLanguage();
  const canvasBoxRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<DrawerTab>("canvas");
  const tabStripRef = useRef<HTMLDivElement>(null);
  // Keep the active tab visible in the horizontally scrolling strip on small screens.
  useEffect(() => {
    tabStripRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [tab]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cliDeviceId, setCliDeviceId] = useState<string | null>(null);
  const [chaosMode, setChaosMode] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [faults, setFaults] = useState<FaultState>({ disabledDevices: [], disabledLinks: [] });
  const [trafficProfile, setTrafficProfile] = useState<TrafficProfile>("office");
  const [trafficMult, setTrafficMult] = useState(1);

  async function handleExportPng() {
    if (!canvasBoxRef.current || tab !== "canvas") {
      setTab("canvas");
      toast.info(t("انتقلنا إلى المخطط — اضغط مرة أخرى لحفظ الصورة.", "Switched to Canvas — click again to export PNG."));
      return;
    }
    setExportingPng(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(canvasBoxRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#050b18",
      });
      const link = document.createElement("a");
      const slug = (workspace.projectName || "topova-blueprint")
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .toLowerCase();
      link.download = `${slug}-blueprint.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(t("تم حفظ صورة المخطط بدقة عالية (PNG).", "High-DPI blueprint PNG saved."));
    } catch {
      toast.error(t("تعذر تصدير الصورة.", "Could not export PNG."));
    } finally {
      setExportingPng(false);
    }
  }

  const addressing = useMemo(
    () => assignAddressing(workspace.topology, workspace.plan),
    [workspace],
  );
  const spof = useMemo(
    () => analyzeSpof(workspace.topology, workspace.plan, faults),
    [workspace, faults],
  );
  const audit = useMemo(
    () => auditSecurityResilience(workspace.topology, workspace.plan, workspace.acls, faults),
    [workspace, faults],
  );
  const bom = useMemo(
    () => estimateBomAndPoe(workspace.topology, workspace.plan),
    [workspace],
  );
  const traffic = useMemo(
    () => forecastTraffic(workspace.topology, workspace.plan, trafficProfile, trafficMult, faults),
    [workspace, trafficProfile, trafficMult, faults],
  );

  function relayout(mode: LayoutMode) {
    onWorkspaceChange({
      ...workspace,
      topology: {
        ...workspace.topology,
        layout: computeLayout(workspace.topology.devices, workspace.topology.connections, mode),
      },
    });
  }

  function connectDevices(from: string, to: string) {
    const exists = workspace.topology.connections.some(
      (c) => (c.from === from && c.to === to) || (c.from === to && c.to === from),
    );
    if (exists) return;
    const a = workspace.topology.devices.find((d) => d.id === from);
    const b = workspace.topology.devices.find((d) => d.id === to);
    onWorkspaceChange({
      ...workspace,
      topology: {
        ...workspace.topology,
        connections: [
          ...workspace.topology.connections,
          {
            id: `e${Date.now().toString(36)}`,
            from,
            to,
            meta: { cableType: a && b ? cableFor(a.type, b.type) : ("Straight-through" as const) },
          },
        ],
      },
    });
    toast.success(`${t("تم الربط:", "Connected")} ${from} ↔ ${to}`);
  }

  function applyArchitecture(candidate: ArchitectureCandidate) {
    const next = materializeArchitecture(candidate);
    onWorkspaceChange({ ...workspace, topology: next.topology, plan: next.plan, acls: next.acls });
    setTab("canvas");
    toast.success(t("تم تطبيق التصميم المُحسَّن.", "Optimized architecture applied."));
  }

  function eliminateSpofs() {
    const result = planSpofElimination(workspace.topology);
    if (result.addedLinks.length === 0) {
      toast.info(t("لا توجد نقاط فشل أحادية للإزالة.", "No single points of failure to remove."));
      return;
    }
    const stamp = Date.now().toString(36);
    onWorkspaceChange({
      ...workspace,
      topology: {
        ...workspace.topology,
        connections: [
          ...workspace.topology.connections,
          ...result.addedLinks.map((l, i) => {
            const a = workspace.topology.devices.find((d) => d.id === l.from);
            const b = workspace.topology.devices.find((d) => d.id === l.to);
            return {
              id: `opt${stamp}${i}`,
              from: l.from,
              to: l.to,
              meta: { cableType: a && b ? cableFor(a.type, b.type) : ("Fiber" as const) },
            };
          }),
        ],
      },
    });
    toast.success(
      t(
        `أُضيفت ${result.addedLinks.length} روابط احتياطية ($${result.totalCostUsd}).`,
        `Added ${result.addedLinks.length} redundant link(s) ($${result.totalCostUsd}).`,
      ),
    );
  }

  function handleAutoRemediate() {
    const fixed = autoRemediateTopology(workspace.topology, workspace.plan, workspace.acls);
    onWorkspaceChange({
      ...workspace,
      topology: fixed.topology,
      plan: fixed.plan,
      acls: fixed.acls,
    });
    toast.success(t("تم تطبيق التأمين والإصلاح التلقائي.", "Auto-remediation applied."));
  }

  const tabs: { id: DrawerTab; label: string; icon: typeof Network }[] = [
    { id: "canvas", label: t("المخطط", "Canvas"), icon: Network },
    { id: "audit", label: t("الأمان", "Audit"), icon: ShieldCheck },
    { id: "packet", label: t("الحزم", "Packet"), icon: Play },
    { id: "attack", label: t("اختراق", "Red-Team"), icon: ShieldAlert },
    { id: "traffic", label: t("الأحمال", "Traffic"), icon: Activity },
    { id: "bom", label: t("التكلفة", "BOM/PoE"), icon: Calculator },
    { id: "ipplan", label: t("العناوين", "IP/VLAN"), icon: Table2 },
    { id: "orlab", label: t("مختبر التحسين", "OR Lab"), icon: FlaskConical },
  ];

  return (
    <div className="flex h-full flex-col border-s bg-card">
      {/* Artifact Top Bar */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
            <Network className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-xs font-bold">{workspace.projectName}</p>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <span>{workspace.topology.devices.length} dev</span>
              <span>·</span>
              <span>{workspace.plan.routing.protocol}</span>
              <span>·</span>
              <Badge
                variant={audit.overallScore >= 85 ? "success" : audit.overallScore >= 60 ? "warning" : "destructive"}
                className="h-4 px-1 text-[9px]"
              >
                {audit.overallScore}/100
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon"
            variant="outline"
            className="h-9 w-9 sm:h-7 sm:w-7"
            disabled={exportingPng}
            onClick={() => void handleExportPng()}
            title={t("حفظ المخطط كصورة PNG عالية الدقة", "Download High-DPI PNG Blueprint")}
          >
            <ImageDown className="h-3.5 w-3.5 text-cyan" />
          </Button>
          {onToggleFullscreen && (
            <Button
              size="icon"
              variant="outline"
              className="hidden h-7 w-7 xl:inline-flex"
              onClick={onToggleFullscreen}
              title={fullscreen ? t("تصغير اللوحة", "Exit fullscreen") : t("توسيع ملء الشاشة", "Expand fullscreen")}
            >
              {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button
            size="sm"
            variant="default"
            className="h-9 gap-1 px-3 text-[11px] sm:h-7 sm:px-2.5"
            onClick={onOpenExport}
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Packet Tracer</span>
          </Button>
          <Button size="icon" variant="ghost" className="h-9 w-9 sm:h-7 sm:w-7" onClick={onClose} title={t("إغلاق اللوحة", "Close panel")}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tool Strip Tabs */}
      <div className="flex shrink-0 items-center justify-between gap-1 overflow-x-auto border-b bg-background/60 px-2 py-1.5">
        <div ref={tabStripRef} className="flex items-center gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              data-active={tab === item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-2 text-[11px] font-semibold transition-colors sm:px-2 sm:py-1 ${
                tab === item.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon className="h-3.5 w-3.5" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {tab === "canvas" && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setChaosMode((v) => !v)}
              title={t("وضع الأعطال والفوضى", "Toggle Chaos Fault Mode")}
              className={`inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[10px] font-semibold ${
                chaosMode ? "border-red-500 bg-red-500/15 text-red-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Flame className="h-3 w-3" />
              Chaos
            </button>
          </div>
        )}
      </div>

      {/* Active Body */}
      <div ref={canvasBoxRef} className="min-h-0 flex-1 overflow-hidden">
        {tab === "canvas" ? (
          <TopologyCanvas
            topology={workspace.topology}
            plan={workspace.plan}
            addressing={addressing}
            spof={spof}
            faults={faults}
            chaosMode={chaosMode}
            showHeatmap={showHeatmap}
            traffic={traffic}
            attack={attack}
            packetTrace={packetTrace}
            activeHopIndex={packetTrace ? packetTrace.hops.length - 1 : 0}
            selectedId={selectedId}
            onSelectDevice={setSelectedId}
            onOpenCli={(id) => setCliDeviceId(id)}
            onConnectDevices={connectDevices}
            onToggleDeviceFault={(id) =>
              setFaults((prev) => ({
                ...prev,
                disabledDevices: prev.disabledDevices.includes(id)
                  ? prev.disabledDevices.filter((x) => x !== id)
                  : [...prev.disabledDevices, id],
              }))
            }
            onToggleLinkFault={(id) =>
              setFaults((prev) => ({
                ...prev,
                disabledLinks: prev.disabledLinks.includes(id)
                  ? prev.disabledLinks.filter((x) => x !== id)
                  : [...prev.disabledLinks, id],
              }))
            }
            onRelayout={relayout}
            onPositionsChange={(layout) =>
              onWorkspaceChange({
                ...workspace,
                topology: { ...workspace.topology, layout },
              })
            }
          />
        ) : (
          <div className="h-full overflow-y-auto p-4">
            {tab === "audit" && <SecurityAuditPanel audit={audit} onAutoRemediate={handleAutoRemediate} />}
            {tab === "packet" && (
              <PacketSimulatorPanel
                topology={workspace.topology}
                spof={spof}
                faults={faults}
                chaosMode={chaosMode}
                trace={packetTrace}
                activeHopIndex={packetTrace ? packetTrace.hops.length - 1 : 0}
                onToggleChaos={() => setChaosMode((v) => !v)}
                onResetFaults={() => setFaults({ disabledDevices: [], disabledLinks: [] })}
                onRunTrace={(req) => {
                  const res = tracePacket(workspace.topology, workspace.plan, {
                    ...req,
                    faults,
                    acls: workspace.acls,
                  });
                  onPacketTraceChange(res);
                  onAttackChange(null);
                }}
              />
            )}
            {tab === "attack" && (
              <AttackSimulatorPanel
                topology={workspace.topology}
                attack={attack}
                onRunAttack={(entryId) => {
                  onPacketTraceChange(null);
                  onAttackChange(
                    simulateAttackPath(workspace.topology, workspace.plan, entryId, workspace.acls, faults),
                  );
                }}
                onClearAttack={() => onAttackChange(null)}
                onContainZeroTrust={handleAutoRemediate}
              />
            )}
            {tab === "traffic" && (
              <TrafficLoadPanel
                profile={trafficProfile}
                multiplier={trafficMult}
                showHeatmap={showHeatmap}
                traffic={traffic}
                onProfileChange={(p) => {
                  setTrafficProfile(p);
                  setShowHeatmap(true);
                }}
                onMultiplierChange={(m) => {
                  setTrafficMult(m);
                  setShowHeatmap(true);
                }}
                onToggleHeatmap={() => setShowHeatmap((v) => !v)}
              />
            )}
            {tab === "bom" && <BomCostPanel bom={bom} />}
            {tab === "ipplan" && <IpPlanPanel plan={workspace.plan} />}
            {tab === "orlab" && (
              <OrLabPanel
                topology={workspace.topology}
                plan={workspace.plan}
                acls={workspace.acls}
                onApplyArchitecture={applyArchitecture}
                onEliminateSpofs={eliminateSpofs}
              />
            )}
          </div>
        )}
      </div>

      {cliDeviceId && (
        <CliTerminalModal
          open={Boolean(cliDeviceId)}
          deviceId={cliDeviceId}
          topology={workspace.topology}
          plan={workspace.plan}
          acls={workspace.acls}
          faults={faults}
          onClose={() => setCliDeviceId(null)}
        />
      )}
    </div>
  );
}
