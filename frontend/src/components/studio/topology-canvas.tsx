import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  MarkerType,
  MiniMap,
  useEdgesState,
  useNodesState,
  type Connection as RfConnection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Cable,
  GitFork,
  Layers,
  Maximize2,
  Orbit,
  Tag,
  Terminal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { Addressing } from "@/lib/network-engine/cisco";
import { assignDevicePorts } from "@/lib/network-engine/cisco-formats";
import type { AttackSimulationResult } from "@/lib/network-engine/attack-sim";
import type { TrafficForecastResult } from "@/lib/network-engine/traffic";
import type {
  BuiltTopology,
  CableType,
  FaultState,
  LayoutMode,
  NetworkPlan,
  PacketTraceResult,
  SpofAnalysis,
} from "@/lib/network-engine/types";
import { DeviceNode, type StudioNodeData } from "./device-node";

const nodeTypes = { device: DeviceNode };
const FIT_OPTIONS = { padding: 0.2 };

const CABLE_COLOR: Record<CableType, string> = {
  "Straight-through": "#64748b",
  Crossover: "#3b82f6",
  Serial: "#ef4444",
  Console: "#0ea5e9",
  Fiber: "#f97316",
};

interface TopologyCanvasProps {
  topology: BuiltTopology;
  plan?: NetworkPlan;
  addressing?: Addressing;
  spof?: SpofAnalysis;
  faults: FaultState;
  chaosMode: boolean;
  showHeatmap: boolean;
  traffic?: TrafficForecastResult | null;
  attack?: AttackSimulationResult | null;
  packetTrace?: PacketTraceResult | null;
  activeHopIndex: number;
  selectedId: string | null;
  onSelectDevice: (id: string | null) => void;
  onOpenCli: (id: string) => void;
  onConnectDevices: (from: string, to: string) => void;
  onToggleDeviceFault: (id: string) => void;
  onToggleLinkFault: (id: string) => void;
  onRelayout: (mode: LayoutMode) => void;
  onPositionsChange?: (layout: Record<string, { x: number; y: number }>) => void;
}

