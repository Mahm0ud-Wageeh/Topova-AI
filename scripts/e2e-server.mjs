import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "nettopo-e2e-"));
const child = spawn(process.execPath, ["scripts/run.mjs", "dev"], {
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "test",
    NETTOPO_NO_WATCH: "1", FRONTEND_PORT: "3105", BACKEND_PORT: "4105", NETTOPO_BACKEND_URL: "http://127.0.0.1:4105", NETTOPO_AUTHORIZED_ORIGINS: "http://localhost:3105,http://127.0.0.1:3105", NETTOPO_STORAGE: "local-json", NETTOPO_STORE_PATH: join(directory, "store.json"), GEMINI_API_KEY: "", GROQ_API_KEY: "", CEREBRAS_API_KEY: "", OPENROUTER_API_KEY: "", HUGGINGFACE_API_KEY: "", OLLAMA_BASE_URL: "" },
});
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill());
