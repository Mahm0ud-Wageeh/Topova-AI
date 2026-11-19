export const ciscoProfiles = {
  "ios-gigabit": {
    label: "Cisco IOS · GigabitEthernet",
    routerUplink: "GigabitEthernet0/0",
    uplinks: ["GigabitEthernet0/1", "GigabitEthernet0/2"],
    accessPort: (index: number) => `GigabitEthernet1/0/${index}`,
  },
  "packet-tracer-2960": {
    label: "Packet Tracer · 2960 24-port",
    routerUplink: "GigabitEthernet0/0",
    uplinks: ["GigabitEthernet0/1", "GigabitEthernet0/2"],
    accessPort: (index: number) => `FastEthernet0/${index}`,
  },
} as const;
export type CiscoProfile = keyof typeof ciscoProfiles;
