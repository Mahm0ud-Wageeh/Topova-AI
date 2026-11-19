import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TopovaMarkProps {
  className?: string;
  size?: number;
}

/** One SVG brand asset shared by all loaders, assistant avatars and compact surfaces. */
export function TopovaMark({ className, size = 32 }: TopovaMarkProps) {
  return (
    <img
      src="/brand/topova-icon.svg"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

interface TopovaLogoProps {
  size?: number;
  showBadge?: boolean;
  compact?: boolean;
  className?: string;
}

/** Outlined wordmarks preserve the approved letterforms without a font-loading dependency. */
export function TopovaLogo({
  size = 34,
  showBadge = false,
  compact = false,
  className,
}: TopovaLogoProps) {
  const height = compact ? Math.min(size, 30) : size;
  const width = Math.round(height * 4.4);
  return (
    <span
      role="img"
      aria-label="Topova AI"
      dir="ltr"
      className={cn("inline-flex shrink-0 items-center gap-2.5", className)}
    >
      <TopovaMark
        size={height}
        className={compact ? "hidden" : "min-[480px]:hidden"}
      />
      <img
        src="/brand/topova-logo-light.svg"
        width={width}
        height={height}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn(
          "shrink-0 object-contain dark:!hidden",
          compact ? "block" : "hidden min-[480px]:block",
        )}
      />
      <img
        src="/brand/topova-logo-dark.svg"
        width={width}
        height={height}
        alt=""
        aria-hidden="true"
        draggable={false}
        className={cn(
          "hidden shrink-0 object-contain",
          compact ? "dark:block" : "dark:min-[480px]:block",
        )}
      />
      {showBadge && (
        <Badge
          variant="ai"
          aria-hidden="true"
          className="hidden text-[10px] sm:inline-flex"
        >
          Agent
        </Badge>
      )}
    </span>
  );
}
