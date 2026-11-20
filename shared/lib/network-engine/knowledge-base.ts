/**
 * Topova engineering knowledge base.
 *
 * Structured reference data the Agent queries through `lookup_engineering_spec`
 * instead of recalling figures from LLM memory. Hardware figures come from
 * public vendor datasheets (port counts, PoE budgets, rack units, uplinks);
 * `priceUsd` ranges are approximate street prices intended for planning and
 * MUST be treated as estimates, not quotes. Reliability figures are planning
 * assumptions (MTBF / MTTR), not vendor guarantees.
 */

export interface SkuVerification {
  /** verified: ports/PoE/uplinks matched vendor sources; partial: some figures differ across sources; unverified: not checked. */
  status: "verified" | "partial" | "unverified";
  checkedOn: string;
  sources: string[];
  note?: string;
}

export type HardwareClass = "access-switch" | "router" | "firewall" | "access-point";
export type PoeStandard = "802.3af" | "802.3at" | "802.3bt";

export interface HardwareSku {
  sku: string;
  vendor: "Cisco" | "Ubiquiti" | "MikroTik" | "Juniper";
  class: HardwareClass;
  description: string;
  /** Downlink (access) ports. */
  ports: number;
  portSpeedMbps: number;
  /** How many of `ports` can deliver PoE. */
  poePorts: number;
  poeStandard?: PoeStandard;
  /** Total PoE power budget in watts. */
  poeBudgetW: number;
  uplinks: { count: number; speedMbps: number };
  /** Provenance of the figures above (filled by VERIFICATION below). */
  verification?: SkuVerification;
  /** Switching capacity (switches) or routed/inspected throughput (routers, firewalls) in Mbps. */
  throughputMbps: number;
  rackUnits: number;
  priceUsd: { min: number; max: number };
}

const sw = (
  sku: string,
  vendor: HardwareSku["vendor"],
  description: string,
  ports: number,
  poePorts: number,
  poeBudgetW: number,
  uplinkCount: number,
  uplinkSpeed: number,
  throughputGbps: number,
  rackUnits: number,
  min: number,
  max: number,
  poeStandard?: PoeStandard,
): HardwareSku => ({
  sku,
  vendor,
  class: "access-switch",
  description,
  ports,
  portSpeedMbps: 1000,
  poePorts,
  poeStandard,
  poeBudgetW,
  uplinks: { count: uplinkCount, speedMbps: uplinkSpeed },
  throughputMbps: throughputGbps * 1000,
  rackUnits,
  priceUsd: { min, max },
});

export const ACCESS_SWITCHES: HardwareSku[] = [
  sw("C1000-24T-4G-L", "Cisco", "Catalyst 1000 24x GbE, 4x 1G SFP, no PoE", 24, 0, 0, 4, 1000, 56, 1, 450, 700),
  sw("C1000-24P-4G-L", "Cisco", "Catalyst 1000 24x GbE PoE+, 4x 1G SFP", 24, 24, 195, 4, 1000, 56, 1, 1000, 1500, "802.3at"),
  sw("C1000-48P-4G-L", "Cisco", "Catalyst 1000 48x GbE PoE+, 4x 1G SFP", 48, 48, 370, 4, 1000, 104, 1, 1900, 2600, "802.3at"),
  sw("C9200L-24P-4G", "Cisco", "Catalyst 9200L 24x GbE PoE+, 4x 1G uplinks", 24, 24, 370, 4, 1000, 56, 1, 2600, 3500, "802.3at"),
  sw("C9200L-48P-4X", "Cisco", "Catalyst 9200L 48x GbE PoE+, 4x 10G uplinks", 48, 48, 740, 4, 10000, 176, 1, 5200, 6800, "802.3at"),
  sw("USW-Pro-24-PoE", "Ubiquiti", "UniFi Pro 24 PoE (16x 802.3at + 8x 802.3bt), 2x 10G SFP+", 24, 24, 400, 2, 10000, 88, 1, 600, 800, "802.3bt"),
  sw("USW-Pro-48-PoE", "Ubiquiti", "UniFi Pro 48 PoE, 4x 10G SFP+", 48, 48, 600, 4, 10000, 176, 1, 1000, 1300, "802.3bt"),
  sw("CRS326-24G-2S+RM", "MikroTik", "CRS326 24x GbE, 2x 10G SFP+, no PoE", 24, 0, 0, 2, 10000, 68, 1, 200, 300),
  sw("CRS354-48P-4S+2Q+RM", "MikroTik", "CRS354 48x GbE PoE, 4x 10G SFP+, 2x 40G QSFP+", 48, 48, 700, 6, 10000, 176, 1, 550, 800, "802.3at"),
];

