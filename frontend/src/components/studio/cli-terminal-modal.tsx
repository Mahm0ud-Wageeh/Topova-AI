import { Modal } from "@/components/ui/modal";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Terminal, X } from "lucide-react";
import { executeCliCommand } from "@/lib/network-engine/cli-emulator";
import type {
  AclRule,
  BuiltTopology,
  FaultState,
  NetworkPlan,
} from "@/lib/network-engine/types";
import { Button } from "@/components/ui/button";

interface Entry {
  prompt: string;
  command: string;
  output: string;
  ok: boolean;
}

interface CliTerminalModalProps {
  open: boolean;
  deviceId: string | null;
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls: AclRule[];
  faults: FaultState;
  onClose: () => void;
}

export function CliTerminalModal({
  open,
  deviceId,
  topology,
  plan,
  acls,
  faults,
  onClose,
}: CliTerminalModalProps) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const bottomRef = useRef<HTMLDivElement>(null);

  const device = topology.devices.find((d) => d.id === deviceId);
  const peer = topology.devices.find(
    (d) =>
      d.id !== deviceId &&
      (d.type === "SERVER" || d.type === "ROUTER" || d.type === "PC"),
  );

  useEffect(() => {
    if (!open || !deviceId) return;
    const welcome = executeCliCommand(
      { topology, plan, acls, faults },
      deviceId,
      "show version",
    );
    setEntries([welcome]);
    setInput("");
    setHistIdx(-1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deviceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  if (!open || !deviceId || !device) return null;

  const quickCommands = [
    "show ip interface brief",
    "show vlan brief",
    "show ip route",
    "show access-lists",
    "show cdp neighbors",
    ...(peer ? [`ping ${peer.label}`, `traceroute ${peer.label}`] : []),
    "show running-config",
  ];

  function run(cmd: string) {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === "clear") {
      setEntries([]);
      setInput("");
      return;
    }
    const res = executeCliCommand(
      { topology, plan, acls, faults },
      deviceId!,
      trimmed,
    );
    setEntries((prev) => [...prev, res]);
    setHistory((prev) => [trimmed, ...prev.slice(0, 30)]);
    setHistIdx(-1);
    setInput("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    run(input);
  }

  return (
    <Modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      dir="ltr"
      open={open}
      onClose={onClose}
      label="Network device terminal"
    >
      <div className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-cyan/40 bg-slate-950 text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2.5">
          <div className="flex items-center gap-2 font-mono text-sm">
            <Terminal className="h-4 w-4 text-cyan" />
            <span className="font-bold text-cyan">{device.label}</span>
            <span className="text-xs text-slate-400">
              ({device.type} · Live Virtual IOS Console)
            </span>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-11 w-11 text-slate-400 hover:text-white"
            aria-label="Close terminal"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Quick Command Chips */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-800 bg-slate-900/60 px-3 py-2">
          {quickCommands.map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => run(cmd)}
              className="rounded border border-slate-700 bg-slate-800/80 px-2 py-0.5 font-mono text-[11px] text-cyan hover:border-cyan"
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Output Buffer */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4 font-mono text-xs leading-relaxed">
          {entries.map((entry, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-emerald-400">
                <span className="font-bold">{entry.prompt}</span>{" "}
                {entry.command}
              </div>
              <pre
                className={`whitespace-pre-wrap ${entry.ok ? "text-slate-200" : "text-rose-400"}`}
              >
                {entry.output}
              </pre>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Command Input */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-slate-800 bg-slate-900 px-4 py-2.5 font-mono text-xs"
        >
          <span className="font-bold text-emerald-400">{device.label}#</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" && history.length > 0) {
                e.preventDefault();
                const next = Math.min(histIdx + 1, history.length - 1);
                setHistIdx(next);
                setInput(history[next]);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const next = histIdx - 1;
                setHistIdx(next);
                setInput(next >= 0 ? history[next] : "");
              }
            }}
            autoFocus
            placeholder="Type a Cisco IOS command (e.g. show ip interface brief, ping SRV1, help)..."
            className="flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-500"
          />
          <Button
            type="submit"
            size="sm"
            variant="secondary"
            className="h-7 font-mono text-xs"
          >
            Run
          </Button>
        </form>
      </div>
    </Modal>
  );
}
