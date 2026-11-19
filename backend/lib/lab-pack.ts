import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { auditSecurityResilience } from "@/lib/network-engine/auditor";
import { estimateBomAndPoe } from "@/lib/network-engine/bom";
import {
  generateCiscoCmlYaml,
  generateGns3Project,
  generatePacketTracerBundle,
} from "@/lib/network-engine/cisco-formats";
import { generateMultiVendorConfigs } from "@/lib/network-engine/multi-vendor";
import type { AclRule, BuiltTopology, NetworkPlan } from "@/lib/network-engine/types";

function slugifyName(raw?: string): string {
  return (raw?.trim() || "nettopo-lab").replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").toLowerCase();
}

export function createPacketTracerZip(input: {
  name?: string;
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls?: AclRule[];
}) {
  const projectName = slugifyName(input.name);
  const acls = input.acls ?? [];
  const pt = generatePacketTracerBundle(input.topology, input.plan, acls, input.name?.trim() || projectName);
  const cmlYaml = generateCiscoCmlYaml(input.topology, input.plan, acls, input.name?.trim() || projectName);
  const gns3 = generateGns3Project(input.topology, input.plan, acls, input.name?.trim() || projectName);

  const files: Record<string, string> = {
    "packet-tracer-build-guide.html": pt.guideHtml,
    "cabling-matrix.csv": pt.cablingCsv,
    ...pt.startupConfigs,
    ...pt.pasteScripts,
    [`cisco-cml/${projectName}.yaml`]: cmlYaml,
    [`gns3/${projectName}.gns3`]: gns3.projectJson,
    "README-CISCO.txt": [
      `NetTopo AI 2.0 — Cisco Ready Lab Bundle (${projectName})`,
      "",
      "1. CISCO PACKET TRACER 8.x:",
      "   - Open packet-tracer-build-guide.html in your browser for the exact device models, port-to-port wiring, and 1-click Copy CLI buttons.",
      "   - Load configs/*-startup.cfg directly via Device -> Config -> Load (NVRAM) OR paste cli-paste/*-paste.txt into each device's CLI tab.",
      "",
      "2. CISCO MODELING LABS (CML 2.x) — DIRECT FULL TOPOLOGY IMPORT:",
      `   - Import cisco-cml/${projectName}.yaml directly via CML Workbench -> Import Lab.`,
      "   - All nodes, interfaces, coordinates, links, and IOSv/IOSvL2 startup configs load immediately and are 100% editable.",
      "",
      "3. GNS3 (v2.2+) — DIRECT FULL TOPOLOGY OPEN:",
      `   - Open gns3/${projectName}.gns3 directly in GNS3 (File -> Open Project).`,
    ].join("\n") + "\n",
  };

  for (const [k, v] of Object.entries(gns3.startupConfigs)) {
    files[`gns3/${k}`] = v;
  }

  const zip = zipSync(
    Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, strToU8(contents)])),
    { level: 6, mtime: new Date(2026, 0, 1) },
  );

  return { filename: `${projectName}-cisco-packet-tracer-pack.zip`, zip };
}