const rt = (
  sku: string,
  vendor: HardwareSku["vendor"],
  cls: "router" | "firewall",
  description: string,
  ports: number,
  uplinks: number,
  uplinkSpeed: number,
  throughputMbps: number,
  rackUnits: number,
  min: number,
  max: number,
): HardwareSku => ({
  sku,
  vendor,
  class: cls,
  description,
  ports,
  portSpeedMbps: 1000,
  poePorts: 0,
  poeBudgetW: 0,
  uplinks: { count: uplinks, speedMbps: uplinkSpeed },
  throughputMbps,
  rackUnits,
  priceUsd: { min, max },
});

export const ROUTERS: HardwareSku[] = [
  rt("RB4011iGS+RM", "MikroTik", "router", "10x GbE + 1x 10G SFP+, 1U", 10, 1, 10000, 5000, 1, 180, 260),
  rt("ISR1100-4G", "Cisco", "router", "ISR 1100 4x GbE routed", 4, 0, 1000, 500, 1, 650, 900),
  rt("C8200-1N-4T", "Cisco", "router", "Catalyst 8200 edge, 4x GbE + NIM slot, IPv4 forwarding 3.8 Gbps (1400 B)", 4, 0, 1000, 3800, 1, 2800, 4200),
  rt("ISR4331/K9", "Cisco", "router", "ISR 4331 3x GbE, ~100-300 Mbps by licence", 3, 0, 1000, 300, 1, 2200, 3200),
  rt("CCR2004-16G-2S+", "MikroTik", "router", "16x GbE + 2x 10G SFP+, 1U", 16, 2, 10000, 10000, 1, 450, 650),
  rt("MX204", "Juniper", "router", "Edge router, 4x 100G / 8x 10G class", 8, 8, 10000, 40000, 1, 28000, 42000),
];

export const FIREWALLS: HardwareSku[] = [
  rt("UXG-Pro", "Ubiquiti", "firewall", "UniFi Next-Gen Gateway, IDS/IPS 3.5 Gbps, 2x GbE + 2x SFP+", 2, 2, 10000, 3500, 1, 350, 450),
  rt("FPR1010", "Cisco", "firewall", "Firepower 1010, 8x GbE, FW+AVC 890 Mbps (current datasheet)", 8, 0, 1000, 890, 1, 550, 900),
  rt("FPR1120", "Cisco", "firewall", "Firepower 1120, 8x GbE + 4x SFP, FW+AVC 2.3 Gbps (current datasheet)", 12, 4, 1000, 2300, 1, 2200, 3000),
  rt("SRX345", "Juniper", "firewall", "SRX345 branch NGFW, 8x GbE + 8x SFP, 5 Gbps @1518 B / 1.5 Gbps IMIX", 16, 8, 1000, 1500, 1, 1700, 2400),
  rt("FPR2110", "Cisco", "firewall", "Firepower 2110, 12x GbE + 4x SFP, FW+AVC ~1.9 Gbps (sources vary 1.9-3 Gbps)", 16, 4, 1000, 1900, 1, 6500, 9000),
];

export const ACCESS_POINTS: (HardwareSku & { requiredPoeWatts: number })[] = [
  {
    ...rt("U6-Pro", "Ubiquiti", "firewall", "WiFi 6 AP, max 13 W, 802.3at/PoE+ recommended (802.3af is marginal)", 1, 0, 1000, 4800, 0, 150, 190),
    class: "access-point",
    poeStandard: "802.3at",
    requiredPoeWatts: 13,
  },
  {
    ...rt("C9120AXI-E", "Cisco", "firewall", "Catalyst 9120AX WiFi 6 AP, 802.3at", 1, 0, 1000, 4800, 0, 900, 1300),
    class: "access-point",
    poeStandard: "802.3at",
    requiredPoeWatts: 25.5,
  },
];

// ---------------------------------------------------------------------------
// Reliability planning assumptions (availability = MTBF / (MTBF + MTTR)).
// ---------------------------------------------------------------------------

