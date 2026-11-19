import {
  assignAddressing,
  generateCiscoConfigs,
  type Addressing,
  type CiscoExport,
} from "@/lib/network-engine/cisco";
import { intToIp, ipToInt, maskFromPrefix } from "@/lib/network-engine/ip-planner";
import type { AclRule, BuiltTopology, NetworkPlan } from "@/lib/network-engine/types";

export interface MultiVendorExport {
  cisco: CiscoExport;
  mikrotik: string;
  junos: string;
  ansibleInventory: string;
  addressing: Addressing;
}

function subnetForVlan(addr: Addressing, vlan: number | "any"): string {
  if (vlan === "any") return "any";
  const match = addr.subnets.find((s) => s.vlanId === vlan);
  if (!match) return "any";
  const wildcard = intToIp((~ipToInt(match.mask)) >>> 0);
  return `${intToIp(match.network)} ${wildcard}`;
}

function cidrForVlan(addr: Addressing, vlan: number | "any"): string {
  if (vlan === "any") return "0.0.0.0/0";
  return addr.subnets.find((s) => s.vlanId === vlan)?.cidr ?? "0.0.0.0/0";
}

function renderCiscoAclBlock(addr: Addressing, acls: AclRule[]): string {
  if (acls.length === 0) return "";
  const lines = [
    "!",
    "! ===== Zero-Trust Inter-VLAN Extended ACL =====",
    "ip access-list extended NETTOPO-ZERO-TRUST",
  ];
  for (const r of acls) {
    const src = subnetForVlan(addr, r.sourceVlan);
    const dst = subnetForVlan(addr, r.destinationVlan);
    const portPart = r.port ? ` eq ${r.port}` : "";
    lines.push(` remark ${r.name}: ${r.description}`);
    lines.push(` ${r.action} ${r.protocol} ${src} ${dst}${portPart}`);
  }
  lines.push(" permit ip any any", "exit", "!");
  return lines.join("\n");
}

function renderMikroTik(topology: BuiltTopology, plan: NetworkPlan, addr: Addressing, acls: AclRule[]): string {
  const router = topology.devices.find((d) => d.type === "ROUTER");
  const lines = [
    `# NetTopo AI 2.0 - MikroTik RouterOS v7 Configuration`,
    `/system identity set name=${router?.label ?? "NetTopo-Core"}`,
    `/interface bridge add name=bridge-lan vlan-filtering=${addr.mode === "vlan" ? "yes" : "no"}`,
    "",
  ];

  if (addr.mode === "vlan") {
    lines.push("# --- VLAN Interfaces & Gateways ---");
    for (const s of addr.subnets) {
      lines.push(`/interface vlan add interface=bridge-lan name=vlan${s.vlanId}-${s.name.toLowerCase()} vlan-id=${s.vlanId}`);
      lines.push(`/ip address add address=${s.gateway}/${s.prefix} interface=vlan${s.vlanId}-${s.name.toLowerCase()}`);
      if (s.vlanId !== 99) {
        const size = 2 ** (32 - s.prefix);
        const start = intToIp(s.network + 2);
        const end = intToIp(s.network + size - 2);
        lines.push(`/ip pool add name=pool-${s.name.toLowerCase()} ranges=${start}-${end}`);
        lines.push(`/ip dhcp-server add address-pool=pool-${s.name.toLowerCase()} interface=vlan${s.vlanId}-${s.name.toLowerCase()} name=dhcp-${s.name.toLowerCase()} disabled=no`);
        lines.push(`/ip dhcp-server network add address=${s.cidr} gateway=${s.gateway} dns-server=8.8.8.8`);
      }
    }
  } else if (addr.subnets[0]) {
    const s = addr.subnets[0];
    lines.push(`/ip address add address=${s.gateway}/${s.prefix} interface=bridge-lan`);
  }

  if (acls.length > 0) {
    lines.push("", "# --- Zero-Trust Inter-VLAN Firewall Filter ---");
    for (const r of acls) {
      const action = r.action === "permit" ? "accept" : "drop";
      const src = cidrForVlan(addr, r.sourceVlan);
      const dst = cidrForVlan(addr, r.destinationVlan);
      const proto = r.protocol === "ip" ? "" : ` protocol=${r.protocol}`;
      const port = r.port ? ` dst-port=${r.port}` : "";
      lines.push(`/ip firewall filter add chain=forward action=${action}${proto} src-address=${src} dst-address=${dst}${port} comment="${r.name}"`);
    }
  }

  if (plan.routing.protocol === "OSPF") {
    lines.push("", "# --- OSPF Routing ---");
    lines.push(`/routing ospf instance add name=ospf-v2 version=2`);
    lines.push(`/routing ospf area add instance=ospf-v2 name=backbone area-id=0.0.0.0`);
    for (const s of addr.subnets) {
      lines.push(`/routing ospf interface-template add area=backbone networks=${s.cidr}`);
    }
  }

  return lines.join("\n") + "\n";
}

