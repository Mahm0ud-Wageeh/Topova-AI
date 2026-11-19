export const ciscoExample = {
  parentCidr: "10.50.0.0/24",
  routerPort: "GigabitEthernet0/0",
  switchPort: "GigabitEthernet0/24",
  sparePorts: [17, 18, 19, 20].map((port) => `GigabitEthernet0/${port}`),
  routerConfig: [
    "hostname BranchRouter",
    "interface GigabitEthernet0/0",
    " no ip address",
    "!",
    ...[ [10, "10.50.0.1", "255.255.255.240"], [20, "10.50.0.17", "255.255.255.248"] ]
      .flatMap(([tag, ip, mask]) => [
        `interface GigabitEthernet0/0.${tag}`, ` encapsulation dot1Q ${tag}`, ` ip address ${ip} ${mask}`, "!",
      ]),
    "end",
  ].join("\n"),
  switchConfig: [
    "hostname BranchSwitch",
    "vlan 10,20,70",
    "!",
    ...Array.from({ length: 16 }, (_, index) => [
      `interface GigabitEthernet0/${index + 1}`, " switchport mode access",
      ` switchport access vlan ${index < 12 ? 10 : 20}`, "!",
    ]).flat(),
    ...[17, 18, 19, 20].flatMap((port) => [`interface GigabitEthernet0/${port}`, " shutdown", "!"]),
    "interface GigabitEthernet0/24",
    " switchport mode trunk",
    " switchport trunk allowed vlan 1,10,20",
    "!",
    "end",
  ].join("\n"),
};