const CHECKED = "2026-11-20";
const CISCO_9200 = "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-9200-series-switches/nb-06-cat9200-architecture-cte-en.html";
const CISCO_1000 = "https://www.cisco.com/c/en/us/products/collateral/switches/catalyst-1000-series-switches/nb-06-cat1k-ser-switch-ds-cte-en.html";
const CISCO_FPR1000 = "https://www.cisco.com/c/en/us/products/collateral/security/firepower-1000-series/datasheet-c78-742469.html";
const MT_CRS354 = "https://mikrotik.com/product/crs354_48p_4s_2q_rm";
const UI_SPEC = (slug: string) => `https://techspecs.ui.com/unifi/switching/${slug}`;

/** Result of the spec review against vendor documentation. Prices are never verified (estimates). */
export const SKU_VERIFICATION: Record<string, SkuVerification> = {
  "C1000-24P-4G-L": { status: "verified", checkedOn: CHECKED, sources: [CISCO_1000], note: "24 PoE+ ports, 195 W, 4x 1G SFP." },
  "C1000-48P-4G-L": { status: "verified", checkedOn: CHECKED, sources: [CISCO_1000], note: "370 W budget (the 740 W figure belongs to the 48FP model)." },
  "C9200L-24P-4G": { status: "verified", checkedOn: CHECKED, sources: [CISCO_9200], note: "370 W with one PWR-C5-600WAC; 740 W with a second PSU." },
  "C9200L-48P-4X": { status: "verified", checkedOn: CHECKED, sources: [CISCO_9200], note: "740 W with one PWR-C5-1KWAC; 1440 W with two." },
  "USW-Pro-24-PoE": { status: "verified", checkedOn: CHECKED, sources: [UI_SPEC("usw-pro-24-poe")], note: "400 W; switching capacity 88 Gbps." },
  "USW-Pro-48-PoE": { status: "verified", checkedOn: CHECKED, sources: [UI_SPEC("usw-pro-48-poe")], note: "600 W; 176 Gbps." },
  "CRS326-24G-2S+RM": { status: "verified", checkedOn: CHECKED, sources: ["https://mikrotik.com/product/CRS326-24G-2SplusRM"], note: "24x GbE + 2x SFP+, no PoE out." },
  "CRS354-48P-4S+2Q+RM": { status: "partial", checkedOn: CHECKED, sources: [MT_CRS354], note: "Passive PoE 802.3af/at; total budget quoted as 700 W or 750 W by different sellers, 700 W used." },
  "RB4011iGS+RM": { status: "verified", checkedOn: CHECKED, sources: ["https://mikrotik.com/product/rb4011igs_rm"], note: "10x GbE + 1x SFP+ confirmed; throughput figure is a planning value." },
  "CCR2004-16G-2S+": { status: "verified", checkedOn: CHECKED, sources: ["https://mikrotik.com/product/ccr2004_16g_2splus"], note: "16x GbE + 2x SFP+ confirmed; throughput is a planning value." },
  "C8200-1N-4T": { status: "verified", checkedOn: CHECKED, sources: ["https://www.cisco.com/c/en/us/products/collateral/routers/catalyst-8200-series-edge-platforms/nb-06-cat8200-series-edge-plat-ds-cte-en.html"], note: "3.8 Gbps IPv4 forwarding (1400 B); 900 Mbps IPsec IMIX." },
  "FPR1010": { status: "partial", checkedOn: CHECKED, sources: [CISCO_FPR1000], note: "Current datasheet 890 Mbps FW+AVC; older revision said 650 Mbps." },
  "FPR1120": { status: "partial", checkedOn: CHECKED, sources: [CISCO_FPR1000], note: "Current datasheet 2.3 Gbps FW+AVC; older revision said 1.5 Gbps." },
  "SRX345": { status: "verified", checkedOn: CHECKED, sources: ["https://apps.juniper.net/hct/product/SRX345/hwspecs"], note: "8 RJ-45 + 8 SFP; 5 Gbps at 1518 B, 1.5 Gbps IMIX (IMIX used)." },
  "UXG-Pro": { status: "verified", checkedOn: CHECKED, sources: ["https://techspecs.ui.com/unifi/advanced-hosting/uxg-pro"], note: "IDS/IPS throughput 3.5 Gbps." },
  "FPR2110": { status: "partial", checkedOn: CHECKED, sources: [], note: "Throughput varies 1.9-3 Gbps by image and test profile; official datasheet not retrieved." },
  "ISR4331/K9": { status: "unverified", checkedOn: CHECKED, sources: [], note: "Throughput is licence-limited (~100-300 Mbps); check the Cisco datasheet." },
  "ISR1100-4G": { status: "unverified", checkedOn: CHECKED, sources: [], note: "Not checked against a vendor datasheet." },
  "MX204": { status: "unverified", checkedOn: CHECKED, sources: [], note: "Not checked against a vendor datasheet." },
  "C1000-24T-4G-L": { status: "unverified", checkedOn: CHECKED, sources: [], note: "Not checked individually." },
  "U6-Pro": { status: "partial", checkedOn: CHECKED, sources: [], note: "Max 13 W draw; PoE+ (802.3at) recommended, 802.3af is marginal." },
  "C9120AXI-E": { status: "partial", checkedOn: CHECKED, sources: [], note: "Full features need 802.3at (25.5 W); 802.3af runs reduced radios." },
};

