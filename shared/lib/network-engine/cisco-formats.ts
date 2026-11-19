import { assignAddressing } from "@/lib/network-engine/cisco";
import { generateMultiVendorConfigs } from "@/lib/network-engine/multi-vendor";
import type {
  AclRule,
  BuiltTopology,
  CableType,
  Device,
  DeviceType,
  NetworkPlan,
} from "@/lib/network-engine/types";

export interface PortLinkMapping {
  linkId: string;
  fromId: string;
  fromLabel: string;
  fromPort: string;
  fromShortPort: string;
  fromSlot: number;
  toId: string;
  toLabel: string;
  toPort: string;
  toShortPort: string;
  toSlot: number;
  cableType: CableType;
}

const PT_HARDWARE: Record<DeviceType, { ptModel: string; cmlDef: string; gns3Symbol: string }> = {
  ROUTER: { ptModel: "ISR 4331 / 2911 Router", cmlDef: "iosv", gns3Symbol: ":/symbols/router.svg" },
  FIREWALL: { ptModel: "ASA 5506-X / 5505 Firewall", cmlDef: "iosv", gns3Symbol: ":/symbols/firewall.svg" },
  SWITCH: { ptModel: "Catalyst 2960-24TT Switch", cmlDef: "iosvl2", gns3Symbol: ":/symbols/ethernet_switch.svg" },
  SERVER: { ptModel: "Server-PT", cmlDef: "alpine", gns3Symbol: ":/symbols/server.svg" },
  PC: { ptModel: "PC-PT", cmlDef: "alpine", gns3Symbol: ":/symbols/computer.svg" },
  AP: { ptModel: "AccessPoint-PT / WLC", cmlDef: "alpine", gns3Symbol: ":/symbols/classic/access_point.svg" },
  PRINTER: { ptModel: "Printer-PT", cmlDef: "alpine", gns3Symbol: ":/symbols/printer.svg" },
  CAMERA: { ptModel: "IoT Webcam / IP Camera", cmlDef: "alpine", gns3Symbol: ":/symbols/classic/webcam.svg" },
  NVR: { ptModel: "Server-PT (NVR)", cmlDef: "alpine", gns3Symbol: ":/symbols/server.svg" },
  IP_PHONE: { ptModel: "7960 IP Phone", cmlDef: "alpine", gns3Symbol: ":/symbols/classic/phone.svg" },
};

function nextPortFor(
  device: Device,
  peer: Device | undefined,
  usedSlots: Map<string, number>,
): { full: string; short: string; slot: number } {
  const used = usedSlots.get(device.id) ?? 0;

  if (device.type === "ROUTER" || device.type === "FIREWALL") {
    const slot = used;
    usedSlots.set(device.id, used + 1);
    return {
      full: `GigabitEthernet0/${slot}`,
      short: `Gi0/${slot}`,
      slot,
    };
  }

  if (device.type === "SWITCH") {
    const isUplink = peer && (peer.type === "ROUTER" || peer.type === "FIREWALL" || peer.type === "SWITCH");
    if (isUplink) {
      const gigKey = `${device.id}:gig`;
      const gigIdx = (usedSlots.get(gigKey) ?? 0) + 1;
      usedSlots.set(gigKey, gigIdx);
      const slot = 23 + gigIdx; // reserve slots 24+ for Gigabit uplinks
      return {
        full: `GigabitEthernet0/${gigIdx}`,
        short: `Gi0/${gigIdx}`,
        slot,
      };
    }
    const faKey = `${device.id}:fa`;
    const faIdx = (usedSlots.get(faKey) ?? 0) + 1;
    usedSlots.set(faKey, faIdx);
    return {
      full: faIdx <= 24 ? `FastEthernet0/${faIdx}` : `GigabitEthernet1/0/${faIdx - 24}`,
      short: faIdx <= 24 ? `Fa0/${faIdx}` : `Gi1/0/${faIdx - 24}`,
      slot: faIdx - 1,
    };
  }

  const slot = used;
  usedSlots.set(device.id, used + 1);
  return {
    full: `FastEthernet${slot}`,
    short: `Fa${slot}`,
    slot,
  };
}

