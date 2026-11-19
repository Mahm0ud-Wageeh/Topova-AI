import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backendTarget = process.env.NETTOPO_BACKEND_URL || "http://127.0.0.1:4000";

export default defineConfig({
  envDir: "..",
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  plugins: [react() as never],
  resolve: {
    alias: [
      { find: "@/lib/utils", replacement: path.resolve(import.meta.dirname, "src/lib/utils.ts") },
      { find: "@/lib", replacement: path.resolve(import.meta.dirname, "../shared/lib") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/reactflow") || id.includes("node_modules/@reactflow")) {
            return "vendor-flow";
          }
          if (id.includes("node_modules/jspdf")) return "vendor-pdf";
          if (id.includes("node_modules/html2canvas")) return "vendor-capture";
          if (id.includes("node_modules/framer-motion")) {
            return "vendor-motion";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-icons";
          }
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react-router")) {
            return "vendor-react";
          }
          return undefined;
        },
      },
    },
  },
  server: {
    host: process.env.FRONTEND_HOST || "localhost",
    port: Number(process.env.FRONTEND_PORT || 3000),
    strictPort: true,
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: process.env.FRONTEND_HOST || "localhost",
    port: Number(process.env.FRONTEND_PORT || 3000),
    strictPort: true,
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
});
