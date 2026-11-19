import { Handle, Position } from "reactflow";
import {
  AlertTriangle,
  Camera,
  Monitor,
  Network,
  Phone,
  PowerOff,
  Printer,
  Router,
  Server,
  Shield,
  Skull,
  Terminal,
  Video,
  Wifi,
} from "lucide-react";
import type { DeviceType } from "@/lib/network-engine/types";
import { cn } from "@/lib/utils";

const ICONS: Record<DeviceType, typeof Router> = {
  ROUTER: Router,
  SWITCH: Network,
  SERVER: Server,
  PC: Monitor,
  FIREWALL: Shield,
  AP: Wifi,
  PRINTER: Printer,
  CAMERA: Camera,
  NVR: Video,
  IP_PHONE: Phone,
};

const ROLE_META: Record<
  DeviceType,
  { role: string; accent: string; iconBg: string; borderHover: string }
> = {
  ROUTER: {
    role: "CORE ROUTER",
    accent: "from-blue-500 via-sky-400 to-cyan-400",
    iconBg: "bg-blue-600/20 text-blue-400 ring-1 ring-blue-500/40",
    borderHover: "hover:border-blue-500/60",
  },
  FIREWALL: {
    role: "NGFW SECURITY",
    accent: "from-rose-500 via-red-500 to-orange-400",
    iconBg: "bg-rose-600/20 text-rose-400 ring-1 ring-rose-500/40",
    borderHover: "hover:border-rose-500/60",
  },
  SWITCH: {
    role: "L2/L3 SWITCH",
    accent: "from-emerald-500 via-teal-400 to-cyan-400",
    iconBg: "bg-emerald-600/20 text-emerald-400 ring-1 ring-emerald-500/40",
    borderHover: "hover:border-emerald-500/60",
  },
  SERVER: {
    role: "DATA SERVER",
    accent: "from-violet-500 via-purple-500 to-indigo-400",
    iconBg: "bg-violet-600/20 text-violet-400 ring-1 ring-violet-500/40",
    borderHover: "hover:border-violet-500/60",
  },
  PC: {
    role: "WORKSTATION",
    accent: "from-slate-400 via-slate-500 to-slate-400",
    iconBg: "bg-slate-500/20 text-slate-300 ring-1 ring-slate-400/40",
    borderHover: "hover:border-slate-400/60",
  },
  AP: {
    role: "WI-FI 6 AP",
    accent: "from-amber-400 via-orange-400 to-yellow-400",
    iconBg: "bg-amber-500/20 text-amber-400 ring-1 ring-amber-400/40",
    borderHover: "hover:border-amber-400/60",
  },
  PRINTER: {
    role: "NET PRINTER",
    accent: "from-sky-400 via-cyan-400 to-blue-400",
    iconBg: "bg-sky-500/20 text-sky-400 ring-1 ring-sky-400/40",
    borderHover: "hover:border-sky-400/60",
  },
  CAMERA: {
    role: "IP CAMERA",
    accent: "from-pink-500 via-rose-400 to-fuchsia-400",
    iconBg: "bg-pink-500/20 text-pink-400 ring-1 ring-pink-500/40",
    borderHover: "hover:border-pink-500/60",
  },
  NVR: {
    role: "CCTV NVR",
    accent: "from-fuchsia-500 via-purple-500 to-pink-400",
    iconBg: "bg-fuchsia-500/20 text-fuchsia-400 ring-1 ring-fuchsia-500/40",
    borderHover: "hover:border-fuchsia-500/60",
  },
  IP_PHONE: {
    role: "VOIP PHONE",
    accent: "from-teal-400 via-emerald-400 to-cyan-400",
    iconBg: "bg-teal-500/20 text-teal-400 ring-1 ring-teal-400/40",
    borderHover: "hover:border-teal-400/60",
  },
};

const VLAN_BADGE_COLORS: Record<number, string> = {
  10: "bg-blue-500/15 text-blue-300 border-blue-500/35",
  20: "bg-violet-500/15 text-violet-300 border-violet-500/35",
  30: "bg-pink-500/15 text-pink-300 border-pink-500/35",
  40: "bg-teal-500/15 text-teal-300 border-teal-500/35",
  50: "bg-amber-500/15 text-amber-300 border-amber-500/35",
  99: "bg-emerald-500/15 text-emerald-300 border-emerald-500/35",
};

export interface StudioNodeData {
  id: string;
  label: string;
  type: DeviceType;
  ip?: string;
  iface?: string;
  vlanId?: number;
  vlanName?: string;
  selected?: boolean;
  disabled?: boolean;
  spof?: boolean;
  compromised?: boolean;
  packetActive?: boolean;
  packetDropped?: boolean;
  unreachable?: boolean;
  onOpenCli?: (id: string) => void;
}

