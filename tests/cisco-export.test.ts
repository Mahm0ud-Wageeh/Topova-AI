// @vitest-environment node
import { createHash } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { POST } from "./api-harness";
import { branchExample } from "@/lib/design/example";
import { importCiscoBranch } from "@/lib/design/cisco-import";

const request = (data: unknown) => new Request("http://localhost/api/v1/cisco-exports", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
});
const packetTracer = { input: branchExample, alternativeId: "single-switch", profile: "packet-tracer-2960" };

describe("Cisco ZIP export", () => {
  it("packages matching device configs, wire map and verified file checksums", async () => {
    const response = await POST(request(packetTracer));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
    const router = strFromU8(archive["configs/r1.cfg"]);
    const sw = strFromU8(archive["configs/sw1.cfg"]);
    expect(router).toContain("ip address 10.50.0.1 255.255.255.240");
    expect(sw).toContain("interface FastEthernet0/16");
    expect(strFromU8(archive["wiring.csv"])).toContain("r1,GigabitEthernet0/0,sw1,GigabitEthernet0/1");
    const imported = importCiscoBranch({ routerConfig: router, switchConfig: sw, routerPort: "GigabitEthernet0/0",
      switchPort: "GigabitEthernet0/1", parentCidr: branchExample.parentCidr, sparePorts: [] });
    expect(imported.accessCount).toBe(16);
    expect(imported.snapshot.tagging[0].vlanIds).toEqual([10, 20, 99]);
    const manifest = JSON.parse(strFromU8(archive["manifest.json"]));
    for (const { name, sha256 } of manifest.files) {
      expect(createHash("sha256").update(archive[name]).digest("hex")).toBe(sha256);
    }
  });

  it("blocks infeasible or incompatible exports", async () => {
    const incompatible = await POST(request({ ...packetTracer, input: { ...branchExample, portsPerSwitch: 48 } }));
    expect(incompatible.status).toBe(422);
    expect(await incompatible.json()).toMatchObject({ error: { code: "CISCO_PROFILE_MISMATCH" } });
    const impossible = await POST(request({ ...packetTracer, input: { ...branchExample,
      segments: [{ ...branchExample.segments[0], endpointAddresses: 24, accessPorts: 24 }] } }));
    expect(impossible.status).toBe(422);
  });

  it("returns a browser transport containing a complete ZIP", async () => {
    const source = request(packetTracer);
    source.headers.set("accept", "application/json");
    const response = await POST(source);
    expect(response.status).toBe(200);
    const envelope = await response.json();
    expect(envelope).toMatchObject({ encoding: "base64", filename: "nettopo-single-switch-packet-tracer-2960.zip" });
    const contents = unzipSync(Buffer.from(envelope.archive, "base64"));
    expect(contents["configs/sw1.cfg"].length).toBeGreaterThan(0);
  });
});
