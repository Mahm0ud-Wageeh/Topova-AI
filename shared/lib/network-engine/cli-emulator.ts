import { assignAddressing, generateCiscoConfigs } from "@/lib/network-engine/cisco";
import { tracePacket } from "@/lib/network-engine/simulator";
import { TYPE_VLAN } from "@/lib/network-engine/vlan-planner";
import type {
  AclRule,
  BuiltTopology,
  CableType,
  Device,
  FaultState,
  NetworkPlan,
} from "@/lib/network-engine/types";

export interface CliContextState {
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls?: AclRule[];
  faults?: FaultState;
}

export interface CliExecutionResult {
  prompt: string;
  command: string;
  output: string;
  ok: boolean;
}

function findTargetDevice(
  topology: BuiltTopology,
  addressing: ReturnType<typeof assignAddressing>,
  targetToken: string,
): Device | undefined {
  const lower = targetToken.toLowerCase();
  const byLabel = topology.devices.find(
    (d) => d.id.toLowerCase() === lower || d.label.toLowerCase() === lower,
  );
  if (byLabel) return byLabel;
  for (const d of topology.devices) {
    const addr = addressing.byDevice[d.id];
    if (addr?.interfaces.some((i) => i.ip === targetToken)) return d;
  }
  return undefined;
}

/**
 * Interactive Cisco IOS-style CLI command evaluator executing live against
 * topology state, assigned addressing, Zero-Trust ACLs, and Chaos faults.
 */
