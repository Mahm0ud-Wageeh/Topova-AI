import { formatAddress, parseAddress, parseCidr } from "./ipv4";
import { snapshotSchema, type BranchSnapshot } from "./snapshot";

type Interface = { name: string; commands: string[] };
const physical = /^(?:fastethernet|gigabitethernet|tengigabitethernet|ethernet)\d+(?:\/\d+){0,3}$/i;
const portId = (name: string) => `switch-${name.toLowerCase().replaceAll("/", "-")}`;
const descriptions = /^description(?:\s|$)/;
const has = (port: Interface, command: string) => port.commands.includes(command);

function readConfig(config: string) {
  const interfaces = new Map<string, Interface>();
  const global: string[] = [];
  let current: Interface | undefined;
  if (config.length > 96 * 1024) throw new Error("حجم ملف الإعدادات أكبر من 96 كيلوبايت.");
  for (const raw of config.split(/\r?\n/)) {
    const line = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!line) continue;
    if (line.startsWith("!")) { current = undefined; continue; }
    if (/^banner\s/.test(line)) throw new Error("احذف كتل banner من نسخة الملف قبل الاستيراد.");
    const header = /^interface (\S+)$/.exec(line);
    if (header && !/^\s/.test(raw)) {
      const name = header[1];
      if (interfaces.has(name)) throw new Error("في واجهة متكررة في الملف. استخدم نسخة واحدة من الإعدادات الحالية.");
      current = { name, commands: [] };
      interfaces.set(name, current);
    } else if (!/^\s/.test(raw)) {
      if (line.startsWith("interface ")) throw new Error("في تعريف واجهة خارج صيغة running-config المدعومة.");
      current = undefined;
      global.push(line);
    } else if (current) {
      current.commands.push(line);
    }
  }
  return { interfaces, global };
}

function vlanList(value: string) {
  if (value === "none") return [];
  const ids = new Set<number>();
  for (const part of value.split(",")) {
    const match = /^(\d{1,4})(?:-(\d{1,4}))?$/.exec(part.trim());
    const first = Number(match?.[1]);
    const last = Number(match?.[2] ?? first);
    if (!match || first < 1 || last > 4094 || first > last) {
      throw new Error("قائمة VLANs غير مدعومة. استخدم أرقامًا أو نطاقات، مثل 10,20-22.");
    }
    for (let id = first; id <= last; id++) ids.add(id);
  }
  return [...ids].sort((a, b) => a - b);
}

function ipv4Network(command: string) {
  const match = /^ip address (\S+) (\S+)$/.exec(command);
  if (!match) return null;
  const address = parseAddress(match[1]);
  const mask = parseAddress(match[2]);
  if (address === null || mask === null) return null;
  const size = 2 ** 32 - mask;
  if (!Number.isInteger(Math.log2(size))) return null;
  const cidr = `${formatAddress(Math.floor(address / size) * size)}/${32 - Math.log2(size)}`;
  return { cidr, gateway: match[1] };
}