for (const s of [...ACCESS_SWITCHES, ...ROUTERS, ...FIREWALLS, ...ACCESS_POINTS]) {
  s.verification = SKU_VERIFICATION[s.sku] ?? {
    status: "unverified",
    checkedOn: CHECKED,
    sources: [],
  };
}

export interface ReliabilityModel {
  mtbfHours: number;
  mttrHours: number;
}

export const RELIABILITY: Record<"switch" | "router" | "firewall", ReliabilityModel> = {
  switch: { mtbfHours: 250_000, mttrHours: 4 },
  router: { mtbfHours: 150_000, mttrHours: 4 },
  firewall: { mtbfHours: 120_000, mttrHours: 4 },
};

/** Typical single-homed business ISP circuit SLA. */
export const ISP_AVAILABILITY = 0.999;

export function availabilityOf(model: ReliabilityModel): number {
  return model.mtbfHours / (model.mtbfHours + model.mttrHours);
}

// ---------------------------------------------------------------------------
// Standards & reference entries
// ---------------------------------------------------------------------------

export interface PoeClass {
  standard: PoeStandard;
  ieee: string;
  type: number;
  pseWatts: number;
  pdWatts: number;
  pairs: number;
}

export const POE_STANDARDS: PoeClass[] = [
  { standard: "802.3af", ieee: "IEEE 802.3af (PoE)", type: 1, pseWatts: 15.4, pdWatts: 12.95, pairs: 2 },
  { standard: "802.3at", ieee: "IEEE 802.3at (PoE+)", type: 2, pseWatts: 30, pdWatts: 25.5, pairs: 2 },
  { standard: "802.3bt", ieee: "IEEE 802.3bt Type 3 (PoE++)", type: 3, pseWatts: 60, pdWatts: 51, pairs: 4 },
  { standard: "802.3bt", ieee: "IEEE 802.3bt Type 4 (PoE++)", type: 4, pseWatts: 90, pdWatts: 71.3, pairs: 4 },
];

export interface CableSpec {
  medium: string;
  standard: string;
  maxDistanceM: Record<string, number>;
  /** Attenuation: dB per 100 m @100 MHz for copper channel limit, dB/km for fibre. */
  attenuation: string;
  notes: string;
}

export const CABLE_SPECS: CableSpec[] = [
  { medium: "Cat5e", standard: "TIA-568 / ISO 11801", maxDistanceM: { "100M": 100, "1G": 100 }, attenuation: "24.0 dB channel insertion loss @100 MHz", notes: "Not rated for 10GBASE-T." },
  { medium: "Cat6", standard: "TIA-568-C.2", maxDistanceM: { "100M": 100, "1G": 100, "10G": 55 }, attenuation: "21.3 dB channel insertion loss @100 MHz", notes: "10GBASE-T limited to 55 m." },
  { medium: "Cat6A", standard: "TIA-568-C.2", maxDistanceM: { "100M": 100, "1G": 100, "10G": 100 }, attenuation: "20.9 dB channel insertion loss @100 MHz", notes: "Full 100 m 10GBASE-T; required for PoE++ bundles." },
  { medium: "OM3", standard: "ISO 11801 / 850 nm MMF", maxDistanceM: { "1G": 550, "10G": 300, "40G": 100 }, attenuation: "3.0 dB/km @850 nm", notes: "Laser-optimised 50/125 multimode." },
  { medium: "OM4", standard: "ISO 11801 / 850 nm MMF", maxDistanceM: { "1G": 550, "10G": 400, "40G": 150 }, attenuation: "3.0 dB/km @850 nm", notes: "Higher bandwidth than OM3." },
  { medium: "OS2", standard: "ITU-T G.652.D single-mode", maxDistanceM: { "1G": 10000, "10G": 10000, "40G": 10000 }, attenuation: "0.4 dB/km @1310 nm", notes: "10GBASE-LR reach 10 km." },
];