export function TopologyCanvas({
  topology,
  plan,
  addressing,
  spof,
  faults,
  chaosMode,
  showHeatmap,
  traffic,
  attack,
  packetTrace,
  activeHopIndex,
  selectedId,
  onSelectDevice,
  onOpenCli,
  onConnectDevices,
  onToggleDeviceFault,
  onToggleLinkFault,
  onRelayout,
  onPositionsChange,
}: TopologyCanvasProps) {
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<StudioNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [showPortLabels, setShowPortLabels] = useState(true);
  const [showLegend, setShowLegend] = useState(true);

  const topologySignature = useMemo(
    () =>
      `${topology.devices.map((d) => `${d.id}:${d.type}`).join(",")}|${JSON.stringify(topology.layout ?? {})}`,
    [topology],
  );

  const portMap = useMemo(() => {
    const mappings = assignDevicePorts(topology);
    return new Map(mappings.map((m) => [m.linkId, m]));
  }, [topology]);

  const disabledDevices = useMemo(() => new Set(faults.disabledDevices), [faults.disabledDevices]);
  const disabledLinks = useMemo(() => new Set(faults.disabledLinks), [faults.disabledLinks]);
  const spofDevices = useMemo(() => new Set(spof?.criticalDevices ?? []), [spof]);
  const spofLinks = useMemo(() => new Set(spof?.criticalLinks ?? []), [spof]);
  const unreachable = useMemo(() => new Set(spof?.unreachableDevices ?? []), [spof]);
  const compromisedDevices = useMemo(() => new Set(attack?.compromisedDevices ?? []), [attack]);
  const compromisedLinks = useMemo(() => new Set(attack?.compromisedLinkIds ?? []), [attack]);
  const trafficByLink = useMemo(
    () => new Map((traffic?.links ?? []).map((l) => [l.linkId, l])),
    [traffic],
  );

  const activeHop = packetTrace?.hops[activeHopIndex];
  const tracedLinks = useMemo(() => new Set(packetTrace?.traversedLinkIds ?? []), [packetTrace]);

  const buildNodeData = useCallback(
    (id: string, label: string, type: BuiltTopology["devices"][number]["type"]): StudioNodeData => {
      const addr = addressing?.byDevice[id];
      return {
        id,
        label,
        type,
        ip: addr?.interfaces[0]?.ip,
        iface: addr?.interfaces[0]?.name,
        vlanId: addr?.vlanId,
        vlanName: addr?.vlanName,
        selected: id === selectedId,
        disabled: disabledDevices.has(id),
        spof: spofDevices.has(id),
        compromised: compromisedDevices.has(id),
        packetActive: activeHop?.deviceId === id && activeHop.action !== "drop",
        packetDropped: activeHop?.deviceId === id && activeHop.action === "drop",
        unreachable: unreachable.has(id),
        onOpenCli,
      };
    },
    [addressing, selectedId, disabledDevices, spofDevices, compromisedDevices, activeHop, unreachable, onOpenCli],
  );

  // Reset positions ONLY when topology structure or layout explicitly changes
  useEffect(() => {
    setNodes(
      topology.devices.map((d) => ({
        id: d.id,
        type: "device",
        position: topology.layout?.[d.id] ?? { x: 0, y: 0 },
        data: buildNodeData(d.id, d.label, d.type),
      })),
    );
    // Refit view cleanly after structural changes
    const timer = setTimeout(() => {
      rf?.fitView(FIT_OPTIONS);
    }, 60);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topologySignature]);

  // Update node visual badges/overlays WITHOUT snapping dragged positions
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        const dev = topology.devices.find((d) => d.id === n.id);
        if (!dev) return n;
        return { ...n, data: buildNodeData(dev.id, dev.label, dev.type) };
      }),
    );
  }, [topology.devices, buildNodeData, setNodes]);

  // Update edges with Cisco Port Labels + Live Overlays (Chaos, Packet Trace, Attack Path, Traffic Heatmap)
  useEffect(() => {
    setEdges(
      topology.connections.map((c): Edge => {
        const cable = (c.meta?.cableType as CableType) ?? "Straight-through";
        const ports = portMap.get(c.id);
        const isCut = disabledLinks.has(c.id);
        const isTraced = tracedLinks.has(c.id);
        const isAttack = compromisedLinks.has(c.id);
        const isSpof = spofLinks.has(c.id);
        const metric = trafficByLink.get(c.id);

        let stroke = CABLE_COLOR[cable] ?? "#64748b";
        let strokeWidth = cable === "Fiber" || cable === "Serial" ? 2.6 : 2.1;
        let animated = false;
        let label: string | undefined =
          showPortLabels && ports ? `${ports.fromShortPort} ↔ ${ports.toShortPort}` : undefined;
        let strokeDasharray: string | undefined = cable === "Serial" ? "8 4" : undefined;

        if (isCut) {
          stroke = "#ef4444";
          strokeWidth = 2.6;
          strokeDasharray = "3 6";
          label = "LINK CUT";
        } else if (isTraced) {
          stroke = packetTrace?.reachable ? "#22d3ee" : "#f43f5e";
          strokeWidth = 3.5;
          animated = true;
          strokeDasharray = undefined;
        } else if (isAttack) {
          stroke = "#ef4444";
          strokeWidth = 3.2;
          animated = true;
          strokeDasharray = undefined;
        } else if (showHeatmap && metric) {
          stroke =
            metric.status === "congested"
              ? "#ef4444"
              : metric.status === "elevated"
                ? "#f59e0b"
                : "#10b981";
          strokeWidth = metric.status === "congested" ? 3.5 : 2.6;
          animated = metric.status === "congested";
          label = `${metric.loadMbps}M (${metric.utilizationPercent}%)`;
          strokeDasharray = undefined;
        } else if (isSpof) {
          stroke = "#f59e0b";
          strokeWidth = 2.6;
        }

        return {
          id: c.id,
          source: c.from,
          target: c.to,
          type: "smoothstep",
          animated,
          label,
          labelStyle: {
            fill: isCut ? "#fecaca" : "#e2e8f0",
            fontSize: 9.5,
            fontFamily: "ui-monospace, SFMono-Regular, monospace",
            fontWeight: 600,
          },
          labelBgPadding: [5, 2.5],
          labelBgBorderRadius: 5,
          labelBgStyle: {
            fill: isCut ? "#7f1d1d" : "#0f172a",
            fillOpacity: 0.88,
            stroke: stroke,
            strokeWidth: 0.7,
          },
          style: { stroke, strokeWidth, strokeDasharray, opacity: isCut ? 0.55 : 0.92 },
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: stroke },
        };
      }),
    );
  }, [
    topology.connections,
    portMap,
    showPortLabels,
    disabledLinks,
    tracedLinks,
    compromisedLinks,
    spofLinks,
    showHeatmap,
    trafficByLink,
    packetTrace,
    setEdges,
  ]);

  const handleNodeClick = useCallback(
    (_e: unknown, node: Node) => {
      if (chaosMode) {
        onToggleDeviceFault(node.id);
      } else {
        onSelectDevice(node.id);
      }
    },
    [chaosMode, onToggleDeviceFault, onSelectDevice],
  );

  const handleNodeDoubleClick = useCallback(
    (_e: unknown, node: Node) => {
      onOpenCli(node.id);
    },
    [onOpenCli],
  );

  const handleEdgeClick = useCallback(
    (_e: unknown, edge: Edge) => {
      if (chaosMode) onToggleLinkFault(edge.id);
    },
    [chaosMode, onToggleLinkFault],
  );

  const handleConnect = useCallback(
    (conn: RfConnection) => {
      if (conn.source && conn.target && conn.source !== conn.target) {
        onConnectDevices(conn.source, conn.target);
      }
    },
    [onConnectDevices],
  );

  const handleNodeDragStop = useCallback(() => {
    if (!onPositionsChange) return;
    const nextLayout: Record<string, { x: number; y: number }> = {};
    nodes.forEach((n) => {
      nextLayout[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
    });
    onPositionsChange(nextLayout);
  }, [nodes, onPositionsChange]);

  return (
    <div className="relative h-full w-full bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_60%)]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        onEdgeClick={handleEdgeClick}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={() => onSelectDevice(null)}
        nodeTypes={nodeTypes}
        onInit={setRf}
        fitView
        fitViewOptions={FIT_OPTIONS}
        minZoom={0.18}
        maxZoom={2.2}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.25} color="hsl(var(--border))" />
        <MiniMap
          pannable
          zoomable
          className="!hidden !rounded-xl !border !border-border/80 !bg-card/90 !shadow-lg sm:!block"
          nodeColor={(n) => {
            const t = (n.data as StudioNodeData | undefined)?.type;
            if (t === "ROUTER") return "#3b82f6";
            if (t === "FIREWALL") return "#f43f5e";
            if (t === "SWITCH") return "#10b981";
            if (t === "SERVER" || t === "NVR") return "#8b5cf6";
            if (t === "AP") return "#f59e0b";
            return "#64748b";
          }}
          maskColor="rgba(2, 6, 23, 0.5)"
        />
      </ReactFlow>

      {/* Top-Left Canvas Architectural Toolbar */}
      <div className="absolute left-2 top-2 flex max-w-[calc(100%-1rem)] items-center gap-0.5 overflow-x-auto rounded-xl border bg-card/90 p-1 shadow-lg backdrop-blur-md sm:left-3 sm:top-3 sm:gap-1">
        <button
          type="button"
          onClick={() => rf?.zoomIn()}
          title="Zoom in"
          className="hidden h-8 w-8 sm:grid place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => rf?.zoomOut()}
          title="Zoom out"
          className="hidden h-8 w-8 sm:grid place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => rf?.fitView(FIT_OPTIONS)}
          title="Fit architecture to screen"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <button
          type="button"
          onClick={() => onRelayout("tree")}
          title="Hierarchical Tree Layout"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <GitFork className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onRelayout("tiered")}
          title="Enterprise 4-Tier Rack Layout"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Layers className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onRelayout("radial")}
          title="Radial Core-Edge Layout"
          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Orbit className="h-4 w-4" />
        </button>
        <span className="mx-0.5 h-5 w-px bg-border" />
        <button
          type="button"
          onClick={() => setShowPortLabels((v) => !v)}
          title="Toggle Cisco Interface Port Labels (Gi0/0 ↔ Gi0/1)"
          className={`flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold transition-colors ${
            showPortLabels
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Tag className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Ports</span>
        </button>
        <button
          type="button"
          onClick={() => setShowLegend((v) => !v)}
          title="Toggle Cable Legend"
          className={`grid h-8 w-8 place-items-center rounded-lg transition-colors ${
            showLegend
              ? "bg-cyan/15 text-cyan"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Cable className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Top-Right Live Architecture Summary Pill */}
      <div className="pointer-events-none absolute right-3 top-3 hidden items-center gap-2 rounded-xl border bg-card/90 px-3 py-1.5 font-mono text-[11px] shadow-md backdrop-blur-md md:flex">
        <span className="font-bold text-foreground">{topology.devices.length} Nodes</span>
        <span className="text-muted-foreground">·</span>
        <span className="font-bold text-foreground">{topology.connections.length} Links</span>
        {plan && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-cyan font-bold">{plan.routing.protocol}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-emerald-400 font-bold">
              {plan.vlanPlan.length > 0 ? `${plan.vlanPlan.length} VLANs` : "Flat LAN"}
            </span>
          </>
        )}
      </div>

      {/* Bottom-Left Blueprint Legend & Mode Hint */}
      <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-col items-start gap-1.5 sm:bottom-3 sm:left-3 sm:right-auto">
        {showLegend && !chaosMode && (
          <div className="hidden flex-wrap items-center gap-3 rounded-xl border bg-card/90 px-3 py-1.5 text-[10px] font-mono text-muted-foreground shadow-md backdrop-blur-md sm:flex">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-slate-500" /> Access
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-blue-500" /> Trunk/X-Over
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 border-t-2 border-dashed border-red-500" /> WAN Serial
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 bg-orange-500" /> Fiber
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" /> SPOF
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-md backdrop-blur-md">
          {chaosMode ? (
            <span className="font-semibold text-red-400">
              CHAOS MODE ACTIVE — Click any link or device to inject / restore a fault
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 shrink-0 text-cyan" />
              <span className="sm:hidden">Double-tap a node for CLI</span>
              <span className="hidden sm:inline">Double-click any node for Live CLI · Drag port handles to wire cables</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