export function importCiscoBranch(input: {
  routerConfig: string;
  switchConfig: string;
  routerPort: string;
  switchPort: string;
  sparePorts: string[];
  parentCidr: string;
}) {
  const router = readConfig(input.routerConfig);
  const networkSwitch = readConfig(input.switchConfig);
  const routerPort = router.interfaces.get(input.routerPort.trim().toLowerCase());
  const trunk = networkSwitch.interfaces.get(input.switchPort.trim().toLowerCase());
  if (!routerPort || !trunk || !physical.test(routerPort.name) || !physical.test(trunk.name)) {
    throw new Error("اكتب اسم واجهة الربط الفعلية كاملًا لكل جهاز كما هو موجود في الملف.");
  }
  if (has(routerPort, "shutdown") || has(trunk, "shutdown") || !has(trunk, "switchport mode trunk") ||
      trunk.commands.some((cmd) => /^(?:channel-group|no switchport$|switchport vlan mapping|switchport mode (?!trunk$)|switchport trunk encapsulation (?!dot1q$)|switchport trunk native vlan (?!1$))/.test(cmd)) ||
      networkSwitch.global.includes("vlan dot1q tag native")) {
    throw new Error("المسار المدعوم هو وصلة 802.1Q مباشرة ومفعّلة، بإعداد native VLAN الافتراضي.");
  }
  const allowed = trunk.commands.filter((cmd) => cmd.startsWith("switchport trunk allowed vlan "));
  if (allowed.length !== 1) throw new Error("حدد قائمة allowed VLAN صريحة واحدة على منفذ الـtrunk.");
  const vlanIds = vlanList(allowed[0].slice("switchport trunk allowed vlan ".length));
  if (vlanIds.length > 32) throw new Error("اللقطة تدعم 32 VLAN على وصلة الربط.");
  const reservedVlans = new Set([1, 1002, 1003, 1004, 1005]);
  for (const command of networkSwitch.global.filter((line) => /^vlan \d/.test(line))) {
    vlanList(command.slice(5)).forEach((id) => reservedVlans.add(id));
  }
  const subnets: BranchSnapshot["subnets"] = [];
  const parent = parseCidr(input.parentCidr.trim());
  if (!parent) throw new Error("اكتب مجال IPv4 الخاص بالفرع بصيغة CIDR.");
  for (const iface of router.interfaces.values()) {
    const addressCommands = iface.commands.filter((line) => line.startsWith("ip address "));
    if (!iface.name.startsWith(`${routerPort.name}.`)) {
      for (const command of addressCommands) {
        const network = ipv4Network(command.replace(/ secondary$/, ""));
        const block = network && parseCidr(network.cidr);
        if (block && block.start <= parent.end && block.end >= parent.start) {
          throw new Error("مجال الفرع بيتداخل مع شبكة على واجهة خارج وصلة الربط المختارة.");
        }
      }
      continue;
    }
    const encapsulation = iface.commands.filter((line) => line.startsWith("encapsulation "));
    const tag = /^encapsulation dot1q (\d{1,4})$/.exec(encapsulation[0] ?? "");
    const vlanId = Number(tag?.[1]);
    const address = addressCommands.length === 1 ? ipv4Network(addressCommands[0]) : null;
    if (encapsulation.length !== 1 || !tag || vlanId < 2 || vlanId > 4094 || (vlanId >= 1002 && vlanId <= 1005) || !address ||
        has(iface, "shutdown") || iface.commands.some((line) => /^(?:vrf forwarding|ip vrf forwarding|bridge-group|xconnect)(?:\s|$)/.test(line))) {
      throw new Error("واجهات الراوتر الفرعية لازم تستخدم وسم dot1Q عادي وعنوان IPv4 واحد وتكون مفعّلة.");
    }
    reservedVlans.add(vlanId);
    subnets.push({ ...address, vlanId, segmentId: `vlan-${vlanId}`, label: `VLAN ${vlanId}` });
  }
  if (!subnets.length) throw new Error("الملف ما فيهوش واجهات VLAN فرعية للوصلة المختارة.");
  for (const iface of networkSwitch.interfaces.values()) {
    if (!/^vlan\d+$/.test(iface.name)) continue;
    for (const command of iface.commands.filter((line) => line.startsWith("ip address "))) {
      const network = ipv4Network(command.replace(/ secondary$/, ""));
      const block = network && parseCidr(network.cidr);
      if (network && block && block.start <= parent.end && block.end >= parent.start &&
          !subnets.some((subnet) => subnet.cidr === network.cidr && subnet.vlanId === Number(iface.name.slice(4)))) {
        throw new Error("مجال الفرع بيتداخل مع واجهة VLAN على السويتش خارج الشبكات المستوردة.");
      }
    }
  }

  const switchInterfaces = [{ id: portId(trunk.name), label: trunk.name }];
  const access: BranchSnapshot["access"] = [];
  const spare = new Set(input.sparePorts.map((name) => name.trim().toLowerCase()).filter(Boolean));
  for (const iface of networkSwitch.interfaces.values()) {
    if (!physical.test(iface.name) || iface === trunk) continue;
    const assignments = iface.commands.filter((line) => /^switchport (?:access|voice) vlan /.test(line));
    for (const command of assignments) {
      const id = Number(command.split(" ").at(-1));
      if (Number.isInteger(id) && id >= 1 && id <= 4094) reservedVlans.add(id);
    }
    for (const command of iface.commands.filter((line) => line.startsWith("switchport trunk allowed vlan "))) {
      const rawList = command.slice("switchport trunk allowed vlan ".length).replace(/^(?:add|remove|except)\s+/, "");
      if (rawList !== "all" && rawList !== "none") {
        try { vlanList(rawList).forEach((id) => reservedVlans.add(id)); } catch { /* Non-standard trunk syntax ignored here. */ }
      }
    }
    if (spare.has(iface.name)) {
      if (!has(iface, "shutdown") || iface.commands.some((cmd) =>
        !["shutdown", "switchport", "switchport mode access"].includes(cmd) && !descriptions.test(cmd))) continue;
      switchInterfaces.push({ id: portId(iface.name), label: iface.name });
      spare.delete(iface.name);
      continue;
    }
    if (!has(iface, "switchport mode access") || has(iface, "shutdown") || assignments.length !== 1 ||
        iface.commands.some((cmd) => /^(?:channel-group|no switchport$|switchport vlan mapping|switchport mode (?!access$))/.test(cmd))) continue;
    const assigned = /^switchport access vlan (\d{1,4})$/.exec(assignments[0]);
    const subnet = subnets.find(({ vlanId }) => vlanId === Number(assigned?.[1]));
    if (!subnet) continue;
    switchInterfaces.push({ id: portId(iface.name), label: iface.name });
    access.push({ interfaceId: portId(iface.name), segmentId: subnet.segmentId });
  }
  if (spare.size) throw new Error("المنافذ الاحتياطية لازم تكون مكتوبة بالاسم الكامل، ومقفولة بـshutdown، ومن غير تعيين VLAN.");
  const snapshot = snapshotSchema.safeParse({
    format: "nettopo-branch-snapshot", schemaVersion: 1, parentCidr: input.parentCidr.trim(),
    topology: {
      schemaVersion: 1,
      devices: [
        { id: "router", kind: "router", interfaces: [{ id: "router-uplink", label: routerPort.name }] },
        { id: "switch", kind: "switch", interfaces: switchInterfaces },
      ],
      links: [{ id: "router-trunk", fromInterfaceId: "router-uplink", toInterfaceId: portId(trunk.name) }],
    },
    subnets, access, reservedVlans: [...reservedVlans].sort((a, b) => a - b),
    tagging: [{ linkId: "router-trunk", vlanIds }],
  });
  if (!snapshot.success) throw new Error("العناوين متداخلة أو خارج مجال الفرع، أو عدد الواجهات أو الشبكات أعلى من الحد المدعوم.");
  return { snapshot: snapshot.data, accessCount: access.length, spareCount: switchInterfaces.length - access.length - 1 };
}