export interface ProtocolTimer {
  protocol: string;
  timers: Record<string, string>;
  notes: string;
}

export const PROTOCOL_TIMERS: ProtocolTimer[] = [
  { protocol: "STP (802.1D)", timers: { hello: "2 s", forwardDelay: "15 s", maxAge: "20 s" }, notes: "Classic convergence 30-50 s." },
  { protocol: "RSTP (802.1w)", timers: { hello: "2 s", convergence: "typically < 1-2 s via proposal/agreement" }, notes: "Prefer Rapid-PVST+ on Cisco access layers." },
  { protocol: "HSRP", timers: { hello: "3 s", hold: "10 s", preempt: "disabled by default" }, notes: "Tune to 1 s / 3 s for sub-5 s failover." },
  { protocol: "VRRP (RFC 5798)", timers: { advertisement: "1 s", masterDown: "~3 x advert + skew" }, notes: "Multi-vendor FHRP." },
  { protocol: "OSPF", timers: { helloBroadcast: "10 s", deadBroadcast: "40 s", helloNbma: "30 s", deadNbma: "120 s" }, notes: "Cost = reference bandwidth / interface bandwidth; default reference 100 Mbps." },
];

export const OSPF_COST_REFERENCE = {
  defaultReferenceMbps: 100,
  recommendedReferenceMbps: 100_000,
  note: "With the default 100 Mbps reference, 100M/1G/10G all cost 1. Set `auto-cost reference-bandwidth 100000` on every router.",
  costs: (refMbps: number) =>
    [10, 100, 1000, 10_000, 40_000].map((bw) => ({
      linkMbps: bw,
      cost: Math.max(1, Math.floor(refMbps / bw)),
    })),
};

export const RFC1918_RANGES = [
  { cidr: "10.0.0.0/8", addresses: 16_777_216, rfc: "RFC 1918" },
  { cidr: "172.16.0.0/12", addresses: 1_048_576, rfc: "RFC 1918" },
  { cidr: "192.168.0.0/16", addresses: 65_536, rfc: "RFC 1918" },
];

export function cidrTable(): { prefix: number; mask: string; addresses: number; usableHosts: number }[] {
  const rows = [];
  for (let prefix = 16; prefix <= 31; prefix++) {
    const size = 2 ** (32 - prefix);
    let mask = 0;
    for (let i = 0; i < prefix; i++) mask |= 1 << (31 - i);
    const m = mask >>> 0;
    rows.push({
      prefix,
      mask: [(m >>> 24) & 255, (m >>> 16) & 255, (m >>> 8) & 255, m & 255].join("."),
      addresses: size,
      usableHosts: prefix === 31 ? 2 : size - 2,
    });
  }
  return rows;
}

export interface HardeningRule {
  id: string;
  title: string;
  framework: string;
  /** NIST SP 800-53 control family or SP 800-207 tenet. */
  nist: string;
  platform: "Cisco IOS" | "Cisco ASA";
  commands: string[];
  rationale: string;
}

