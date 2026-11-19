// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assignDevicePorts,
  buildTopology,
  generateCiscoCmlYaml,
  generateGns3Project,
  generatePacketTracerBundle,
  generateZeroTrustAcls,
  planNetwork,
} from "@/lib/network-engine";

function sampleCampus() {
  const topology = buildTopology({
    devices: [
      { type: "ROUTER", count: 2 },
      { type: "FIREWALL", count: 1 },
      { type: "SWITCH", count: 2 },
      { type: "SERVER", count: 1 },
      { type: "PC", count: 3 },
      { type: "CAMERA", count: 2 },
    ],
    options: { vlan: true, routingProtocol: "OSPF" },
  });
  const plan = planNetwork(topology, undefined, { vlan: true, routingProtocol: "OSPF" });
  const acls = generateZeroTrustAcls(plan);
  return { topology, plan, acls };
}

describe("Real Cisco-Openable Export Formats (CML 2.x, GNS3, Packet Tracer 8.x)", () => {
  it("allocates collision-free Cisco interface names for every link", () => {
    const { topology } = sampleCampus();
    const ports = assignDevicePorts(topology);
    expect(ports).toHaveLength(topology.connections.length);

    const used = new Set<string>();
    for (const p of ports) {
      const k1 = `${p.fromId}:${p.fromPort}`;
      const k2 = `${p.toId}:${p.toPort}`;
      expect(used.has(k1)).toBe(false);
      expect(used.has(k2)).toBe(false);
      used.add(k1);
      used.add(k2);
    }
  });

  it("generates a valid Cisco Modeling Labs (CML 2.x) .yaml with embedded IOS startup configs", () => {
    const { topology, plan, acls } = sampleCampus();
    const yaml = generateCiscoCmlYaml(topology, plan, acls, "Campus Core");

    expect(yaml).toContain("lab:");
    expect(yaml).toContain("version: 0.2.2");
    expect(yaml).toContain("title: \"Campus Core\"");
    expect(yaml).toContain("node_definition: iosv");
    expect(yaml).toContain("node_definition: iosvl2");
    expect(yaml).toContain("links:");
    expect(yaml).toContain("hostname R1");
    expect(yaml).toContain("router ospf 1");
    expect(yaml).not.toContain("configure terminal");
  });

  it("generates a valid GNS3 v2.2 .gns3 project JSON and startup configs", () => {
    const { topology, plan, acls } = sampleCampus();
    const gns3 = generateGns3Project(topology, plan, acls, "Campus Core");
    const parsed = JSON.parse(gns3.projectJson);

    expect(parsed.version).toBe("2.2.49");
    expect(parsed.type).toBe("topology");
    expect(parsed.topology.nodes).toHaveLength(topology.devices.length);
    expect(parsed.topology.links).toHaveLength(topology.connections.length);
    expect(parsed.topology.nodes.some((n: { node_type: string }) => n.node_type === "dynamips")).toBe(true);
    expect(parsed.topology.nodes.some((n: { node_type: string }) => n.node_type === "ethernet_switch")).toBe(true);
    expect(gns3.startupConfigs["configs/r1.cfg"]).toContain("hostname R1");
    expect(gns3.startupConfigs["configs/pc1.vpc"]).toContain("set pcname PC1");
  });

  it("generates a Packet Tracer 8.x bundle with HTML build guide, CSV cabling, and startup .cfg files", () => {
    const { topology, plan, acls } = sampleCampus();
    const pt = generatePacketTracerBundle(topology, plan, acls, "Campus Core");

    expect(pt.guideHtml).toContain("Cisco Packet Tracer 8.x Ready Guide");
    expect(pt.guideHtml).toContain("ISR 4331 / 2911 Router");
    expect(pt.guideHtml).toContain("Catalyst 2960-24TT Switch");
    expect(pt.cablingCsv).toContain("link_id,from_device,from_port,to_device,to_port,packet_tracer_cable");
    expect(pt.startupConfigs["configs/r1-startup.cfg"]).toContain("hostname R1");
    expect(pt.pasteScripts["cli-paste/r1-paste.txt"]).toContain("configure terminal");
  });
});