export function executeCliCommand(
  state: CliContextState,
  deviceId: string,
  rawCommand: string,
): CliExecutionResult {
  const device = state.topology.devices.find((d) => d.id === deviceId);
  const prompt = `${device?.label ?? "NetTopo"}#`;
  const command = rawCommand.trim();
  if (!command) return { prompt, command: "", output: "", ok: true };

  const disabledDevices = new Set(state.faults?.disabledDevices ?? []);
  const disabledLinks = new Set(state.faults?.disabledLinks ?? []);

  if (!device) {
    return { prompt, command, output: "% Device not found in active topology.", ok: false };
  }
  if (disabledDevices.has(device.id)) {
    return {
      prompt,
      command,
      output: `% Console unreachable: ${device.label} is powered down (Chaos Fault active).`,
      ok: false,
    };
  }

  const addressing = assignAddressing(state.topology, state.plan);
  const addr = addressing.byDevice[device.id];
  const tokens = command.split(/\s+/);
  const lower = command.toLowerCase();

  if (lower === "help" || lower === "?") {
    return {
      prompt,
      command,
      ok: true,
      output: [
        "Available NetTopo Live IOS Commands:",
        "  show ip interface brief    Display interface IP addresses and up/down status",
        "  show vlan brief            Display configured VLANs and assigned access ports",
        "  show ip route              Display active connected and dynamic/static routes",
        "  show access-lists          Display active Zero-Trust Inter-VLAN ACL rules",
        "  show cdp neighbors         Display directly connected devices and cable types",
        "  show running-config        Display full generated configuration for this device",
        "  show version               Display hardware & NetTopo IOS emulator details",
        "  ping <ip | hostname>       Send live ICMP echo probes through packet simulator",
        "  traceroute <ip | hostname> Trace hop-by-hop L2/L3 path with latency & TTL",
        "  clear                      Clear terminal screen",
      ].join("\n"),
    };
  }

  if (/^sh(?:ow)?\s+ip\s+int(?:erface)?\s+br(?:ief)?$/i.test(lower)) {
    const deviceLinks = state.topology.connections.filter(
      (c) => c.from === device.id || c.to === device.id,
    );
    const allLinksCut =
      deviceLinks.length > 0 && deviceLinks.every((c) => disabledLinks.has(c.id));
    const statusText = allLinksCut ? "administratively down   down" : "up                      up";
    const rows = (addr?.interfaces ?? []).map((i) => {
      const nameCol = i.name.padEnd(26, " ");
      const ipCol = i.ip.padEnd(16, " ");
      return `${nameCol}${ipCol}YES manual ${statusText}`;
    });
    return {
      prompt,
      command,
      ok: true,
      output: [
        "Interface                 IP-Address      OK? Method Status                  Protocol",
        ...(rows.length ? rows : ["(no IP interfaces configured)"]),
      ].join("\n"),
    };
  }

  if (/^sh(?:ow)?\s+vlan(?:\s+br(?:ief)?)?$/i.test(lower)) {
    if (state.plan.vlanPlan.length === 0) {
      return {
        prompt,
        command,
        ok: true,
        output: [
          "VLAN Name                             Status    Ports",
          "---- -------------------------------- --------- -------------------------------",
          "1    default                          active    All ports (Flat LAN)",
        ].join("\n"),
      };
    }
    const rows = state.plan.vlanPlan.map((v) => {
      const members = state.topology.devices
        .filter((d) => (addressing.byDevice[d.id]?.vlanId ?? TYPE_VLAN[d.type]) === v.id)
        .map((d) => d.label)
        .slice(0, 6)
        .join(", ");
      return `${String(v.id).padEnd(5)}${v.name.padEnd(33)}active    ${members || "Trunk"}`;
    });
    return {
      prompt,
      command,
      ok: true,
      output: [
        "VLAN Name                             Status    Ports",
        "---- -------------------------------- --------- -------------------------------",
        ...rows,
      ].join("\n"),
    };
  }

  if (/^sh(?:ow)?\s+ip\s+route$/i.test(lower)) {
    const lines = [
      "Codes: C - connected, S - static, O - OSPF, D - EIGRP, R - RIP, B - BGP",
      "",
    ];
    for (const s of addressing.subnets) {
      lines.push(`C    ${s.cidr} is directly connected, ${s.vlanId ? `GigabitEthernet0/0.${s.vlanId}` : "GigabitEthernet0/0"}`);
    }
    if (state.plan.routing.routes.length > 0) {
      lines.push("", `! Routing Protocol: ${state.plan.routing.protocol}`);
      for (const r of state.plan.routing.routes) {
        lines.push(`     ${r}`);
      }
    }
    return { prompt, command, ok: true, output: lines.join("\n") };
  }

  if (/^sh(?:ow)?\s+access-lists?$/i.test(lower)) {
    const acls = state.acls ?? [];
    if (acls.length === 0) {
      return {
        prompt,
        command,
        ok: true,
        output: "% No Zero-Trust ACLs applied. Run Security Audit -> Auto-Remediate to enforce policies.",
      };
    }
    const lines = ["Extended IP access list NETTOPO-ZERO-TRUST"];
    acls.forEach((r, idx) => {
      const seq = (idx + 1) * 10;
      const src = r.sourceVlan === "any" ? "any" : `vlan-${r.sourceVlan}`;
      const dst = r.destinationVlan === "any" ? "any" : `vlan-${r.destinationVlan}`;
      const portStr = r.port ? ` eq ${r.port}` : "";
      lines.push(`    ${seq} ${r.action} ${r.protocol} ${src} ${dst}${portStr}  ! ${r.name}`);
    });
    return { prompt, command, ok: true, output: lines.join("\n") };
  }

  if (/^sh(?:ow)?\s+cdp\s+neigh(?:bors)?$/i.test(lower)) {
    const neighbors = state.topology.connections
      .filter((c) => !disabledLinks.has(c.id) && (c.from === device.id || c.to === device.id))
      .map((c, idx) => {
        const peerId = c.from === device.id ? c.to : c.from;
        const peer = state.topology.devices.find((d) => d.id === peerId);
        if (!peer || disabledDevices.has(peer.id)) return null;
        const cable = (c.meta?.cableType as CableType) ?? "Straight-through";
        return `${peer.label.padEnd(16)}Gi0/${idx + 1}       140       ${peer.type.padEnd(12)}${cable}`;
      })
      .filter((r): r is string => Boolean(r));
    return {
      prompt,
      command,
      ok: true,
      output: [
        "Device ID       Local Intrfce  Holdtme   Platform    Cable",
        ...(neighbors.length ? neighbors : ["(no active CDP neighbors)"]),
      ].join("\n"),
    };
  }

  if (/^sh(?:ow)?\s+run(?:ning-config)?$/i.test(lower)) {
    const exported = generateCiscoConfigs(state.topology, state.plan, addressing);
    const devCfg = exported.configs.find((c) => c.deviceId === device.id);
    return {
      prompt,
      command,
      ok: true,
      output: devCfg ? devCfg.cli : `! Endpoint ${device.label}: IP ${addr?.interfaces[0]?.ip ?? "DHCP"}, GW ${addr?.gateway ?? "N/A"}`,
    };
  }

  if (/^sh(?:ow)?\s+ver(?:sion)?$/i.test(lower)) {
    return {
      prompt,
      command,
      ok: true,
      output: [
        `NetTopo Virtual IOS-XE Engine v2.0`,
        `Hostname: ${device.label} (${device.type})`,
        `Routing: ${state.plan.routing.protocol} | Mode: ${addressing.mode.toUpperCase()}`,
        `Active ACL Rules: ${(state.acls ?? []).length}`,
      ].join("\n"),
    };
  }

  if (/^ping\s+\S+$/i.test(lower)) {
    const targetToken = tokens[1];
    const target = findTargetDevice(state.topology, addressing, targetToken);
    if (!target) {
      return {
        prompt,
        command,
        ok: false,
        output: `Translating "${targetToken}"... % Unrecognized host or address.`,
      };
    }
    const targetIp = addressing.byDevice[target.id]?.interfaces[0]?.ip ?? target.label;
    const trace = tracePacket(state.topology, state.plan, {
      sourceId: device.id,
      destinationId: target.id,
      protocol: "ICMP",
      acls: state.acls,
      faults: state.faults,
    });
    if (trace.reachable) {
      const rtt = Math.max(1, Math.round(trace.totalLatencyMs * 2));
      return {
        prompt,
        command,
        ok: true,
        output: [
          `Type escape sequence to abort.`,
          `Sending 5, 100-byte ICMP Echos to ${targetIp} (${target.label}), timeout is 2 seconds:`,
          `!!!!!`,
          `Success rate is 100 percent (5/5), round-trip min/avg/max = ${Math.max(1, rtt - 1)}/${rtt}/${rtt + 1} ms`,
        ].join("\n"),
      };
    }
    const symbols = trace.verdict === "blocked-by-acl" ? "UUUUU" : ".....";
    return {
      prompt,
      command,
      ok: false,
      output: [
        `Type escape sequence to abort.`,
        `Sending 5, 100-byte ICMP Echos to ${targetIp} (${target.label}), timeout is 2 seconds:`,
        symbols,
        `Success rate is 0 percent (0/5) — ${trace.summary}`,
      ].join("\n"),
    };
  }

  if (/^traceroute\s+\S+$/i.test(lower)) {
    const targetToken = tokens[1];
    const target = findTargetDevice(state.topology, addressing, targetToken);
    if (!target) {
      return {
        prompt,
        command,
        ok: false,
        output: `% Unrecognized destination "${targetToken}".`,
      };
    }
    const targetIp = addressing.byDevice[target.id]?.interfaces[0]?.ip ?? target.label;
    const trace = tracePacket(state.topology, state.plan, {
      sourceId: device.id,
      destinationId: target.id,
      protocol: "ICMP",
      acls: state.acls,
      faults: state.faults,
    });
    const hopLines = trace.hops.map((h) => {
      const ip = addressing.byDevice[h.deviceId]?.interfaces[0]?.ip ?? h.dstIp;
      return ` ${h.step}  ${h.label} (${ip})  ${h.latencyMs} ms  [${h.action.toUpperCase()}] ${h.reason}`;
    });
    return {
      prompt,
      command,
      ok: trace.reachable,
      output: [
        `Tracing the route to ${target.label} (${targetIp})`,
        ...hopLines,
        trace.reachable ? "Trace complete." : `* * * ${trace.summary}`,
      ].join("\n"),
    };
  }

  return {
    prompt,
    command,
    ok: false,
    output: `% Invalid input detected at '${command}'. Type 'help' to see supported live commands.`,
  };
}
