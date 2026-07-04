"use client";
import {
  FileJson,
  FileText,
  Image as ImageIcon,
  Loader2,
  Network as NetworkIcon,
  Save,
  ShieldCheck,
  Table2,
  Terminal,
} from "lucide-react";
import { SignedIn, UserButton } from "@clerk/nextjs";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WorkspaceView = "network" | "ipplan" | "cli" | "security";

const TABS: { id: WorkspaceView; label: string; icon: typeof NetworkIcon }[] = [
  { id: "network", label: "Diagram", icon: NetworkIcon },
  { id: "ipplan", label: "IP Plan", icon: Table2 },
  { id: "cli", label: "Config", icon: Terminal },
  { id: "security", label: "Security", icon: ShieldCheck },
];

export function WorkspaceRail({
  view,
  onView,
  onSave,
  saving,
  onExportPng,
  onExportPdf,
  onExportJson,
}: {
  view: WorkspaceView;
  onView: (v: WorkspaceView) => void;
  onSave?: () => void;
  saving?: boolean;
  onExportPng?: () => void;
  onExportPdf?: () => void;
  onExportJson?: () => void;
}) {
  return (
    <>
      {/* ===== Desktop / tablet: left rail ===== */}
      <aside className="hidden shrink-0 flex-col border-r bg-card/60 backdrop-blur-xl md:flex md:w-16 lg:w-60">
        <div className="flex h-14 items-center gap-2 border-b px-3">
          <Logo />
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onView(t.id)}
              title={t.label}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                view === t.id
                  ? "bg-gradient-to-r from-primary/15 to-cyan/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <t.icon className="h-5 w-5 shrink-0" />
              <span className="hidden lg:inline">{t.label}</span>
            </button>
          ))}

          <div className="mt-4 border-t pt-3">
            <p className="hidden px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:block">
              Export
            </p>
            <button type="button" onClick={onExportPng} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <ImageIcon className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">PNG</span>
            </button>
            <button type="button" onClick={onExportPdf} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <FileText className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">PDF</span>
            </button>
            <button type="button" onClick={onExportJson} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <FileJson className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">JSON</span>
            </button>
          </div>
        </nav>

        <div className="flex flex-col gap-2 border-t p-2">
          {onSave && (
            <Button size="sm" onClick={onSave} disabled={saving} className="w-full gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="hidden lg:inline">Save project</span>
            </Button>
          )}
          <div className="flex items-center justify-between gap-2 px-1">
            <ThemeToggle />
            <SignedIn>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </div>
        </div>
      </aside>

      {/* ===== Mobile: bottom tab bar ===== */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t bg-card/95 backdrop-blur-xl md:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onView(t.id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
              view === t.id ? "text-primary" : "text-muted-foreground",
            )}
          >
            <t.icon className="h-5 w-5" />
            {t.label}
          </button>
        ))}
        {onSave && (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium text-primary"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
            Save
          </button>
        )}
      </nav>
    </>
  );
}