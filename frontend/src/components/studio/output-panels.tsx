import { useState } from "react";
import { toast } from "sonner";
import {
  Copy,
  Download,
  FileCode2,
  FolderArchive,
  History,
  Layers,
  Network,
  Package,
  RotateCcw,
  Table2,
  Terminal,
} from "lucide-react";
import type { MultiVendorExport } from "@/lib/network-engine/multi-vendor";
import type { NetworkPlan, ProjectRevision } from "@/lib/network-engine/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";

/* ---------------- 1. IP & VLAN PLAN PANEL ---------------- */
export function IpPlanPanel({ plan }: { plan: NetworkPlan }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold flex items-center gap-1.5">
          <Table2 className="h-4 w-4 text-primary" />
          {t("خطة العناوين و VLAN", "IPv4 & VLAN Plan")}
        </span>
        <Badge variant="secondary">{plan.routing.protocol}</Badge>
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        Base: {plan.ipPlan.base} · {plan.vlanPlan.length ? `${plan.vlanPlan.length} VLANs` : "Flat LAN"}
      </p>

      <div className="space-y-2">
        {plan.ipPlan.subnets.map((s, idx) => (
          <div key={idx} className="rounded-lg border bg-muted/20 p-2.5 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold">{s.name}</span>
              <code className="font-mono font-bold text-primary">{s.cidr}</code>
            </div>
            <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
              <span>Mask: {s.mask || "—"}</span>
              <span>{s.range || "—"}</span>
            </div>
          </div>
        ))}
      </div>

      {plan.routing.routes.length > 0 && (
        <div className="rounded-lg border p-3 space-y-1.5">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-cyan" />
            {t("جدول التوجيه", "Routing Statements")} ({plan.routing.protocol})
          </p>
          <pre dir="ltr" className="overflow-x-auto rounded bg-slate-950 p-2.5 font-mono text-[11px] text-slate-200">
            {plan.routing.routes.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ---------------- 2. CISCO NATIVE EXPORTS & MULTI-VENDOR CLI PANEL ---------------- */
export function MultiVendorPanel({
  multiVendor,
  downloadingZip,
  onDownloadLabPack,
  onDownloadCml,
  onDownloadGns3,
  onDownloadPacketTracer,
}: {
  multiVendor: MultiVendorExport;
  downloadingZip: boolean;
  onDownloadLabPack: () => void;
  onDownloadCml: () => void;
  onDownloadGns3: () => void;
  onDownloadPacketTracer: () => void;
}) {
  const { t } = useLanguage();
  const [vendor, setVendor] = useState<"cisco" | "mikrotik" | "junos" | "ansible">("cisco");

  const content =
    vendor === "cisco"
      ? multiVendor.cisco.combined
      : vendor === "mikrotik"
        ? multiVendor.mikrotik
        : vendor === "junos"
          ? multiVendor.junos
          : multiVendor.ansibleInventory;

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(content);
      toast.success(t("تم النسخ إلى الحافظة", "Copied to clipboard"));
    } catch {
      toast.error(t("تعذر النسخ", "Could not copy"));
    }
  }

  return (
    <div className="space-y-4 text-sm">
      {/* Real Cisco-Openable Export Center */}
      <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-cyan/5 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold flex items-center gap-1.5 text-xs">
            <Network className="h-4 w-4 text-cyan" />
            {t("تصدير مباشر لبرامج Cisco الحقيقية", "Direct Cisco Software Exports")}
          </span>
          <Badge variant="ai" className="text-[10px]">
            Editable
          </Badge>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t(
            "حمّل ملفات حقيقية تُفتح وتُعدّل مباشرة داخل Cisco Modeling Labs و GNS3، أو حزمة Packet Tracer 8.x الجاهزة بالـ startup .cfg ودليل التوصيل التفاعلي.",
            "Download native editable lab files that open directly in Cisco Modeling Labs (CML) & GNS3, plus a Packet Tracer 8.x Ready Pack (.cfg + interactive wiring guide).",
          )}
        </p>

        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            variant="default"
            className="h-9 justify-start gap-1.5 text-[11px]"
            disabled={downloadingZip}
            onClick={onDownloadCml}
          >
            <FileCode2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Cisco CML (.yaml)</span>
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-9 justify-start gap-1.5 text-[11px]"
            disabled={downloadingZip}
            onClick={onDownloadGns3}
          >
            <Network className="h-3.5 w-3.5 shrink-0 text-cyan" />
            <span className="truncate">GNS3 (.gns3)</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 justify-start gap-1.5 text-[11px]"
            disabled={downloadingZip}
            onClick={onDownloadPacketTracer}
          >
            <FolderArchive className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <span className="truncate">Packet Tracer Pack</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 justify-start gap-1.5 text-[11px]"
            disabled={downloadingZip}
            onClick={onDownloadLabPack}
          >
            <Package className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{t("كل الشركات ZIP", "Full Lab ZIP")}</span>
          </Button>
        </div>
      </div>

      {/* Multi-Vendor CLI Inspector */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold flex items-center gap-1.5 text-xs">
            <Terminal className="h-4 w-4 text-cyan" />
            {t("إعدادات متعددة الشركات", "Multi-Vendor Configs")}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {multiVendor.cisco.configs.length} {t("أجهزة مُدارة", "managed devices")}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1">
          {(
            [
              { id: "cisco", label: "Cisco" },
              { id: "mikrotik", label: "MikroTik" },
              { id: "junos", label: "Junos" },
              { id: "ansible", label: "Ansible" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setVendor(item.id)}
              className={`rounded-md border px-2 py-1.5 text-xs font-semibold transition-colors ${
                vendor === item.id
                  ? "border-primary bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-lg border">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs">
            <span className="font-mono text-muted-foreground">
              {vendor === "cisco"
                ? "cisco-ios.cfg"
                : vendor === "mikrotik"
                  ? "routeros-v7.rsc"
                  : vendor === "junos"
                    ? "junos-set.conf"
                    : "hosts.yml"}
            </span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => void copyContent()} title="Copy">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDownloadLabPack} title="Download Full ZIP">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <pre dir="ltr" className="max-h-[42vh] overflow-auto bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
            <code>{content}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}

/* ---------------- 3. VERSION TIME-MACHINE PANEL ---------------- */
export function TimeMachinePanel({
  revisions,
  currentDeviceCount,
  currentLinkCount,
  onSaveRevision,
  onRestoreRevision,
}: {
  revisions: ProjectRevision[];
  currentDeviceCount: number;
  currentLinkCount: number;
  onSaveRevision: (note: string) => void;
  onRestoreRevision: (rev: ProjectRevision) => void;
}) {
  const { t } = useLanguage();
  const [note, setNote] = useState("");

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg border bg-muted/30 p-3 space-y-2.5">
        <span className="font-semibold flex items-center gap-1.5">
          <History className="h-4 w-4 text-primary" />
          {t("الآلة الزمنية للإصدارات", "Version Time-Machine")}
        </span>
        <p className="text-xs text-muted-foreground">
          {t(
            "احفظ لقطة إصدار جديدة وقارن الفروقات أو استرجع أي حالة سابقة بضغطة زر.",
            "Snapshot revisions, inspect device/link deltas, and roll back instantaneously.",
          )}
        </p>
        <div className="flex gap-1.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("وصف الإصدار...", "Revision note (e.g. Added HA Firewall)")}
            className="h-8 flex-1 rounded-md border bg-background px-2.5 text-xs"
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={() => {
              onSaveRevision(note.trim() || `Snapshot (${currentDeviceCount} devices)`);
              setNote("");
            }}
          >
            {t("حفظ لقطة", "Snapshot")}
          </Button>
        </div>
      </div>

      {revisions.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-6">
          {t("احفظ المشروع أولاً لتفعيل سجل الإصدارات.", "Save the project or take a snapshot to populate history.")}
        </p>
      ) : (
        <div className="space-y-2">
          {revisions.map((rev) => {
            const devDelta = currentDeviceCount - rev.snapshot.devices.length;
            const linkDelta = currentLinkCount - rev.snapshot.connections.length;
            return (
              <div key={rev.number} className="rounded-lg border p-2.5 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-primary">v{rev.number}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(rev.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <p className="font-medium">{rev.note}</p>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {rev.snapshot.devices.length} dev · {rev.snapshot.connections.length} links
                    {devDelta !== 0 || linkDelta !== 0
                      ? ` (Δ ${devDelta >= 0 ? `+${devDelta}` : devDelta}d / ${linkDelta >= 0 ? `+${linkDelta}` : linkDelta}l)`
                      : " (Current)"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 px-2 text-[11px]"
                    onClick={() => onRestoreRevision(rev)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t("استرجاع", "Restore")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
