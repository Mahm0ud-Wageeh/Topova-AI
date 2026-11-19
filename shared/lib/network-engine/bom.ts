import type { BuiltTopology, DeviceType, NetworkPlan } from "@/lib/network-engine/types";

export type CostTierId = "budget" | "enterprise" | "high-availability";

export interface BomLineItem {
  category: string;
  sku: string;
  description: string;
  quantity: number;
  unitPriceUsd: number;
  totalUsd: number;
  rackUnits: number;
  poeWatts: number;
}

export interface CostTierEstimate {
  id: CostTierId;
  label: string;
  summary: string;
  totalUsd: number;
  rackUnits: number;
  items: BomLineItem[];
}

export interface PoeBudgetSummary {
  requiredWatts: number;
  availableWatts: number;
  utilizationPercent: number;
  overloaded: boolean;
  breakdown: { type: DeviceType; count: number; wattsEach: number; totalWatts: number }[];
}

export interface BomEstimateReport {
  poe: PoeBudgetSummary;
  tiers: CostTierEstimate[];
  csv: string;
}

const POE_WATTS: Partial<Record<DeviceType, number>> = {
  AP: 25.5,       // 802.3at PoE+
  CAMERA: 12.95,  // 802.3af PoE
  IP_PHONE: 7.0,  // 802.3af Class 2
};

interface TierCatalog {
  label: string;
  summary: string;
  multiplier: number;
  router: { sku: string; desc: string; price: number; ru: number };
  switch24: { sku: string; desc: string; price: number; ru: number; poeBudget: number };
  firewall: { sku: string; desc: string; price: number; ru: number };
  ap: { sku: string; desc: string; price: number };
  camera: { sku: string; desc: string; price: number };
  phone: { sku: string; desc: string; price: number };
  sfpPrice: number;
  cablePrice: number;
}

const CATALOG: Record<CostTierId, TierCatalog> = {
  budget: {
    label: "Budget / Lab",
    summary: "Cost-optimized SMB hardware suitable for labs and small branches.",
    multiplier: 1,
    router: { sku: "MikroTik RB5009UG+S+IN", desc: "Gigabit + 10G SFP+ Branch Router", price: 219, ru: 1 },
    switch24: { sku: "CBS250-24P-4G", desc: "24-Port Gigabit PoE+ Smart Switch (195W)", price: 460, ru: 1, poeBudget: 195 },
    firewall: { sku: "Netgate 4200", desc: "pfSense+ Edge Security Gateway", price: 549, ru: 1 },
    ap: { sku: "U6-Plus", desc: "Wi-Fi 6 Dual-Band Access Point", price: 129 },
    camera: { sku: "G5-Bullet", desc: "2K PoE Security Camera", price: 129 },
    phone: { sku: "GRP2612P", desc: "PoE VoIP Desk Phone", price: 65 },
    sfpPrice: 28,
    cablePrice: 8,
  },
  enterprise: {
    label: "Enterprise Standard",
    summary: "Production Cisco Catalyst & FortiGate hardware with full PoE+ headroom.",
    multiplier: 1,
    router: { sku: "Cisco ISR 1100-4G", desc: "Enterprise IOS-XE Branch Router", price: 1050, ru: 1 },
    switch24: { sku: "Cisco C9200L-24P-4G", desc: "24-Port Catalyst PoE+ Switch (370W)", price: 1850, ru: 1, poeBudget: 370 },
    firewall: { sku: "FortiGate 60F", desc: "NGFW Threat Protection Appliance", price: 950, ru: 1 },
    ap: { sku: "Cisco CW9162I", desc: "Wi-Fi 6E Enterprise Access Point", price: 520 },
    camera: { sku: "Axis M2035-LE", desc: "Enterprise PoE Bullet Camera", price: 320 },
    phone: { sku: "Cisco CP-8841", desc: "Enterprise Gigabit PoE IP Phone", price: 240 },
    sfpPrice: 85,
    cablePrice: 12,
  },
  "high-availability": {
    label: "High-Availability Core",
    summary: "Redundant dual-router/firewall HA pair + 740W PoE+ switches for 99.99% uptime.",
    multiplier: 1,
    router: { sku: "Cisco C8300-1N1S-4T2X", desc: "10G Catalyst Edge Router (HA Ready)", price: 3400, ru: 1 },
    switch24: { sku: "Cisco C9300-24P-A", desc: "24-Port Stackable PoE+ Switch (715W)", price: 3900, ru: 1, poeBudget: 715 },
    firewall: { sku: "FortiGate 100F HA", desc: "High-Availability NGFW Appliance", price: 2400, ru: 1 },
    ap: { sku: "Cisco CW9166I", desc: "Tri-Band Wi-Fi 6E High-Density AP", price: 890 },
    camera: { sku: "Axis P1465-LE", desc: "4K Low-Light PoE Camera", price: 590 },
    phone: { sku: "Cisco CP-8865", desc: "Video-Capable PoE IP Phone", price: 390 },
    sfpPrice: 160,
    cablePrice: 16,
  },
};

