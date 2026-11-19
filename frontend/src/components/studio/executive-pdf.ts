import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import type { SecurityAuditReport } from "@/lib/network-engine/auditor";
import type { BomEstimateReport } from "@/lib/network-engine/bom";
import type { BuiltTopology, NetworkPlan } from "@/lib/network-engine/types";

export async function exportExecutivePdfReport(params: {
  projectName: string;
  topology: BuiltTopology;
  plan: NetworkPlan;
  audit: SecurityAuditReport;
  bom: BomEstimateReport;
}) {
  const { projectName, topology, plan, audit, bom } = params;
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  let y = 44;

  // Header Banner
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, pageWidth, 88, "F");
  pdf.setTextColor(56, 189, 248);
  pdf.setFontSize(10);
  pdf.text("NETTOPO AI 2.0 — EXECUTIVE NETWORK ENGINEERING REPORT", 36, 30);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(20);
  pdf.text(projectName, 36, 56);
  pdf.setFontSize(9);
  pdf.setTextColor(148, 163, 184);
  pdf.text(`Generated: ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`, 36, 74);

  y = 112;
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(13);
  pdf.text("1. Executive Architecture Summary", 36, y);
  y += 18;
  pdf.setFontSize(10);
  const enterprise = bom.tiers.find((t) => t.id === "enterprise");
  const summaryLines = [
    `Devices: ${topology.devices.length}   |   Links: ${topology.connections.length}   |   VLANs: ${plan.vlanPlan.length || "Flat"}   |   Routing: ${plan.routing.protocol}`,
    `Security & Resilience Score: ${audit.overallScore}/100 (Grade ${audit.grade})`,
    `PoE Power Budget: ${bom.poe.requiredWatts}W required / ${bom.poe.availableWatts}W available (${bom.poe.utilizationPercent}%)`,
    `Estimated Enterprise Hardware CapEx: $${enterprise?.totalUsd.toLocaleString() ?? 0} (${enterprise?.rackUnits ?? 0}U Rack Space)`,
  ];
  for (const line of summaryLines) {
    pdf.text(line, 36, y);
    y += 15;
  }

  // Capture live React Flow Canvas screenshot if mounted
  const canvasEl = document.querySelector<HTMLElement>(".react-flow");
  if (canvasEl) {
    try {
      const dataUrl = await toPng(canvasEl, { backgroundColor: "#0f172a", pixelRatio: 1.5 });
      y += 6;
      pdf.setFontSize(13);
      pdf.text("2. Logical Topology Diagram", 36, y);
      y += 10;
      const imgWidth = pageWidth - 72;
      const imgHeight = 210;
      pdf.addImage(dataUrl, "PNG", 36, y, imgWidth, imgHeight);
      y += imgHeight + 22;
    } catch {
      // Canvas image optional if user is on another tab
    }
  }

  // Security Pillars
  if (y > 680) {
    pdf.addPage();
    y = 48;
  }
  pdf.setFontSize(13);
  pdf.text("3. Zero-Trust Security & Resilience Breakdown", 36, y);
  y += 18;
  pdf.setFontSize(10);
  for (const pillar of audit.pillars) {
    pdf.text(`• ${pillar.label}: ${pillar.score}/${pillar.maxScore} — ${pillar.detail}`, 42, y);
    y += 15;
  }

  // IP & VLAN Plan
  y += 10;
  if (y > 660) {
    pdf.addPage();
    y = 48;
  }
  pdf.setFontSize(13);
  pdf.text("4. IPv4 & VLAN Allocation Plan", 36, y);
  y += 18;
  pdf.setFontSize(9);
  for (const sub of plan.ipPlan.subnets) {
    if (y > 760) {
      pdf.addPage();
      y = 48;
    }
    pdf.text(`${sub.name.padEnd(24)} ${sub.cidr.padEnd(18)} ${sub.mask.padEnd(16)} ${sub.range}`, 40, y);
    y += 13;
  }

  // Enterprise BOM
  y += 12;
  if (y > 660) {
    pdf.addPage();
    y = 48;
  }
  pdf.setFontSize(13);
  pdf.text("5. Bill of Materials (Enterprise Standard)", 36, y);
  y += 18;
  pdf.setFontSize(9);
  for (const item of enterprise?.items ?? []) {
    if (y > 760) {
      pdf.addPage();
      y = 48;
    }
    pdf.text(`${item.quantity}x ${item.sku} (${item.category}) — $${item.totalUsd.toLocaleString()}`, 40, y);
    y += 13;
  }

  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  pdf.save(`${safeName}-engineering-report.pdf`);
}
