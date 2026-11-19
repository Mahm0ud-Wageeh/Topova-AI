import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  Copy,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Globe,
  Loader2,
  Network,
  SlidersHorizontal,
} from "lucide-react";
import { apiRequest } from "@/api/client";
import {
  auditSecurityResilience,
  estimateBomAndPoe,
  generateCiscoCmlYaml,
  generateGns3Project,
  generateMultiVendorConfigs,
  generatePacketTracerBundle,
  toStartupConfig,
} from "@/lib/network-engine";
import { useLanguage } from "@/context/language-context";
import type {
  ChatExportCard,
  ConversationWorkspaceState,
  ExportCardKind,
} from "./workspace-types";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeSlug(raw?: string): string {
  return (raw?.trim() || "topova-network")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function cardIcon(id: ExportCardKind) {
  switch (id) {
    case "pt-guide":
      return Globe;
    case "cisco-cfg":
      return FileCode2;
    case "cabling-csv":
      return FileSpreadsheet;
    case "cml-yaml":
    case "gns3-project":
      return Network;
    case "pdf-report":
      return FileText;
    case "pt-pack":
    default:
      return FolderArchive;
  }
}

interface ChatExportCardsProps {
  cards: ChatExportCard[];
  workspace: ConversationWorkspaceState;
  preferArabic: boolean;
  onOpenExportCenter: () => void;
}

export function ChatExportCards({
  cards,
  workspace,
  preferArabic,
  onOpenExportCenter,
}: ChatExportCardsProps) {
  const { t } = useLanguage();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [copiedDevice, setCopiedDevice] = useState<string | null>(null);

  const ciscoDevices = useMemo(
    () =>
      generateMultiVendorConfigs(
        workspace.topology,
        workspace.plan,
        workspace.acls,
      ).cisco.configs,
    [workspace.topology, workspace.plan, workspace.acls],
  );

  const isAr = preferArabic;
  const slug = safeSlug(workspace.projectName);

  function downloadDeviceCfg(hostname: string, cli: string) {
    const startup = toStartupConfig(cli);
    triggerDownload(
      new Blob([startup], { type: "text/plain;charset=utf-8" }),
      `${hostname.toLowerCase()}-startup.cfg`,
    );
    toast.success(
      isAr
        ? `تم تحميل ${hostname.toLowerCase()}-startup.cfg — افتح الجهاز في Packet Tracer ثم Config ← Load`
        : `Downloaded ${hostname.toLowerCase()}-startup.cfg — in Packet Tracer open device → Config → Load`,
    );
  }

  async function copyDeviceCli(hostname: string, cli: string) {
    try {
      await navigator.clipboard.writeText(cli);
      setCopiedDevice(hostname);
      toast.success(
        isAr
          ? `تم نسخ أوامر ${hostname} — الصقها مباشرة في تبويب CLI داخل Packet Tracer`
          : `Copied ${hostname} CLI — paste directly into Packet Tracer's CLI tab`,
      );
      setTimeout(() => setCopiedDevice((c) => (c === hostname ? null : c)), 1800);
    } catch {
      toast.error(t("تعذر النسخ.", "Copy failed."));
    }
  }

  async function handleDownload(card: ChatExportCard) {
    setBusyId(card.id);
    try {
      const { topology, plan, acls, projectName } = workspace;

      if (card.id === "pt-guide") {
        const pt = generatePacketTracerBundle(topology, plan, acls, projectName);
        triggerDownload(
          new Blob([pt.guideHtml], { type: "text/html;charset=utf-8" }),
          `${slug}-packet-tracer-guide.html`,
        );
      } else if (card.id === "cisco-cfg") {
        const multi = generateMultiVendorConfigs(topology, plan, acls);
        triggerDownload(
          new Blob([multi.cisco.combined], { type: "text/plain;charset=utf-8" }),
          `${slug}-cisco-ios-startup.cfg`,
        );
      } else if (card.id === "cabling-csv") {
        const pt = generatePacketTracerBundle(topology, plan, acls, projectName);
        triggerDownload(
          new Blob([pt.cablingCsv], { type: "text/csv;charset=utf-8" }),
          `${slug}-cabling-matrix.csv`,
        );
      } else if (card.id === "cml-yaml") {
        const yaml = generateCiscoCmlYaml(topology, plan, acls, projectName);
        triggerDownload(
          new Blob([yaml], { type: "application/x-yaml;charset=utf-8" }),
          `${slug}-cisco-cml.yaml`,
        );
      } else if (card.id === "gns3-project") {
        const gns3 = generateGns3Project(topology, plan, acls, projectName);
        triggerDownload(
          new Blob([gns3.projectJson], { type: "application/json;charset=utf-8" }),
          `${slug}.gns3`,
        );
      } else if (card.id === "pdf-report") {
        const audit = auditSecurityResilience(topology, plan, acls);
        const bom = estimateBomAndPoe(topology, plan);
        const { exportExecutivePdfReport } = await import(
          "@/components/studio/executive-pdf"
        );
        await exportExecutivePdfReport({
          projectName,
          topology,
          plan,
          audit,
          bom,
        });
      } else if (card.id === "pt-pack") {
        const payload = await apiRequest<{ filename: string; archive: string }>(
          "/api/v1/exports/packet-tracer",
          {
            method: "POST",
            body: {
              name: projectName,
              topology,
              plan,
              acls,
              acknowledgeWarnings: true,
            },
          },
        );
        const bytes = Uint8Array.from(atob(payload.archive), (c) =>
          c.charCodeAt(0),
        );
        triggerDownload(
          new Blob([bytes], { type: "application/zip" }),
          payload.filename,
        );
      }

      setDoneId(card.id);
      toast.success(
        isAr
          ? `تم تحميل: ${card.titleAr}`
          : `Downloaded: ${card.titleEn}`,
      );
      setTimeout(() => setDoneId((cur) => (cur === card.id ? null : cur)), 2200);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("تعذر تجهيز الملف.", "Could not export file."),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="glass-surface mt-3.5 space-y-3 rounded-2xl p-4"
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-xs font-semibold text-foreground">
          {isAr
            ? "ملفات جاهزة للتحميل المباشر"
            : "Ready-to-Download Engineering Files"}
        </span>
        <button
          type="button"
          onClick={onOpenExportCenter}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <SlidersHorizontal className="h-3 w-3" />
          {isAr ? "مركز التصدير الكامل" : "Full Export Center"}
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {cards.map((card) => {
          const Icon = cardIcon(card.id);
          const isBusy = busyId === card.id;
          const isDone = doneId === card.id;

          return (
            <button
              key={card.id}
              type="button"
              disabled={busyId !== null}
              onClick={() => void handleDownload(card)}
              className="group flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/55 p-3 text-start backdrop-blur-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/45 hover:bg-background/85 disabled:opacity-60"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg border bg-muted/60 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-foreground">
                      {isAr ? card.titleAr : card.titleEn}
                    </span>
                    <span
                      dir="ltr"
                      className="rounded border border-border bg-muted px-1.5 py-0.2 font-mono text-[10px] font-medium text-muted-foreground"
                    >
                      {card.format}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                    {isAr ? card.descAr : card.descEn}
                  </p>
                </div>
              </div>

              <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border/70 bg-card text-muted-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
                {isBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isDone ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Per-Device 1-Click Packet Tracer .cfg & Copy CLI Bar */}
      {ciscoDevices.length > 0 && (
        <div className="border-t border-border/70 pt-2.5">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">
            {isAr
              ? "استيراد سريع لكل جهاز في Cisco Packet Tracer (اختر الجهاز → Config → Load أو الصق في CLI):"
              : "Per-device Cisco Packet Tracer import (Device → Config → Load, or paste into CLI):"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ciscoDevices.slice(0, 8).map((cfg) => (
              <div
                key={cfg.deviceId}
                dir="ltr"
                className="inline-flex items-center overflow-hidden rounded-lg border border-border/80 bg-background text-[11px] font-mono"
              >
                <button
                  type="button"
                  onClick={() => downloadDeviceCfg(cfg.hostname, cfg.cli)}
                  title={
                    isAr
                      ? `تحميل ملف ${cfg.hostname}.cfg`
                      : `Download ${cfg.hostname}.cfg`
                  }
                  className="inline-flex items-center gap-1 px-2 py-1 font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Download className="h-3 w-3 text-primary" />
                  {cfg.hostname}.cfg
                </button>
                <button
                  type="button"
                  onClick={() => void copyDeviceCli(cfg.hostname, cfg.cli)}
                  title={
                    isAr
                      ? `نسخ أوامر ${cfg.hostname} للـ CLI`
                      : `Copy ${cfg.hostname} CLI`
                  }
                  className="border-s border-border/70 px-1.5 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {copiedDevice === cfg.hostname ? (
                    <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
