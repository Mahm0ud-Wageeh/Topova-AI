import { checkExport } from "@/lib/network-engine/export-preflight";
import { Modal } from "@/components/ui/modal";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Cable,
  Check,
  Copy,
  Download,
  FileCode2,
  FileText,
  FolderArchive,
  Info,
  Network,
  Package,
  Terminal,
  X,
} from "lucide-react";
import { apiRequest } from "@/api/client";
import {
  assignAddressing,
  assignDevicePorts,
  auditSecurityResilience,
  estimateBomAndPoe,
  generateMultiVendorConfigs,
  toStartupConfig,
} from "@/lib/network-engine";
import type {
  AclRule,
  BuiltTopology,
  DeviceType,
  NetworkPlan,
} from "@/lib/network-engine/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/language-context";

const PT_MODELS: Record<DeviceType, string> = {
  ROUTER: "ISR 4331 / 2911 Router",
  FIREWALL: "ASA 5506-X Firewall",
  SWITCH: "Catalyst 2960-24TT Switch",
  SERVER: "Server-PT",
  PC: "PC-PT",
  AP: "AccessPoint-PT",
  PRINTER: "Printer-PT",
  CAMERA: "IoT IP Camera",
  NVR: "Server-PT (NVR)",
  IP_PHONE: "7960 IP Phone",
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface PacketTracerExportModalProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  topology: BuiltTopology;
  plan: NetworkPlan;
  acls: AclRule[];
}