function renderJunos(topology: BuiltTopology, plan: NetworkPlan, addr: Addressing, acls: AclRule[]): string {
  const router = topology.devices.find((d) => d.type === "ROUTER");
  const lines = [
    `# NetTopo AI 2.0 - Juniper Junos OS Configuration`,
    `set system host-name ${router?.label ?? "NetTopo-Core"}`,
    `set system services ssh`,
    "",
  ];

  if (addr.mode === "vlan") {
    lines.push("# --- VLANs & IRB L3 Interfaces ---");
    for (const s of addr.subnets) {
      lines.push(`set vlans ${s.name} vlan-id ${s.vlanId}`);
      lines.push(`set vlans ${s.name} l3-interface irb.${s.vlanId}`);
      lines.push(`set interfaces irb unit ${s.vlanId} family inet address ${s.gateway}/${s.prefix}`);
    }
  } else if (addr.subnets[0]) {
    const s = addr.subnets[0];
    lines.push(`set interfaces ge-0/0/0 unit 0 family inet address ${s.gateway}/${s.prefix}`);
  }

  if (acls.length > 0) {
    lines.push("", "# --- Zero-Trust Stateless Firewall Filter ---");
    for (const r of acls) {
      const term = r.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const src = cidrForVlan(addr, r.sourceVlan);
      const dst = cidrForVlan(addr, r.destinationVlan);
      lines.push(`set firewall family inet filter ZERO-TRUST term ${term} from source-address ${src}`);
      lines.push(`set firewall family inet filter ZERO-TRUST term ${term} from destination-address ${dst}`);
      if (r.protocol !== "ip") {
        lines.push(`set firewall family inet filter ZERO-TRUST term ${term} from protocol ${r.protocol}`);
      }
      if (r.port) {
        lines.push(`set firewall family inet filter ZERO-TRUST term ${term} from destination-port ${r.port}`);
      }
      lines.push(`set firewall family inet filter ZERO-TRUST term ${term} then ${r.action === "permit" ? "accept" : "discard"}`);
    }
    lines.push(`set firewall family inet filter ZERO-TRUST term default-allow then accept`);
  }

  if (plan.routing.protocol === "OSPF") {
    lines.push("", "# --- OSPF Area 0 ---");
    for (const s of addr.subnets) {
      lines.push(`set protocols ospf area 0.0.0.0 interface irb.${s.vlanId ?? 0}`);
    }
  }

  return lines.join("\n") + "\n";
}

function renderAnsibleInventory(topology: BuiltTopology, plan: NetworkPlan, addr: Addressing): string {
  const groups: Record<string, string[]> = { routers: [], switches: [], firewalls: [], servers: [] };
  for (const d of topology.devices) {
    const ip = addr.byDevice[d.id]?.interfaces[0]?.ip ?? "127.0.0.1";
    const entry = `        ${d.label}:\n          ansible_host: ${ip}\n          device_role: ${d.type}`;
    if (d.type === "ROUTER") groups.routers.push(entry);
    else if (d.type === "SWITCH") groups.switches.push(entry);
    else if (d.type === "FIREWALL") groups.firewalls.push(entry);
    else if (d.type === "SERVER" || d.type === "NVR") groups.servers.push(entry);
  }
  const lines = [
    "# NetTopo AI 2.0 - Ansible Automation Inventory",
    "all:",
    "  vars:",
    `    routing_protocol: "${plan.routing.protocol}"`,
    `    network_mode: "${addr.mode}"`,
    `    vlan_count: ${plan.vlanPlan.length}`,
    "    ansible_network_os: cisco.ios.ios",
    "  children:",
  ];
  for (const [group, hosts] of Object.entries(groups)) {
    lines.push(`    ${group}:`);
    lines.push("      hosts:");
    if (hosts.length) lines.push(...hosts);
    else lines.push("        {}");
  }
  return lines.join("\n") + "\n";
}

export function generateMultiVendorConfigs(
  topology: BuiltTopology,
  plan: NetworkPlan,
  acls: AclRule[] = [],
): MultiVendorExport {
  const addressing = assignAddressing(topology, plan);
  const baseCisco = generateCiscoConfigs(topology, plan, addressing);
  const aclBlock = renderCiscoAclBlock(addressing, acls);
  const cisco: CiscoExport = aclBlock
    ? {
        ...baseCisco,
        combined: `${baseCisco.combined}\n${aclBlock}\n`,
        configs: baseCisco.configs.map((c) =>
          c.type === "ROUTER" || c.type === "FIREWALL" ? { ...c, cli: `${c.cli}\n${aclBlock}` } : c,
        ),
      }
    : baseCisco;

  // Ensure maskFromPrefix reference stays aligned with subnet helpers
  void maskFromPrefix;

  return {
    cisco,
    mikrotik: renderMikroTik(topology, plan, addressing, acls),
    junos: renderJunos(topology, plan, addressing, acls),
    ansibleInventory: renderAnsibleInventory(topology, plan, addressing),
    addressing,
  };
}