export function createMultiVendorLabPack(input: {
  name?: string;
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls?: AclRule[];
}) {
  const projectName = slugifyName(input.name);
  const displayName = input.name?.trim() || projectName;
  const acls = input.acls ?? [];
  const multi = generateMultiVendorConfigs(input.topology, input.plan, acls);
  const audit = auditSecurityResilience(input.topology, input.plan, acls);
  const bom = estimateBomAndPoe(input.topology, input.plan);
  const cmlYaml = generateCiscoCmlYaml(input.topology, input.plan, acls, displayName);
  const gns3 = generateGns3Project(input.topology, input.plan, acls, displayName);
  const pt = generatePacketTracerBundle(input.topology, input.plan, acls, displayName);

  const files: Record<string, string> = {};
  files["cisco/combined-ios.cfg"] = multi.cisco.combined;
  for (const cfg of multi.cisco.configs) {
    files[`cisco/${cfg.hostname.toLowerCase()}.cfg`] = cfg.cli + "\n";
  }

  // Real Cisco-openable & editable topology files
  files[`cisco-cml/${projectName}.yaml`] = cmlYaml;
  files[`gns3/${projectName}.gns3`] = gns3.projectJson;
  for (const [k, v] of Object.entries(gns3.startupConfigs)) {
    files[`gns3/${k}`] = v;
  }
  files["packet-tracer/packet-tracer-build-guide.html"] = pt.guideHtml;
  files["packet-tracer/cabling-matrix.csv"] = pt.cablingCsv;
  for (const [k, v] of Object.entries(pt.startupConfigs)) {
    files[`packet-tracer/${k}`] = v;
  }
  for (const [k, v] of Object.entries(pt.pasteScripts)) {
    files[`packet-tracer/${k}`] = v;
  }

  files["mikrotik/routeros-v7.rsc"] = multi.mikrotik;
  files["juniper/junos-set.conf"] = multi.junos;
  files["ansible/hosts.yml"] = multi.ansibleInventory;

  files["reports/wiring-plan.csv"] = pt.cablingCsv;
  files["reports/address-plan.csv"] = [
    "segment,cidr,mask,range",
    ...input.plan.ipPlan.subnets.map((s) =>
      [`"${s.name}"`, s.cidr, s.mask, `"${s.range}"`].join(","),
    ),
  ].join("\n") + "\n";

  files["reports/bom-enterprise.csv"] = bom.csv + "\n";
  files["reports/security-audit.json"] = JSON.stringify(audit, null, 2) + "\n";
  files["snapshot.json"] = JSON.stringify(
    {
      format: "nettopo-studio-snapshot",
      schemaVersion: 2,
      name: projectName,
      topology: input.topology,
      network_plan: input.plan,
      acls,
    },
    null,
    2,
  ) + "\n";

  files["README.txt"] = [
    `NetTopo AI 2.0 - Multi-Vendor & Cisco Native Lab Package (${projectName})`,
    "",
    `Security & Resilience Score: ${audit.overallScore}/100 (Grade ${audit.grade})`,
    `PoE Budget: ${bom.poe.requiredWatts}W / ${bom.poe.availableWatts}W (${bom.poe.utilizationPercent}%)`,
    "",
    "Contents:",
    `  cisco-cml/${projectName}.yaml   - Direct import in Cisco Modeling Labs (CML 2.x) with full editable topology + IOS configs`,
    `  gns3/${projectName}.gns3        - Direct open in GNS3 v2.2+ with full topology + configs/`,
    "  packet-tracer/                  - Packet Tracer 8.x startup .cfg files, paste CLI scripts, cabling CSV & interactive HTML build guide",
    "  cisco/                          - Per-device Cisco IOS configs + combined-ios.cfg with Zero-Trust ACLs",
    "  mikrotik/                       - MikroTik RouterOS v7 script",
    "  juniper/                        - Juniper Junos OS set-commands",
    "  ansible/                        - Ansible automation inventory YAML",
    "  reports/                        - Wiring plan CSV, IP address plan CSV, Enterprise BOM CSV, Security Audit JSON",
    "  snapshot.json                   - Full NetTopo Studio snapshot for re-import",
    "  manifest.json                   - SHA-256 integrity checksums for every file",
  ].join("\n") + "\n";

  files["manifest.json"] = JSON.stringify(
    {
      format: "nettopo-multivendor-lab-pack",
      schemaVersion: 3,
      projectName,
      files: Object.entries(files).map(([name, content]) => ({
        name,
        sha256: createHash("sha256").update(content).digest("hex"),
      })),
    },
    null,
    2,
  ) + "\n";

  const zip = zipSync(
    Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, strToU8(contents)])),
    { level: 6, mtime: new Date(2026, 0, 1) },
  );

  return { filename: `${projectName}-lab-pack.zip`, zip };
}
