import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { planBranch } from "@/lib/design/branch";
import { formatAddress, parseCidr } from "@/lib/design/ipv4";
import { ciscoProfiles, type CiscoProfile } from "@/lib/design/cisco-profiles";
import { createSnapshot } from "@/lib/design/snapshot";
import type { BranchAlternative, BranchRequest } from "@/lib/design/schema";

export class CiscoExportError extends Error {}

export function createCiscoPackage(input: BranchRequest, alternativeId: BranchAlternative["id"], profileId: CiscoProfile) {
  const plan = planBranch(input);
  const option = plan.alternatives.find((item) => item.id === alternativeId);
  if (!option?.feasible) throw new CiscoExportError("The selected topology is infeasible.");
  if (profileId === "packet-tracer-2960" && input.portsPerSwitch !== 24) {
    throw new CiscoExportError("The Packet Tracer 2960 profile uses the 24-port planner setting.");
  }
  if (input.segments.some(({ vlanId }) => vlanId === 1 || (vlanId >= 1002 && vlanId <= 1005))) {
    throw new CiscoExportError("Choose VLAN IDs outside the native and legacy reserved ranges (1 and 1002–1005).");
  }
  const profile = ciscoProfiles[profileId];
  const snapshot = createSnapshot(plan, option);
  const addressById = new Map(snapshot.subnets.map((subnet) => [subnet.segmentId, subnet]));
  const accessByInterface = new Map(snapshot.access.map((access) => [access.interfaceId, access.segmentId]));
  const trunkIds = new Set(snapshot.topology.links.flatMap((link) => [link.fromInterfaceId, link.toInterfaceId]));
  const vlans = [...snapshot.subnets].sort((a, b) => a.vlanId - b.vlanId);
  const tags = vlans.map((subnet) => subnet.vlanId).join(",");
  const files: Record<string, string> = {};
  const interfaceMap = new Map<string, { device: string; port: string }>();
  for (const device of snapshot.topology.devices) {
    const lines = [`! NetTopo AI | ${profileId}`, "! Lab baseline. Verify interface names against the wiring map.",
      `hostname ${device.id.toUpperCase()}`, "!"];
    if (device.kind === "router") {
      interfaceMap.set(device.interfaces[0].id, { device: device.id, port: profile.routerUplink });
      lines.push(`interface ${profile.routerUplink}`, " no ip address", " no shutdown", "!");
      for (const subnet of vlans) {
        const mask = formatAddress(2 ** 32 - parseCidr(subnet.cidr)!.size);
        lines.push(`interface ${profile.routerUplink}.${subnet.vlanId}`, ` encapsulation dot1Q ${subnet.vlanId}`,
          ` ip address ${subnet.gateway} ${mask}`, " no shutdown", "!");
      }
    } else {
      for (const subnet of vlans) lines.push(`vlan ${subnet.vlanId}`, ` name VLAN_${subnet.vlanId}`, "!");
      const trunks = device.interfaces.filter((iface) => trunkIds.has(iface.id));
      trunks.forEach((iface, index) => {
        const port = profile.uplinks[index];
        interfaceMap.set(iface.id, { device: device.id, port });
        lines.push(`interface ${port}`, " switchport mode trunk", ` switchport trunk allowed vlan ${tags}`, " no shutdown", "!");
      });
      let portIndex = 0;
      for (const iface of device.interfaces) {
        const segmentId = accessByInterface.get(iface.id);
        if (!segmentId) continue;
        const port = profile.accessPort(++portIndex);
        interfaceMap.set(iface.id, { device: device.id, port });
        const { vlanId } = addressById.get(segmentId)!;
        lines.push(`interface ${port}`, " switchport mode access", ` switchport access vlan ${vlanId}`, " no shutdown", "!");
      }
    }
    files[`configs/${device.id}.cfg`] = [...lines, "end", ""].join("\n");
  }
  files["wiring.csv"] = ["from_device,from_port,to_device,to_port", ...snapshot.topology.links.map((link) => {
    const from = interfaceMap.get(link.fromInterfaceId)!;
    const to = interfaceMap.get(link.toInterfaceId)!;
    return [from.device, from.port, to.device, to.port].join(",");
  })].join("\n") + "\n";
  files["access-ports.csv"] = ["device,physical_port,logical_port,vlan", ...snapshot.access.map((item) => {
    const mapped = interfaceMap.get(item.interfaceId)!;
    return [mapped.device, mapped.port, item.interfaceId, addressById.get(item.segmentId)!.vlanId].join(",");
  })].join("\n") + "\n";
  files["address-plan.csv"] = ["vlan,cidr,gateway,first_usable,last_usable,spare_addresses",
    ...plan.addresses.map((row) => [addressById.get(row.segmentId)!.vlanId, row.cidr, row.gateway,
      row.firstEndpoint, row.lastEndpoint, row.spareAddresses].join(","))].join("\n") + "\n";
  files["snapshot.json"] = JSON.stringify(snapshot, null, 2) + "\n";
  files["README.txt"] = [
    "NetTopo AI - Cisco Branch Design", "",
    `Profile: ${profile.label}`, `Alternative: ${alternativeId}`, "",
    "1. Confirm the device images and physical port names against wiring.csv.",
    "2. Assemble the lab topology using the trunk links and access port map.",
    "3. Apply each lab configuration in configuration mode. Set endpoint addresses from address-plan.csv.",
    "4. Verify VLAN membership, trunk tags, interface status, and gateway reachability in the lab.",
    "Scope: access VLANs and inter-VLAN routing. Live connectivity and access policies require independent verification.",
  ].join("\n") + "\n";
  files["manifest.json"] = JSON.stringify({
    format: "nettopo-cisco-export", schemaVersion: 1, profileId, alternativeId, evidence: "generated-lab-template",
    files: Object.entries(files).map(([name, content]) => ({
      name, sha256: createHash("sha256").update(content).digest("hex"),
    })),
  }, null, 2) + "\n";
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, contents]) => [name, strToU8(contents)])),
    { level: 6, mtime: new Date(2020, 0, 1) });
}
