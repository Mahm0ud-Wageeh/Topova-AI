import Link from "next/link";
import { Logo } from "@/components/shared/logo";

const links = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "GitHub", href: "https://github.com/Mahm0ud-Wageeh" },
];

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container flex flex-col items-center gap-4 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <Logo className="text-base" />
        <p>&copy; {new Date().getFullYear()} NetTopo AI Systems. All rights reserved.</p>
        <nav className="flex items-center gap-5 font-mono text-xs">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="transition-colors hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