export function estimateBomAndPoe(topology: BuiltTopology, _plan?: NetworkPlan): BomEstimateReport {
  const countOf = (type: DeviceType) => topology.devices.filter((d) => d.type === type).length;
  const routers = countOf("ROUTER");
  const switches = countOf("SWITCH");
  const firewalls = countOf("FIREWALL");
  const aps = countOf("AP");
  const cameras = countOf("CAMERA");
  const phones = countOf("IP_PHONE");
  const fiberLinks = topology.connections.filter((c) => c.meta?.cableType === "Fiber").length;
  const copperLinks = Math.max(0, topology.connections.length - fiberLinks);

  // PoE Power Budget calculation (against Enterprise 370W PoE+ baseline per switch)
  const breakdown: PoeBudgetSummary["breakdown"] = (["AP", "CAMERA", "IP_PHONE"] as DeviceType[])
    .map((type) => {
      const count = countOf(type);
      const wattsEach = POE_WATTS[type] ?? 0;
      return { type, count, wattsEach, totalWatts: Number((count * wattsEach).toFixed(1)) };
    })
    .filter((b) => b.count > 0);

  const requiredWatts = Number(breakdown.reduce((sum, b) => sum + b.totalWatts, 0).toFixed(1));
  const availableWatts = Math.max(0, switches * CATALOG.enterprise.switch24.poeBudget);
  const utilizationPercent =
    requiredWatts === 0
      ? 0
      : availableWatts > 0
        ? Math.round((requiredWatts / availableWatts) * 100)
        : 100;
  const overloaded = requiredWatts > 0 && requiredWatts > availableWatts;

  const tiers: CostTierEstimate[] = (["budget", "enterprise", "high-availability"] as CostTierId[]).map(
    (tierId) => {
      const cat = CATALOG[tierId];
      const items: BomLineItem[] = [];
      const addItem = (
        category: string,
        sku: string,
        description: string,
        quantity: number,
        unitPriceUsd: number,
        rackUnits = 0,
        poeWatts = 0,
      ) => {
        if (quantity <= 0) return;
        items.push({
          category,
          sku,
          description,
          quantity,
          unitPriceUsd,
          totalUsd: quantity * unitPriceUsd,
          rackUnits: quantity * rackUnits,
          poeWatts: Number((quantity * poeWatts).toFixed(1)),
        });
      };

      const tierRouters = tierId === "high-availability" ? Math.max(routers, routers > 0 ? 2 : 0) : routers;
      const tierFirewalls =
        tierId === "high-availability" ? Math.max(firewalls, topology.devices.length > 2 ? 2 : firewalls) : firewalls;
      const tierSwitches =
        tierId === "high-availability" ? Math.max(switches, switches > 0 ? Math.max(2, switches) : 0) : switches;

      addItem("Routing", cat.router.sku, cat.router.desc, tierRouters, cat.router.price, cat.router.ru);
      addItem("Security", cat.firewall.sku, cat.firewall.desc, tierFirewalls, cat.firewall.price, cat.firewall.ru);
      addItem("Switching", cat.switch24.sku, cat.switch24.desc, tierSwitches, cat.switch24.price, cat.switch24.ru);
      addItem("Wireless", cat.ap.sku, cat.ap.desc, aps, cat.ap.price, 0, POE_WATTS.AP);
      addItem("Surveillance", cat.camera.sku, cat.camera.desc, cameras, cat.camera.price, 0, POE_WATTS.CAMERA);
      addItem("Voice", cat.phone.sku, cat.phone.desc, phones, cat.phone.price, 0, POE_WATTS.IP_PHONE);
      addItem("Optics", "SFP-10G-SR", "10GBASE-SR Optical Transceiver Pair", fiberLinks * 2, cat.sfpPrice);
      addItem("Cabling", "CAT6A-PATCH", "Cat6A Shielded Patch Cord (2m)", copperLinks, cat.cablePrice);

      const totalUsd = items.reduce((s, item) => s + item.totalUsd, 0);
      const rackUnits = items.reduce((s, item) => s + item.rackUnits, 0);
      return { id: tierId, label: cat.label, summary: cat.summary, totalUsd, rackUnits, items };
    },
  );

  const enterprise = tiers.find((t) => t.id === "enterprise")!;
  const csv = [
    "Category,SKU,Description,Quantity,Unit_USD,Total_USD,Rack_U,PoE_Watts",
    ...enterprise.items.map((i) =>
      [i.category, `"${i.sku}"`, `"${i.description}"`, i.quantity, i.unitPriceUsd, i.totalUsd, i.rackUnits, i.poeWatts].join(","),
    ),
  ].join("\n");

  return {
    poe: { requiredWatts, availableWatts, utilizationPercent, overloaded, breakdown },
    tiers,
    csv,
  };
}