/** Deterministically allocates collision-free Cisco interface names for every link. */
export function assignDevicePorts(topology: BuiltTopology): PortLinkMapping[] {
  const byId = new Map(topology.devices.map((d) => [d.id, d]));
  const usedSlots = new Map<string, number>();

  return topology.connections.map((conn) => {
    const fromDev = byId.get(conn.from) ?? { id: conn.from, label: conn.from, type: "PC" as DeviceType };
    const toDev = byId.get(conn.to) ?? { id: conn.to, label: conn.to, type: "PC" as DeviceType };
    const fp = nextPortFor(fromDev, toDev, usedSlots);
    const tp = nextPortFor(toDev, fromDev, usedSlots);
    const cableType = (conn.meta?.cableType as CableType) ?? "Straight-through";

    return {
      linkId: conn.id,
      fromId: conn.from,
      fromLabel: fromDev.label,
      fromPort: fp.full,
      fromShortPort: fp.short,
      fromSlot: fp.slot,
      toId: conn.to,
      toLabel: toDev.label,
      toPort: tp.full,
      toShortPort: tp.short,
      toSlot: tp.slot,
      cableType,
    };
  });
}

/** Converts interactive CLI paste script into clean startup-config for NVRAM / CML boot. */
export function toStartupConfig(cli: string): string {
  const dropExact = new Set(["enable", "configure terminal", "conf t", "end", "write memory", "wr mem"]);
  const cleaned = cli
    .split(/\r?\n/)
    .filter((line) => !dropExact.has(line.trim().toLowerCase()))
    .join("\n")
    .trim();
  return `version 15.2\n!\n${cleaned}\n!\nend\n`;
}

function yamlIndentBlock(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split(/\r?\n/)
    .map((line) => `${pad}${line}`)
    .join("\n");
}