export const HARDENING_RULES: HardeningRule[] = [
  { id: "mgmt-ssh", title: "Management plane: SSHv2 only", framework: "CIS Cisco IOS Benchmark (management plane)", nist: "SC-8 / AC-17", platform: "Cisco IOS", commands: ["ip domain-name topova.local", "crypto key generate rsa modulus 2048", "ip ssh version 2", "line vty 0 15", " transport input ssh", " login local", " exec-timeout 10 0", "no ip http server", "no ip http secure-server"], rationale: "Removes clear-text Telnet/HTTP management." },
  { id: "passwords", title: "Credential protection", framework: "CIS Cisco IOS Benchmark (AAA)", nist: "IA-5", platform: "Cisco IOS", commands: ["service password-encryption", "enable algorithm-type scrypt secret <strong-secret>", "username admin privilege 15 algorithm-type scrypt secret <strong-secret>", "security passwords min-length 12", "login block-for 120 attempts 5 within 60"], rationale: "Stops plaintext secrets and throttles brute force." },
  { id: "aaa", title: "Centralised AAA", framework: "CIS Cisco IOS Benchmark (AAA)", nist: "AC-2 / AU-2", platform: "Cisco IOS", commands: ["aaa new-model", "aaa authentication login default group tacacs+ local", "aaa authorization exec default group tacacs+ local", "aaa accounting commands 15 default start-stop group tacacs+"], rationale: "Per-user accountability with local fallback." },
  { id: "l2-edge", title: "Access-port protection", framework: "CIS Cisco IOS Benchmark (data plane)", nist: "SC-7 / CM-7", platform: "Cisco IOS", commands: ["interface range GigabitEthernet1/0/1 - 24", " switchport mode access", " spanning-tree portfast", " spanning-tree bpduguard enable", " switchport port-security maximum 2", " switchport port-security violation restrict", " storm-control broadcast level 5"], rationale: "Blocks rogue switches, MAC flooding and broadcast storms." },
  { id: "dhcp-dai", title: "DHCP snooping + Dynamic ARP inspection", framework: "CIS Cisco IOS Benchmark (data plane)", nist: "SC-7", platform: "Cisco IOS", commands: ["ip dhcp snooping", "ip dhcp snooping vlan 10,20,30", "ip arp inspection vlan 10,20,30", "interface <uplink>", " ip dhcp snooping trust", " ip arp inspection trust"], rationale: "Stops rogue DHCP servers and ARP poisoning." },
  { id: "unused-ports", title: "Shut unused ports, isolate native VLAN", framework: "CIS Cisco IOS Benchmark (data plane)", nist: "CM-7", platform: "Cisco IOS", commands: ["interface range GigabitEthernet1/0/20 - 24", " switchport access vlan 999", " shutdown", "interface <trunk>", " switchport trunk native vlan 999"], rationale: "Reduces attack surface and VLAN-hopping risk." },
  { id: "logging-ntp", title: "Logging and authenticated time", framework: "CIS Cisco IOS Benchmark (control plane)", nist: "AU-8 / AU-12", platform: "Cisco IOS", commands: ["service timestamps log datetime msec", "logging host 10.0.99.10", "logging trap informational", "ntp authenticate", "ntp authentication-key 1 md5 <key>", "ntp trusted-key 1"], rationale: "Forensic-grade, time-consistent logs." },
  { id: "zt-segmentation", title: "Zero-Trust inter-VLAN segmentation", framework: "NIST SP 800-207 Zero Trust", nist: "SP 800-207 tenet 3-6 / SC-7", platform: "Cisco IOS", commands: ["ip access-list extended USERS-TO-SERVERS", " permit tcp 10.0.10.0 0.0.0.255 host 10.0.20.10 eq 443", " deny ip any any log", "interface Vlan10", " ip access-group USERS-TO-SERVERS in"], rationale: "Deny-by-default between segments, explicit least-privilege permits." },
  { id: "asa-baseline", title: "Perimeter deny-by-default", framework: "NIST SP 800-207 / CIS Firewall guidance", nist: "SC-7", platform: "Cisco ASA", commands: ["access-list OUTSIDE-IN extended deny ip any any log", "access-group OUTSIDE-IN in interface outside", "ssh scopy enable", "ssh version 2", "ssh 10.0.99.0 255.255.255.0 inside", "no http server enable", "threat-detection basic-threat"], rationale: "Explicit ingress policy, SSH from the management VLAN only." },
];

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

export type SpecCategory = "hardware" | "poe" | "cabling" | "protocol" | "addressing" | "hardening";

export interface SpecEntry {
  id: string;
  category: SpecCategory;
  title: string;
  keywords: string[];
  data: unknown;
}

let cachedEntries: SpecEntry[] | null = null;

