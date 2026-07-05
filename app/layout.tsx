import type { Metadata } from "next";
import { Inter, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Body / data text
const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Headlines (sharp contemporary grotesque)
const display = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });
// Labels, IPs, code-like data
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "NetTopo AI - AI Network Topology & Planner",
    template: "%s | NetTopo AI",
  },
  description:
    "Design professional network topologies using AI. Describe your network in plain English or Arabic and get instant topology diagrams, IP/VLAN plans, and production-ready Cisco IOS configurations.",
  keywords: [
    "network topology",
    "network planner",
    "AI network design",
    "Cisco IOS",
    "VLAN planning",
    "IP addressing",
    "network diagram",
    "topology generator",
  ],
  authors: [{ name: "NetTopo AI" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "NetTopo AI",
    title: "NetTopo AI - AI Network Topology & Planner",
    description:
      "Design professional network topologies using AI. Get instant diagrams, IP/VLAN plans, and Cisco IOS configs.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          className={`${inter.variable} ${display.variable} ${mono.variable} font-sans antialiased`}
        >
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
            {children}
            <Toaster richColors position="top-center" />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}