export function PacketTracerExportModal({
  open,
  onClose,
  projectName,
  topology,
  plan,
  acls,
}: PacketTracerExportModalProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<"packet-tracer" | "advanced">(
    "packet-tracer",
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const preflight = useMemo(
    () => checkExport(topology, plan, acls),
    [topology, plan, acls],
  );
  const exportAllowed = preflight.ready && acknowledged;
  useEffect(() => setAcknowledged(false), [topology, plan, acls]);
  const [busy, setBusy] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const addressing = useMemo(
    () => assignAddressing(topology, plan),
    [topology, plan],
  );
  const ports = useMemo(() => assignDevicePorts(topology), [topology]);
  const multi = useMemo(
    () => generateMultiVendorConfigs(topology, plan, acls),
    [topology, plan, acls],
  );
  const [selectedCfgId, setSelectedCfgId] = useState<string>(
    () => multi.cisco.configs[0]?.deviceId ?? "",
  );

  if (!open) return null;

  const activeCfg =
    multi.cisco.configs.find((c) => c.deviceId === selectedCfgId) ??
    multi.cisco.configs[0];

  async function copyCli(id: string, text: string) {
    if (!exportAllowed) {
      toast.error(t("راجع فحص التصدير أولاً.", "Review export checks first."));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast.success(
        t("تم نسخ أوامر Cisco IOS للحافظة.", "Cisco IOS commands copied."),
      );
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      toast.error(t("تعذر النسخ.", "Copy failed."));
    }
  }

  function downloadSingleCfg(hostname: string, cli: string) {
    if (!exportAllowed) {
      toast.error(t("راجع فحص التصدير أولاً.", "Review export checks first."));
      return;
    }
    const startup = toStartupConfig(cli);
    downloadBlob(
      new Blob([startup], { type: "text/plain" }),
      `${hostname.toLowerCase()}-startup.cfg`,
    );
    toast.success(
      `${t("تم تنزيل ملف التشغيل:", "Downloaded startup config:")} ${hostname}.cfg`,
    );
  }

  async function downloadPacketTracerPack() {
    if (!exportAllowed) {
      toast.error(t("راجع فحص التصدير أولاً.", "Review export checks first."));
      return;
    }
    setBusy("pt");
    try {
      const payload = await apiRequest<{ filename: string; archive: string }>(
        "/api/v1/exports/packet-tracer",
        {
          method: "POST",
          body: {
            name: projectName,
            topology,
            plan,
            acls,
            acknowledgeWarnings: acknowledged,
          },
        },
      );
      const bytes = Uint8Array.from(atob(payload.archive), (c) =>
        c.charCodeAt(0),
      );
      downloadBlob(
        new Blob([bytes], { type: "application/zip" }),
        payload.filename,
      );
      toast.success(
        t(
          "تم تنزيل حزمة Cisco Packet Tracer 8.x الكاملة بنجاح.",
          "Cisco Packet Tracer 8.x Ready Pack downloaded.",
        ),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("فشل التصدير", "Export failed"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function downloadCml() {
    if (!exportAllowed) {
      toast.error(t("راجع فحص التصدير أولاً.", "Review export checks first."));
      return;
    }
    setBusy("cml");
    try {
      const payload = await apiRequest<{ filename: string; content: string }>(
        "/api/v1/exports/cml",
        {
          method: "POST",
          body: {
            name: projectName,
            topology,
            plan,
            acls,
            acknowledgeWarnings: acknowledged,
          },
        },
      );
      downloadBlob(
        new Blob([payload.content], { type: "application/x-yaml" }),
        payload.filename,
      );
      toast.success(
        t("تم تنزيل ملف Cisco CML (.yaml).", "Cisco CML (.yaml) downloaded."),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("فشل التصدير", "Export failed"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function downloadGns3() {
    if (!exportAllowed) {
      toast.error(t("راجع فحص التصدير أولاً.", "Review export checks first."));
      return;
    }
    setBusy("gns3");
    try {
      const payload = await apiRequest<{ filename: string; content: string }>(
        "/api/v1/exports/gns3",
        {
          method: "POST",
          body: {
            name: projectName,
            topology,
            plan,
            acls,
            acknowledgeWarnings: acknowledged,
          },
        },
      );
      downloadBlob(
        new Blob([payload.content], { type: "application/json" }),
        payload.filename,
      );
      toast.success(
        t("تم تنزيل مشروع GNS3 (.gns3).", "GNS3 (.gns3) project downloaded."),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("فشل التصدير", "Export failed"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function downloadFullLabZip() {
    if (!exportAllowed) {
      toast.error(t("راجع فحص التصدير أولاً.", "Review export checks first."));
      return;
    }
    setBusy("zip");
    try {
      const payload = await apiRequest<{ filename: string; archive: string }>(
        "/api/v1/exports/lab-pack",
        {
          method: "POST",
          body: {
            name: projectName,
            topology,
            plan,
            acls,
            acknowledgeWarnings: acknowledged,
          },
        },
      );
      const bytes = Uint8Array.from(atob(payload.archive), (c) =>
        c.charCodeAt(0),
      );
      downloadBlob(
        new Blob([bytes], { type: "application/zip" }),
        payload.filename,
      );
      toast.success(
        t(
          "تم تنزيل الحزمة متعددة الشركات.",
          "Multi-Vendor Lab Pack downloaded.",
        ),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("فشل التصدير", "Export failed"),
      );
    } finally {
      setBusy(null);
    }
  }

  async function downloadPdf() {
    if (!exportAllowed) {
      toast.error(t("راجع فحص التصدير أولاً.", "Review export checks first."));
      return;
    }
    setBusy("pdf");
    try {
      const audit = auditSecurityResilience(topology, plan, acls);
      const bom = estimateBomAndPoe(topology, plan);
      const { exportExecutivePdfReport } = await import("./executive-pdf");
      await exportExecutivePdfReport({
        projectName,
        topology,
        plan,
        audit,
        bom,
      });
      toast.success(
        t("تم توليد التقرير الهندسي PDF.", "Executive PDF exported."),
      );
    } catch {
      toast.error(t("تعذر تصدير التقرير.", "PDF export failed."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      open={open}
      onClose={onClose}
      label="Export network design"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 border-b bg-gradient-to-r from-primary/10 via-card to-cyan/10 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-cyan text-white shadow-glow">
              <Network className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate font-display text-base font-bold sm:text-lg">
                  {t(
                    "مركز تصدير سيسكو باكت تريسر",
                    "Cisco Packet Tracer Export Center",
                  )}
                </h2>
                <Badge variant="ai" className="hidden sm:inline-flex">
                  Packet Tracer 8.x
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {projectName} · {topology.devices.length} {t("جهاز", "devices")}{" "}
                · {topology.connections.length} {t("وصلة", "links")} ·{" "}
                {plan.routing.protocol}
              </p>
            </div>
          </div>

          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <section
          aria-label={t("فحص جاهزية التصدير", "Export readiness checks")}
          className="max-h-44 shrink-0 overflow-auto border-b p-4 text-xs"
        >
          <p className="font-semibold">
            {preflight.ready
              ? t(
                  "راجع التحذيرات قبل التصدير",
                  "Review warnings before exporting",
                )
              : t(
                  "أصلح الأخطاء قبل التصدير",
                  "Resolve errors before exporting",
                )}
          </p>
          <ul className="my-2 space-y-1">
            {preflight.findings.map((finding, index) => (
              <li
                key={index}
                className={
                  finding.severity === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }
              >
                {finding.severity === "error"
                  ? t("خطأ:", "Error:")
                  : t("تنبيه:", "Warning:")}{" "}
                {finding.message}
              </li>
            ))}
          </ul>
          <label className="flex min-h-11 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              disabled={!preflight.ready}
            />
            {t(
              "راجعت التحذيرات وسأتحقق من الإعدادات في المختبر",
              "I reviewed the warnings and will validate these configurations in the lab",
            )}
          </label>
        </section>
        {/* Mode Switcher: Packet Tracer First + Secondary Advanced Labs */}
        <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-2">
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab("packet-tracer")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "packet-tracer"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {t(
                "Cisco Packet Tracer 8.x (الرئيسي)",
                "Cisco Packet Tracer 8.x (Primary)",
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("advanced")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeTab === "advanced"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {t("مختبرات متقدمة وتقرير PDF", "Advanced Labs & PDF")}
            </button>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={busy !== null || !exportAllowed}
            onClick={() => void downloadPacketTracerPack()}
          >
            <FolderArchive className="h-4 w-4" />
            {busy === "pt"
              ? t("جاري التجهيز...", "Packaging...")
              : t(
                  "تنزيل حزمة Packet Tracer الكاملة",
                  "Download Packet Tracer Pack",
                )}
          </Button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === "packet-tracer" ? (
            <>
              {/* Quick Guide Callout */}
              <div className="flex items-start gap-2.5 rounded-xl border border-cyan/30 bg-cyan/5 p-3.5 text-xs leading-relaxed">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-cyan" />
                <div className="space-y-1">
                  <p className="font-semibold text-foreground">
                    {t(
                      "خطوات التشغيل المباشر داخل Cisco Packet Tracer 8.x:",
                      "Quick Load Guide inside Cisco Packet Tracer 8.x:",
                    )}
                  </p>
                  <p className="text-muted-foreground">
                    {t(
                      "الحزمة المصدّرة تحتوي على ملفات startup .cfg لكل راوتر وسويتش وجدار حماية للتحميل المباشر من Config -> Load، بالإضافة إلى نصوص اللصق الفوري في تبويب CLI، وجدول المنافذ والكابلات، ودليل تفاعلي HTML جاهز للطباعة والعرض.",
                      "Your export pack includes per-device NVRAM startup .cfg files (load via Device -> Config -> Load), instant CLI paste scripts, exact port-to-port cabling CSV, and an interactive visual HTML build guide.",
                    )}
                  </p>
                </div>
              </div>

              {/* Per-Device CLI & Startup Config Preview */}
              {multi.cisco.configs.length > 0 && activeCfg && (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold">
                      <Terminal className="h-4 w-4 text-cyan" />
                      {t(
                        "إعدادات أجهزة سيسكو الجاهزة للصق أو التحميل",
                        "Ready-to-Load Cisco IOS Device Configs",
                      )}
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {multi.cisco.configs.map((cfg) => (
                        <button
                          key={cfg.deviceId}
                          type="button"
                          onClick={() => setSelectedCfgId(cfg.deviceId)}
                          className={`rounded-md border px-2.5 py-1 font-mono text-xs font-semibold transition-colors ${
                            activeCfg.deviceId === cfg.deviceId
                              ? "border-primary bg-primary/15 text-primary"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {cfg.hostname}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 text-xs">
                      <span className="font-mono text-slate-300">
                        {activeCfg.hostname} ({PT_MODELS[activeCfg.type]})
                      </span>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 gap-1 text-[11px]"
                          onClick={() =>
                            void copyCli(activeCfg.deviceId, activeCfg.cli)
                          }
                        >
                          {copiedId === activeCfg.deviceId ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          {t("نسخ للـ CLI", "Copy CLI")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-[11px]"
                          onClick={() =>
                            downloadSingleCfg(activeCfg.hostname, activeCfg.cli)
                          }
                        >
                          <Download className="h-3 w-3" />
                          {activeCfg.hostname.toLowerCase()}.cfg
                        </Button>
                      </div>
                    </div>
                    <pre
                      dir="ltr"
                      className="max-h-56 overflow-auto p-3 font-mono text-[11px] leading-relaxed text-slate-200"
                    >
                      <code>{activeCfg.cli}</code>
                    </pre>
                  </div>
                </div>
              )}

              {/* Device Hardware & Port Wiring Grid */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border bg-muted/15 p-3.5 space-y-2.5">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <Network className="h-3.5 w-3.5 text-primary" />
                    {t(
                      "الأجهزة وموديلات Packet Tracer",
                      "Packet Tracer Hardware Mapping",
                    )}
                  </h3>
                  <div className="max-h-52 overflow-y-auto space-y-1.5 text-xs">
                    {topology.devices.map((d) => {
                      const a = addressing.byDevice[d.id];
                      return (
                        <div
                          key={d.id}
                          className="flex items-center justify-between gap-2 rounded-lg border bg-background/80 px-2.5 py-1.5"
                        >
                          <div className="min-w-0">
                            <span className="font-mono font-bold text-foreground">
                              {d.label}
                            </span>
                            <span className="mx-1.5 text-muted-foreground">
                              ·
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {PT_MODELS[d.type]}
                            </span>
                          </div>
                          <span
                            dir="ltr"
                            className="shrink-0 font-mono text-[11px] text-cyan"
                          >
                            {a?.interfaces[0]?.ip ?? "L2"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border bg-muted/15 p-3.5 space-y-2.5">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <Cable className="h-3.5 w-3.5 text-cyan" />
                    {t(
                      "جدول توصيل المنافذ والكابلات",
                      "Exact Port-to-Port Wiring Matrix",
                    )}
                  </h3>
                  <div className="max-h-52 overflow-y-auto space-y-1.5 text-xs">
                    {ports.map((p) => (
                      <div
                        key={p.linkId}
                        dir="ltr"
                        className="flex items-center justify-between gap-2 rounded-lg border bg-background/80 px-2.5 py-1.5 font-mono text-[11px]"
                      >
                        <span className="truncate">
                          <strong className="text-foreground">
                            {p.fromLabel}
                          </strong>{" "}
                          <span className="text-cyan">{p.fromShortPort}</span> ↔{" "}
                          <strong className="text-foreground">
                            {p.toLabel}
                          </strong>{" "}
                          <span className="text-cyan">{p.toShortPort}</span>
                        </span>
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[9px]"
                        >
                          {p.cableType}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm flex items-center gap-2">
                    <FileCode2 className="h-4 w-4 text-primary" />
                    Cisco Modeling Labs (.yaml)
                  </span>
                  <Badge variant="secondary">CML 2.x</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "ملف مختبر كامل يُستورد مباشرة داخل Cisco Modeling Labs مع جميع الأجهزة والإحداثيات وإعدادات التشغيل المدمجة.",
                    "Direct Import Lab file for Cisco Modeling Labs with full editable nodes, links, coordinates & embedded IOS startup configs.",
                  )}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5"
                  disabled={busy !== null || !exportAllowed}
                  onClick={() => void downloadCml()}
                >
                  <Download className="h-3.5 w-3.5" />
                  {busy === "cml"
                    ? "..."
                    : t("تنزيل ملف CML", "Download .yaml")}
                </Button>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm flex items-center gap-2">
                    <Network className="h-4 w-4 text-cyan" />
                    GNS3 Project (.gns3)
                  </span>
                  <Badge variant="secondary">v2.2+</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "ملف مشروع GNS3 يُفتح مباشرة عبر Open Project مع الروابط والمنافذ والرموز الهندسية.",
                    "Open directly in GNS3 via File -> Open Project with pre-mapped ports, symbols & node coordinates.",
                  )}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5"
                  disabled={busy !== null || !exportAllowed}
                  onClick={() => void downloadGns3()}
                >
                  <Download className="h-3.5 w-3.5" />
                  {busy === "gns3"
                    ? "..."
                    : t("تنزيل ملف GNS3", "Download .gns3")}
                </Button>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm flex items-center gap-2">
                    <Package className="h-4 w-4 text-emerald-400" />
                    {t(
                      "حزمة متعددة الشركات الشاملة",
                      "Full Multi-Vendor Lab Pack",
                    )}
                  </span>
                  <Badge variant="secondary">SHA-256</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "تجمع Cisco Packet Tracer و CML و GNS3 و MikroTik و Juniper و Ansible وجداول CSV في أرشيف واحد موثّق.",
                    "Complete archive combining Packet Tracer, CML, GNS3, MikroTik, Juniper, Ansible, BOM CSV & SHA-256 manifest.",
                  )}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5"
                  disabled={busy !== null || !exportAllowed}
                  onClick={() => void downloadFullLabZip()}
                >
                  <Download className="h-3.5 w-3.5" />
                  {busy === "zip"
                    ? "..."
                    : t("تنزيل الأرشيف الكامل", "Download Full ZIP")}
                </Button>
              </div>

              <div className="rounded-xl border bg-muted/20 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-amber-400" />
                    {t(
                      "التقرير الهندسي التنفيذي PDF",
                      "Executive Engineering PDF",
                    )}
                  </span>
                  <Badge variant="secondary">Report</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(
                    "تقرير احترافي جاهز للطباعة والمناقشة يضم جدول العناوين، تقييم الأمان، وتقدير التكلفة وميزانية PoE.",
                    "Presentation-ready architectural PDF with addressing tables, security audit score, and BOM/PoE breakdown.",
                  )}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5"
                  disabled={busy !== null || !exportAllowed}
                  onClick={() => void downloadPdf()}
                >
                  <Download className="h-3.5 w-3.5" />
                  {busy === "pdf"
                    ? "..."
                    : t("توليد ملف PDF", "Export PDF Report")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