export function buildSpecEntries(): SpecEntry[] {
  if (cachedEntries) return cachedEntries;
  const entries: SpecEntry[] = [];
  const hw = [...ACCESS_SWITCHES, ...ROUTERS, ...FIREWALLS, ...ACCESS_POINTS];
  for (const h of hw) {
    entries.push({
      id: `hw:${h.sku}`,
      category: "hardware",
      title: `${h.vendor} ${h.sku}`,
      keywords: [h.vendor, h.sku, h.class, h.description, h.poeStandard ?? ""].map((s) => s.toLowerCase()),
      data: { ...h, priceNote: "Approximate street price range (estimate, not a quote)." },
    });
  }
  entries.push(
    { id: "poe", category: "poe", title: "IEEE 802.3af/at/bt PoE classes", keywords: ["poe", "802.3af", "802.3at", "802.3bt", "power", "watt", "poe+", "poe++"], data: POE_STANDARDS },
    { id: "cabling", category: "cabling", title: "Cable types, max distances and attenuation", keywords: ["cat5e", "cat6", "cat6a", "om3", "om4", "os2", "cable", "fiber", "fibre", "distance", "attenuation", "copper"], data: CABLE_SPECS },
    { id: "timers", category: "protocol", title: "STP / RSTP / HSRP / VRRP / OSPF timers", keywords: ["stp", "rstp", "hsrp", "vrrp", "ospf", "timer", "hello", "dead", "convergence", "spanning"], data: PROTOCOL_TIMERS },
    { id: "ospf-cost", category: "protocol", title: "OSPF cost and reference bandwidth", keywords: ["ospf", "cost", "reference", "bandwidth"], data: { ...OSPF_COST_REFERENCE, defaultCosts: OSPF_COST_REFERENCE.costs(100), recommendedCosts: OSPF_COST_REFERENCE.costs(100_000) } },
    { id: "vlan", category: "protocol", title: "IEEE 802.1Q VLAN tagging", keywords: ["802.1q", "vlan", "trunk", "tag", "native"], data: { tagBytes: 4, vlanIdBits: 12, usableVlanIds: "1-4094", reserved: "0 and 4095", normalRange: "1-1005 (Cisco VTP normal), extended 1006-4094", mtuWithTag: 1522 } },
    { id: "rfc1918", category: "addressing", title: "RFC 1918 private ranges", keywords: ["rfc1918", "rfc 1918", "private", "address", "ipv4"], data: RFC1918_RANGES },
    { id: "cidr", category: "addressing", title: "CIDR prefix, mask and host table", keywords: ["cidr", "mask", "subnet", "prefix", "hosts", "vlsm"], data: cidrTable() },
    { id: "reliability", category: "hardware", title: "Reliability planning assumptions (MTBF/MTTR)", keywords: ["mtbf", "mttr", "availability", "sla", "reliability", "nines"], data: { ...RELIABILITY, ispAvailability: ISP_AVAILABILITY, formula: "A = MTBF / (MTBF + MTTR); parallel: 1 - Π(1 - A_i); series: Π A_i" } },
  );
  for (const r of HARDENING_RULES) {
    entries.push({
      id: `hardening:${r.id}`,
      category: "hardening",
      title: r.title,
      keywords: [r.id, r.title, r.framework, r.nist, r.platform, "cis", "nist", "zero trust", "hardening", "security", "ssh", "acl"].map((s) => s.toLowerCase()),
      data: r,
    });
  }
  cachedEntries = entries;
  return entries;
}

export interface SpecLookupResult {
  query: string;
  matches: { id: string; category: SpecCategory; title: string; score: number; data: unknown }[];
}

export function lookupEngineeringSpec(query: string, category?: SpecCategory, limit = 5): SpecLookupResult {
  const q = query.toLowerCase().trim();
  const tokens = q.split(/[^a-z0-9.+-]+/).filter((t) => t.length >= 2);
  const scored = buildSpecEntries()
    .filter((e) => !category || e.category === category)
    .map((e) => {
      let score = 0;
      const title = e.title.toLowerCase();
      if (q && (title.includes(q) || e.id.toLowerCase().includes(q))) score += 10;
      for (const t of tokens) {
        if (title.includes(t)) score += 3;
        if (e.keywords.some((k) => k.includes(t))) score += 2;
        if (e.keywords.includes(t)) score += 4; // exact keyword hit outranks substring hits
      }
      return { e, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id))
    .slice(0, Math.max(1, Math.min(limit, 10)));
  return {
    query,
    matches: scored.map(({ e, score }) => ({ id: e.id, category: e.category, title: e.title, score, data: e.data })),
  };
}
