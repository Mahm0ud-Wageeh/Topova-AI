import animate from "tailwindcss-animate";
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1360px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        cyan: { DEFAULT: "hsl(var(--cyan))", foreground: "hsl(var(--cyan-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 6px)",
      },
      fontFamily: {
        sans: ["var(--font-sans, system-ui)", "sans-serif"],
        display: ["var(--font-display, system-ui)", "sans-serif"],
        mono: ["var(--font-mono, ui-monospace)", "monospace"],
      },
      boxShadow: {
        glow: "0 1px 2px rgba(0, 0, 0, 0.08), 0 8px 20px -10px hsl(var(--primary) / 0.28)",
        "glow-cyan": "0 1px 2px rgba(0, 0, 0, 0.08), 0 8px 20px -10px hsl(var(--cyan) / 0.24)",
        surface: "0 1px 2px rgba(0, 0, 0, 0.04), 0 8px 24px -12px rgba(0, 0, 0, 0.08)",
        elevated: "0 2px 6px rgba(0, 0, 0, 0.06), 0 18px 40px -16px rgba(0, 0, 0, 0.14)",
      },
    },
  },
  plugins: [animate],
};

export default config;