function yamlScalar(value: string): string {
  if (/^[a-zA-Z0-9_.-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

/**
 * Generates a valid Cisco Modeling Labs (CML 2.x) `.yaml` topology file.
 * Can be imported directly in CML Workbench via `Import Lab` with full
 * editable nodes, interfaces, coordinates, cables, and embedded Cisco IOS startup configs.
 */
export function generateCiscoCmlYaml(
  topology: BuiltTopology,
  plan: NetworkPlan,
  acls: AclRule[] = [],
  projectName = "NetTopo AI Lab",
): string {
  const addr = assignAddressing(topology, plan);
  const multi = generateMultiVendorConfigs(topology, plan, acls);
  const configByDevice = new Map(multi.cisco.configs.map((c) => [c.deviceId, c.cli]));
  const portLinks = assignDevicePorts(topology);

  const nodeIdMap = new Map<string, string>();
  topology.devices.forEach((d, idx) => nodeIdMap.set(d.id, `n${idx}`));

  // Track interfaces per node so every link attaches to a declared CML interface
  const nodeInterfaces = new Map<string, { id: string; label: string; slot: number; type: "physical" }[]>();
  const ensureIface = (devId: string, label: string, slot: number): string => {
    const list = nodeInterfaces.get(devId) ?? [];
    const existing = list.find((i) => i.label === label);
    if (existing) return existing.id;
    const id = `i${list.length}`;
    list.push({ id, label, slot, type: "physical" });
    nodeInterfaces.set(devId, list);
    return id;
  };

  const linkEntries = portLinks.map((m, idx) => {
    const i1 = ensureIface(m.fromId, m.fromPort, m.fromSlot);
    const i2 = ensureIface(m.toId, m.toPort, m.toSlot);
    return {
      id: `l${idx}`,
      n1: nodeIdMap.get(m.fromId) ?? "n0",
      i1,
      n2: nodeIdMap.get(m.toId) ?? "n0",
      i2,
    };
  });

  // Ensure every node has at least one physical interface declared
  for (const dev of topology.devices) {
    if (!nodeInterfaces.has(dev.id)) {
      ensureIface(dev.id, dev.type === "ROUTER" || dev.type === "SWITCH" || dev.type === "FIREWALL" ? "GigabitEthernet0/0" : "eth0", 0);
    }
  }

  const lines: string[] = [
    "lab:",
    `  description: ${yamlScalar(`Generated by NetTopo AI 2.0 (${plan.routing.protocol}, ${plan.vlanPlan.length} VLANs, ${topology.devices.length} devices)`)}`,
    `  notes: ${yamlScalar("Import directly in Cisco Modeling Labs (CML 2.x). All IOSv/IOSvL2 startup configs & Zero-Trust ACLs are embedded.")}`,
    `  title: ${yamlScalar(projectName)}`,
    "  version: 0.2.2",
    "nodes:",
  ];

  topology.devices.forEach((dev, idx) => {
    const cmlId = nodeIdMap.get(dev.id) ?? `n${idx}`;
    const meta = PT_HARDWARE[dev.type] ?? PT_HARDWARE.PC;
    const pos = topology.layout?.[dev.id] ?? { x: (idx % 5) * 180, y: Math.floor(idx / 5) * 140 };
    const x = Math.round(pos.x - 400);
    const y = Math.round(pos.y - 250);

    const rawCli = configByDevice.get(dev.id);
    const devAddr = addr.byDevice[dev.id];
    const startupCfg = rawCli
      ? toStartupConfig(rawCli)
      : devAddr?.interfaces[0]
        ? [
            `# ${dev.label} (${dev.type})`,
            `hostname ${dev.label}`,
            `ip addr add ${devAddr.interfaces[0].ip}/${plan.ipPlan.subnets[0]?.cidr.split("/")[1] ?? "24"} dev eth0`,
            devAddr.gateway ? `ip route add default via ${devAddr.gateway}` : "# no default gateway",
          ].join("\n")
        : `# ${dev.label}`;

    lines.push(
      `  - id: ${cmlId}`,
      `    label: ${yamlScalar(dev.label)}`,
      `    node_definition: ${meta.cmlDef}`,
      `    x: ${x}`,
      `    y: ${y}`,
      "    configuration: |-",
      yamlIndentBlock(startupCfg, 6),
      "    interfaces:",
    );

    const ifaces = nodeInterfaces.get(dev.id) ?? [];
    for (const iface of ifaces) {
      lines.push(
        `      - id: ${iface.id}`,
        `        label: ${yamlScalar(iface.label)}`,
        `        slot: ${iface.slot}`,
        `        type: ${iface.type}`,
      );
    }
  });

  lines.push("links:");
  for (const link of linkEntries) {
    lines.push(
      `  - id: ${link.id}`,
      `    i1: ${link.i1}`,
      `    n1: ${link.n1}`,
      `    i2: ${link.i2}`,
      `    n2: ${link.n2}`,
    );
  }

  return lines.join("\n") + "\n";
}

function deterministicUuid(seed: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const a = hex(h1);
  const b = hex(h2);
  const c = hex(Math.imul(h1 ^ h2, 2246822519));
  const d = hex(Math.imul(h2 ^ 0x9e3779b9, 3266489917));
  return `${a}-${b.slice(0, 4)}-4${b.slice(5, 8)}-a${c.slice(1, 4)}-${c.slice(4)}${d.slice(0, 4)}`;
}

export interface Gns3ExportBundle {
  projectJson: string;
  startupConfigs: Record<string, string>;
}

/**
 * Generates a valid GNS3 v2.2 `.gns3` project topology JSON plus matching startup configs.
 * Opens directly in GNS3 via `File -> Open Project`.
 */
export function generateGns3Project(
  topology: BuiltTopology,
  plan: NetworkPlan,
  acls: AclRule[] = [],
  projectName = "NetTopo AI Lab",
): Gns3ExportBundle {
  const addr = assignAddressing(topology, plan);
  const multi = generateMultiVendorConfigs(topology, plan, acls);
  const configByDevice = new Map(multi.cisco.configs.map((c) => [c.deviceId, c.cli]));
  const portLinks = assignDevicePorts(topology);
  const startupConfigs: Record<string, string> = {};

  const nodeUuidById = new Map<string, string>();
  const nodes = topology.devices.map((dev, idx) => {
    const nodeId = deterministicUuid(`${projectName}:node:${dev.id}`);
    nodeUuidById.set(dev.id, nodeId);
    const meta = PT_HARDWARE[dev.type] ?? PT_HARDWARE.PC;
    const pos = topology.layout?.[dev.id] ?? { x: (idx % 5) * 180, y: Math.floor(idx / 5) * 140 };
    const x = Math.round(pos.x - 400);
    const y = Math.round(pos.y - 250);

    const rawCli = configByDevice.get(dev.id);
    if (rawCli) {
      startupConfigs[`configs/${dev.label.toLowerCase()}.cfg`] = toStartupConfig(rawCli);
    } else {
      const devAddr = addr.byDevice[dev.id];
      if (devAddr?.interfaces[0]) {
        startupConfigs[`configs/${dev.label.toLowerCase()}.vpc`] = [
          `# VPCS startup script for ${dev.label}`,
          `set pcname ${dev.label}`,
          `ip ${devAddr.interfaces[0].ip} ${devAddr.interfaces[0].mask} ${devAddr.gateway ?? ""}`.trim(),
          "save",
          "",
        ].join("\n");
      }
    }

    if (dev.type === "SWITCH") {
      return {
        compute_id: "local",
        console: 5000 + idx,
        console_type: "none",
        first_port_name: null,
        height: 32,
        label: { rotation: 0, style: "font-family: TypeWriter;font-size: 10.0;font-weight: bold;fill: #000000;", text: dev.label, x: 6, y: -25 },
        name: dev.label,
        node_id: nodeId,
        node_type: "ethernet_switch",
        port_name_format: "Ethernet{0}",
        properties: {
          ports_mapping: Array.from({ length: 16 }, (_, p) => ({
            name: `Ethernet${p}`,
            port_number: p,
            type: p === 0 ? "dot1q" : "access",
            vlan: 1,
          })),
        },
        symbol: meta.gns3Symbol,
        width: 72,
        x,
        y,
        z: 1,
      };
    }

    if (dev.type === "ROUTER" || dev.type === "FIREWALL") {
      return {
        compute_id: "local",
        console: 5000 + idx,
        console_type: "telnet",
        first_port_name: null,
        height: 45,
        label: { rotation: 0, style: "font-family: TypeWriter;font-size: 10.0;font-weight: bold;fill: #000000;", text: dev.label, x: 12, y: -25 },
        name: dev.label,
        node_id: nodeId,
        node_type: "dynamips",
        port_name_format: "GigabitEthernet{adapter}/{port}",
        properties: {
          platform: "c7200",
          ram: 512,
          slot0: "C7200-IO-GE-E",
          slot1: "PA-GE",
          slot2: "PA-GE",
          startup_config: `configs/${dev.label.toLowerCase()}.cfg`,
        },
        symbol: meta.gns3Symbol,
        width: 66,
        x,
        y,
        z: 1,
      };
    }

    return {
      compute_id: "local",
      console: 5000 + idx,
      console_type: "telnet",
      first_port_name: null,
      height: 59,
      label: { rotation: 0, style: "font-family: TypeWriter;font-size: 10.0;font-weight: bold;fill: #000000;", text: dev.label, x: 10, y: -25 },
      name: dev.label,
      node_id: nodeId,
      node_type: "vpcs",
      port_name_format: "Ethernet{0}",
      properties: {},
      symbol: meta.gns3Symbol,
      width: 65,
      x,
      y,
      z: 1,
    };
  });

  const links = portLinks.map((m, idx) => ({
    filters: {},
    link_id: deterministicUuid(`${projectName}:link:${m.linkId}:${idx}`),
    link_style: {},
    nodes: [
      {
        adapter_number: 0,
        label: { rotation: 0, style: "font-family: TypeWriter;font-size: 9.0;fill: #334155;", text: m.fromShortPort, x: 0, y: 0 },
        node_id: nodeUuidById.get(m.fromId) ?? "",
        port_number: Math.min(15, m.fromSlot),
      },
      {
        adapter_number: 0,
        label: { rotation: 0, style: "font-family: TypeWriter;font-size: 9.0;fill: #334155;", text: m.toShortPort, x: 0, y: 0 },
        node_id: nodeUuidById.get(m.toId) ?? "",
        port_number: Math.min(15, m.toSlot),
      },
    ],
    suspend: false,
  }));

  const project = {
    auto_close: true,
    auto_open: false,
    auto_start: false,
    drawing_grid_size: 25,
    grid_size: 75,
    name: projectName,
    project_id: deterministicUuid(`${projectName}:project`),
    revision: 9,
    scene_height: 1000,
    scene_width: 2000,
    show_grid: true,
    show_interface_labels: true,
    show_layers: false,
    snap_to_grid: false,
    supplier: null,
    topology: {
      computations: [],
      drawings: [],
      links,
      nodes,
    },
    type: "topology",
    variables: null,
    version: "2.2.49",
    zoom: 100,
  };

  return {
    projectJson: JSON.stringify(project, null, 2) + "\n",
    startupConfigs,
  };
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generates an interactive, self-contained HTML build sheet + Packet Tracer 8.x startup `.cfg`
 * and instant CLI-paste `.txt` scripts for every Cisco device.
 */
export function generatePacketTracerBundle(
  topology: BuiltTopology,
  plan: NetworkPlan,
  acls: AclRule[] = [],
  projectName = "NetTopo AI Lab",
): {
  guideHtml: string;
  cablingCsv: string;
  startupConfigs: Record<string, string>;
  pasteScripts: Record<string, string>;
} {
  const addr = assignAddressing(topology, plan);
  const multi = generateMultiVendorConfigs(topology, plan, acls);
  const portLinks = assignDevicePorts(topology);

  const startupConfigs: Record<string, string> = {};
  const pasteScripts: Record<string, string> = {};
  for (const cfg of multi.cisco.configs) {
    const slug = cfg.hostname.toLowerCase();
    startupConfigs[`configs/${slug}-startup.cfg`] = toStartupConfig(cfg.cli);
    pasteScripts[`cli-paste/${slug}-paste.txt`] = cfg.cli + "\n";
  }

  const cablingCsv = [
    "link_id,from_device,from_port,to_device,to_port,packet_tracer_cable",
    ...portLinks.map((m) =>
      [m.linkId, m.fromLabel, m.fromPort, m.toLabel, m.toPort, m.cableType].join(","),
    ),
  ].join("\n") + "\n";

  const deviceRows = topology.devices
    .map((d) => {
      const a = addr.byDevice[d.id];
      const primary = a?.interfaces[0];
      const hw = PT_HARDWARE[d.type]?.ptModel ?? d.type;
      return `<tr>
        <td><strong>${escapeHtml(d.label)}</strong></td>
        <td>${escapeHtml(d.type)}</td>
        <td>${escapeHtml(hw)}</td>
        <td><code>${escapeHtml(primary?.ip ?? "—")}</code></td>
        <td><code>${escapeHtml(primary?.mask ?? "—")}</code></td>
        <td><code>${escapeHtml(a?.gateway ?? "—")}</code></td>
        <td>${a?.vlanId ? `VLAN ${a.vlanId}` : "Flat / Trunk"}</td>
      </tr>`;
    })
    .join("\n");

  const cableRows = portLinks
    .map(
      (m) => `<tr>
        <td><strong>${escapeHtml(m.fromLabel)}</strong></td>
        <td><code>${escapeHtml(m.fromPort)}</code></td>
        <td><strong>${escapeHtml(m.toLabel)}</strong></td>
        <td><code>${escapeHtml(m.toPort)}</code></td>
        <td>${escapeHtml(m.cableType)}</td>
      </tr>`,
    )
    .join("\n");

  const configCards = multi.cisco.configs
    .map(
      (c, i) => `<section class="card">
        <div class="card-head">
          <h3>${escapeHtml(c.hostname)} (${escapeHtml(c.type)})</h3>
          <button onclick="copyCfg('cfg-${i}', this)">Copy CLI</button>
        </div>
        <pre id="cfg-${i}">${escapeHtml(c.cli)}</pre>
      </section>`,
    )
    .join("\n");

  const guideHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(projectName)} — Cisco Packet Tracer 8.x Build Guide</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #0b1120; color: #e2e8f0; margin: 0; padding: 32px; line-height: 1.5; }
  .wrap { max-width: 1080px; margin: 0 auto; }
  h1 { margin: 0 0 8px; color: #38bdf8; }
  h2 { margin: 28px 0 12px; border-bottom: 1px solid #1e293b; padding-bottom: 6px; color: #f8fafc; }
  .note { background: #1e293b; border-left: 4px solid #38bdf8; padding: 14px 16px; border-radius: 8px; margin: 16px 0; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; background: #0f172a; border-radius: 8px; overflow: hidden; }
  th, td { padding: 10px 12px; border-bottom: 1px solid #1e293b; text-align: left; }
  th { background: #1e293b; color: #94a3b8; text-transform: uppercase; font-size: 11px; letter-spacing: .05em; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #38bdf8; }
  .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 10px; margin-bottom: 16px; overflow: hidden; }
  .card-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #1e293b; }
  .card-head h3 { margin: 0; font-size: 14px; }
  button { background: #2563eb; color: #fff; border: 0; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-weight: 600; font-size: 12px; }
  button:hover { background: #1d4ed8; }
  pre { margin: 0; padding: 14px; overflow-x: auto; font-size: 12px; font-family: ui-monospace, monospace; color: #cbd5e1; }
</style>
</head>
<body>
<div class="wrap">
  <h1>${escapeHtml(projectName)} — Cisco Packet Tracer 8.x Ready Guide</h1>
  <div class="note">
    <strong>How to load into Cisco Packet Tracer 8.x:</strong><br/>
    1. Drag the exact Cisco devices from the Device Inventory table onto the Packet Tracer canvas.<br/>
    2. Connect them using the exact ports &amp; cables in the Cabling Matrix.<br/>
    3. On each Router/Switch/Firewall: either go to <em>Config &rarr; NVRAM / Startup Config &rarr; Load</em> and select <code>configs/&lt;device&gt;-startup.cfg</code>, OR click <strong>Copy CLI</strong> below and paste directly into the device's <strong>CLI</strong> tab.<br/>
    4. For instant full-topology import with zero manual wiring, import the included <strong>Cisco CML (.yaml)</strong> or <strong>GNS3 (.gns3)</strong> file directly into Cisco Modeling Labs or GNS3.
  </div>

  <h2>1. Device Inventory &amp; IP Addressing (${topology.devices.length} Devices · ${plan.routing.protocol})</h2>
  <table>
    <thead><tr><th>Hostname</th><th>Role</th><th>Packet Tracer Model</th><th>IP Address</th><th>Subnet Mask</th><th>Gateway</th><th>VLAN</th></tr></thead>
    <tbody>${deviceRows}</tbody>
  </table>

  <h2>2. Port-to-Port Cabling Matrix (${portLinks.length} Links)</h2>
  <table>
    <thead><tr><th>From Device</th><th>Source Port</th><th>To Device</th><th>Destination Port</th><th>Cable Type</th></tr></thead>
    <tbody>${cableRows}</tbody>
  </table>

  <h2>3. Ready-to-Paste Cisco IOS Configurations (${multi.cisco.configs.length} Managed Devices)</h2>
  ${configCards}
</div>
<script>
function copyCfg(id, btn) {
  const txt = document.getElementById(id).innerText;
  navigator.clipboard.writeText(txt).then(() => {
    const old = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => (btn.textContent = old), 1500);
  });
}
</script>
</body>
</html>
`;

  return { guideHtml, cablingCsv, startupConfigs, pasteScripts };
}
