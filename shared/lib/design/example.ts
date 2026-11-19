import type { BranchRequest } from "./schema";

export const branchExample: BranchRequest = {
  schemaVersion: 1, parentCidr: "10.50.0.0/24", portsPerSwitch: 24,
  segments: [
    { id: "staff", label: "الموظفون", vlanId: 10, endpointAddresses: 12, accessPorts: 12 },
    { id: "servers", label: "الخوادم", vlanId: 20, endpointAddresses: 4, accessPorts: 4 },
    { id: "management", label: "الإدارة", vlanId: 99, endpointAddresses: 1, accessPorts: 0, minimumPrefix: 29 },
  ],
};
