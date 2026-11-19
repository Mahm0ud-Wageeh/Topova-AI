import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { resolvePrincipal, validateAuthConfig } from "./middleware/auth";
import { errorHandler } from "./middleware/error-handler";
import { rateLimit } from "./middleware/rate-limit";
import { openApi, openApiDocsHtml } from "./openapi";
import { agentRouter } from "./routes/agent";
import { auditRouter } from "./routes/audit";
import { authRouter } from "./routes/auth";
import { bomRouter } from "./routes/bom";
import { branchRouter } from "./routes/branch";
import { conversationsRouter } from "./routes/conversations";
import { exportsRouter } from "./routes/exports";
import { profileRouter } from "./routes/profile";
import { projectsRouter } from "./routes/projects";
import { simulateRouter } from "./routes/simulate";
import { topologyRouter } from "./routes/topology";
import { createDataStore, type DataStore } from "./storage";

export interface AppOptions {
  store?: DataStore;
  disableRateLimit?: boolean;
  /** Serverless deployments serve the built SPA through the CDN. */
  serveFrontend?: boolean;
}

export function createApp(options: AppOptions = {}) {
  validateAuthConfig();
  const store = options.store ?? createDataStore();
  const app = express();

  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy:
        process.env.NODE_ENV === "production"
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "blob:"],
                fontSrc: ["'self'", "data:"],
                connectSrc: ["'self'"],
                workerSrc: ["'self'", "blob:"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                upgradeInsecureRequests: null,
              },
            }
          : false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  const configuredOrigins = (process.env.NETTOPO_AUTHORIZED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(
    cors({
      origin:
        configuredOrigins.length > 0
          ? configuredOrigins
          : ["http://localhost:3000", "http://127.0.0.1:3000"],
      credentials: true,
      exposedHeaders: ["X-Request-Id", "Content-Disposition"],
    }),
  );

  app.use((req, res, next) => {
    const id = randomUUID();
    req.requestId = id;
    res.setHeader("X-Request-Id", id);
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  if (!options.disableRateLimit)
    app.use("/api", rateLimit({ windowMs: 60_000, max: 300 }));
  app.use(express.json({ limit: "512kb" }));

  if (!options.disableRateLimit) {
    app.use(
      "/api/v1/auth/login",
      rateLimit({ windowMs: 15 * 60_000, max: 60 }),
    );
    app.use(
      "/api/v1/auth/login",
      rateLimit({ windowMs: 15 * 60_000, max: 15, byAccount: true }),
    );
    app.use(
      "/api/v1/auth/register",
      rateLimit({ windowMs: 15 * 60_000, max: 10 }),
    );
    // Stricter protection on AI conversational endpoints to guard inference quota
    app.use("/api/v1/agent/chat", rateLimit({ windowMs: 60_000, max: 35 }));
    app.use(
      "/api/v1/conversations/:id/messages",
      rateLimit({ windowMs: 60_000, max: 35 }),
    );
  }

  app.use((req, res, next) => {
    const origin = req.header("origin");
    const allowed = configuredOrigins.length
      ? configuredOrigins
      : ["http://localhost:3000", "http://127.0.0.1:3000"];
    if (
      origin &&
      !allowed.includes(origin) &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      res.status(403).json({
        error: {
          code: "ORIGIN_DENIED",
          message: "This origin is not allowed.",
        },
      });
      return;
    }
    next();
  });
  app.use(resolvePrincipal);

  // Health & Interactive OpenAPI Docs
  app.get("/api/v1/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "nettopo-backend",
      apiVersion: "v1",
      storage: store.mode,
      capabilities: [
        "autonomous-conversational-agent",
        "multi-conversation-workspace",
        "engineer-profile-and-memory",
        "cisco-packet-tracer-ready-exports",
        "visual-topology-editor",
        "packet-flow-simulator",
        "chaos-spof-tarjan",
        "live-cli-emulator",
        "red-team-attack-simulator",
        "traffic-bottleneck-forecaster",
        "zero-trust-security-auditor",
        "bom-poe-estimator",
        "branch-planner-and-review",
      ],
    });
  });

  app.get("/api/v1/openapi.json", (_req, res) => {
    res.json(openApi);
  });

  app.get("/api/v1/docs", (_req, res) => {
    res.type("html").send(openApiDocsHtml);
  });

  // Versioned API v1 routes
  app.use("/api/v1/auth", authRouter(store));
  app.use("/api/v1/agent", agentRouter(store));
  app.use("/api/v1/conversations", conversationsRouter(store));
  app.use("/api/v1/profile", profileRouter(store));
  app.use("/api/v1/topology", topologyRouter());
  app.use("/api/v1/simulate", simulateRouter());
  app.use("/api/v1/audit", auditRouter());
  app.use("/api/v1/bom", bomRouter());
  app.use("/api/v1/projects", projectsRouter(store));
  app.use("/api/v1", exportsRouter());
  app.use("/api/v1", branchRouter(store));

  // Backward-compatible legacy paths
  app.use("/api/topology", topologyRouter());
  app.use("/api/projects", projectsRouter(store));

  // 404 for unknown API routes
  app.use("/api", (_req, res) => {
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "API route not found." } });
  });

  if (process.env.NODE_ENV === "production" && options.serveFrontend !== false) {
    const webRoot = fileURLToPath(
      new URL("../../frontend/dist/", import.meta.url),
    );
    if (!existsSync(`${webRoot}/index.html`))
      throw new Error(
        "Frontend build missing. Run npm run build before npm start.",
      );
    app.use(express.static(webRoot, { index: false, maxAge: "1h" }));
    app.get("/assets/*", (_req, res) => res.status(404).end());
    app.get("*", (_req, res) => res.sendFile(`${webRoot}/index.html`));
  }
  app.use(errorHandler);
  return { app, store };
}