export function DeviceNode({ data }: { data: StudioNodeData }) {
  const Icon = ICONS[data.type] ?? Monitor;
  const meta = ROLE_META[data.type] ?? ROLE_META.PC;
  const vlanStyle =
    (data.vlanId && VLAN_BADGE_COLORS[data.vlanId]) ||
    "bg-cyan/15 text-cyan border-cyan/35";

  const statusLed = data.disabled
    ? "bg-red-500"
    : data.compromised
      ? "bg-red-500 animate-ping"
      : data.packetDropped
        ? "bg-rose-500"
        : data.packetActive
          ? "bg-cyan animate-pulse"
          : data.spof || data.unreachable
            ? "bg-amber-400"
            : "bg-emerald-400";

  return (
    <div className="group relative select-none">
      <Handle
        type="target"
        position={Position.Top}
        className="!-top-1.5 !h-3 !w-3 !rounded-full !border-2 !border-background !bg-primary shadow-sm"
      />

      <div
        className={cn(
          "relative w-[172px] overflow-hidden rounded-xl border bg-card/95 shadow-lg backdrop-blur-md transition-all duration-150",
          meta.borderHover,
          data.selected && "scale-[1.03] border-primary ring-2 ring-primary/60 shadow-glow",
          data.packetActive && "scale-[1.05] border-cyan ring-4 ring-cyan/50 shadow-glow-cyan",
          data.packetDropped && "border-red-500 ring-4 ring-red-500/50",
          data.compromised && !data.disabled && "border-red-500 ring-2 ring-red-500/80",
          data.disabled && "opacity-45 grayscale",
          data.unreachable && !data.disabled && "border-amber-500/70 opacity-75",
        )}
      >
        {/* Architectural tier top strip */}
        <div className={cn("h-1 w-full bg-gradient-to-r", meta.accent)} />

        <div className="p-2.5 space-y-2">
          {/* Header: Icon + Name + Role + LED */}
          <div className="flex items-center gap-2">
            <div className={cn("relative grid h-9 w-9 shrink-0 place-items-center rounded-lg", meta.iconBg)}>
              <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
              {data.disabled && (
                <span className="absolute inset-0 grid place-items-center rounded-lg bg-slate-950/80 text-red-400">
                  <PowerOff className="h-4 w-4" />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "truncate font-display text-xs font-bold tracking-tight text-foreground",
                    data.selected && "text-primary",
                  )}
                >
                  {data.label}
                </span>
                <span className={cn("h-2 w-2 shrink-0 rounded-full", statusLed)} />
              </div>
              <p className="truncate font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                {meta.role}
              </p>
            </div>
          </div>

          {/* Footer metadata strip: IP + VLAN / quick CLI */}
          <div className="flex items-center justify-between gap-1 border-t border-border/60 pt-1.5">
            <span className="truncate font-mono text-[10px] font-medium text-foreground/85">
              {data.ip ?? "L2 Fabric"}
            </span>
            {data.vlanId ? (
              <span
                className={cn(
                  "shrink-0 rounded border px-1.5 py-px font-mono text-[9px] font-bold leading-tight",
                  vlanStyle,
                )}
              >
                V{data.vlanId}
              </span>
            ) : (
              <span className="shrink-0 font-mono text-[9px] text-muted-foreground">
                {data.iface ? data.iface.replace("GigabitEthernet", "Gi").replace("FastEthernet", "Fa") : "LAN"}
              </span>
            )}
          </div>
        </div>

        {/* Hover Quick-CLI Action Pill */}
        {data.onOpenCli && !data.disabled && (
          <button
            type="button"
            title={`Open live CLI for ${data.label}`}
            onClick={(e) => {
              e.stopPropagation();
              data.onOpenCli?.(data.id);
            }}
            className="absolute right-1.5 top-2 hidden items-center gap-0.5 rounded bg-slate-950/90 px-1.5 py-0.5 font-mono text-[9px] font-bold text-cyan border border-cyan/40 shadow group-hover:inline-flex hover:bg-cyan hover:text-slate-950"
          >
            <Terminal className="h-2.5 w-2.5" />
            CLI
          </button>
        )}
      </div>

      {/* Floating Risk / Alert Indicators */}
      {data.spof && !data.disabled && (
        <span
          title="Single Point of Failure (Tarjan Articulation Point)"
          className="absolute -left-2 -top-2 flex items-center gap-0.5 rounded-full border-2 border-background bg-amber-500 px-1.5 py-0.5 font-mono text-[9px] font-extrabold text-slate-950 shadow"
        >
          <AlertTriangle className="h-2.5 w-2.5" />
          SPOF
        </span>
      )}

      {data.compromised && !data.disabled && (
        <span
          title="Compromised in Red-Team Simulation"
          className="absolute -right-2 -top-2 flex items-center gap-0.5 rounded-full border-2 border-background bg-red-600 px-1.5 py-0.5 font-mono text-[9px] font-extrabold text-white shadow"
        >
          <Skull className="h-2.5 w-2.5" />
          PWN
        </span>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!-bottom-1.5 !h-3 !w-3 !rounded-full !border-2 !border-background !bg-cyan shadow-sm"
      />
    </div>
  );
}
