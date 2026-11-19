import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseEnv } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const [mode = "dev", only] = process.argv.slice(2);
if (!["dev", "start", "build"].includes(mode) || (only && !["frontend", "backend"].includes(only))) {
  throw new Error("Usage: node scripts/run.mjs <dev|start|build> [frontend|backend]");
}

const configuredEnv = {};
for (const file of mode === "dev" ? [".env", ".env.development.local"] : [".env"]) {
  const filename = join(root, file);
  if (existsSync(filename)) {
    Object.assign(configuredEnv, parseEnv(readFileSync(filename, "utf8").replace(/^\uFEFF/, "")));
  }
}
for (const [key, value] of Object.entries(configuredEnv)) process.env[key] ??= value;

const targets = only ? [only] : mode === "start" ? ["backend"] : ["backend", "frontend"];
const frontendHost = process.env.FRONTEND_HOST || "localhost";
const backendHost = process.env.BACKEND_HOST || "127.0.0.1";

function probePort(port, host) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", (error) => {
      if (error.code === "EADDRINUSE") resolve(false);
      else reject(error);
    });
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });
}

async function servicePort(service, host, fallbackPort, variable, allowFallback) {
  const configured = process.env[variable];
  const preferred = Number(configured || fallbackPort);
  if (!Number.isInteger(preferred) || preferred < 1 || preferred > 65535) {
    throw new Error(`${variable} must be a port from 1 to 65535.`);
  }
  if (mode === "build" || !targets.includes(service)) return preferred;
  if (await probePort(preferred, host)) return preferred;
  if (mode === "dev" && !configured && allowFallback) {
    for (let port = preferred + 1; port <= Math.min(preferred + 20, 65535); port++) {
      if (await probePort(port, host)) {
        console.log(`NetTopo ${service}: port ${preferred} is in use. Using ${port}.`);
        return port;
      }
    }
  }
  throw new Error(`NetTopo ${service}: ${host}:${preferred} is in use. Stop the server using it or set ${variable} to a free port.`);
}

let frontendPort, backendPort;
try {
  backendPort = await servicePort("backend", backendHost, 4000, "BACKEND_PORT", !only && !process.env.NETTOPO_BACKEND_URL);
  frontendPort = await servicePort("frontend", frontendHost, 3000, "FRONTEND_PORT", !only);
  if (mode !== "build" && !only && frontendPort === backendPort) {
    throw new Error("Use different ports for FRONTEND_PORT and BACKEND_PORT.");
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const require = createRequire(import.meta.url);
const formatHost = (host) => (host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host.includes(":") ? `[${host}]` : host);
const backendUrlHost = formatHost(backendHost);
const frontendOrigins = new Set([`http://localhost:${frontendPort}`, `http://127.0.0.1:${frontendPort}`]);
if (frontendHost && frontendHost !== "0.0.0.0" && frontendHost !== "::") {
  frontendOrigins.add(`http://${formatHost(frontendHost)}:${frontendPort}`);
}
if (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL) {
  try {
    frontendOrigins.add(new URL(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL).origin);
  } catch {
    // ignore invalid URL
  }
}

const defaults = {
  ...process.env,
  NODE_ENV: mode === "start" ? "production" : process.env.NODE_ENV || "development",
  FRONTEND_PORT: String(frontendPort),
  BACKEND_PORT: String(backendPort),
  NETTOPO_BACKEND_URL: process.env.NETTOPO_BACKEND_URL || `http://${backendUrlHost}:${backendPort}`,
};
defaults.NETTOPO_AUTHORIZED_ORIGINS ||= [...frontendOrigins].join(",");

const frontendEnv = { ...defaults };
for (const name of [
  "DATABASE_URL",
  "DIRECT_URL",
  "JWT_SECRET",
  "CLERK_SECRET_KEY",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "CEREBRAS_API_KEY",
  "OPENROUTER_API_KEY",
  "MISTRAL_API_KEY",
  "Z_API_KEY",
  "HUGGINGFACE_API_KEY",
  "OLLAMA_BASE_URL",
]) {
  delete frontendEnv[name];
}

const viteCandidates = [
  join(root, "frontend", "node_modules", "vite", "bin", "vite.js"),
  join(root, "node_modules", "vite", "bin", "vite.js"),
];
const viteBin = viteCandidates.find((candidate) => existsSync(candidate));
if (!viteBin) throw new Error("Vite binary not found. Run npm install first.");
const cli = {
  frontend:
    mode === "build"
      ? [viteBin, "build"]
      : mode === "start"
        ? [viteBin, "preview", "--host", frontendHost, "--port", String(frontendPort), "--strictPort"]
        : [viteBin, "--host", frontendHost, "--port", String(frontendPort), "--strictPort"],
  backend:
    mode === "build"
      ? [require.resolve("typescript/bin/tsc"), "--noEmit", "--incremental", "false", "-p", "tsconfig.json"]
      : [...(mode === "dev" && process.env.NETTOPO_NO_WATCH !== "1" ? ["--watch"] : []), "--import", "tsx", "src/server.ts"],
};

const children = [];
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill();
}

for (const target of targets) {
  const child = spawn(process.execPath, cli[target], {
    cwd: join(root, target),
    env: target === "frontend" ? frontendEnv : defaults,
    stdio: "inherit",
  });
  children.push(child);
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code ?? 1));
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
