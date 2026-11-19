const json = (schema: object) => ({ "application/json": { schema } });
const input = (schema: object) => ({ required: true, content: json(schema) });
const error = {
  description: "Error response",
  content: json({ $ref: "#/components/schemas/Error" }),
};
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export const openApi = {
  openapi: "3.1.0",
  info: {
    title: "NetTopo AI 2.0 Studio & Network Engineering API",
    version: "2.0.0",
    description:
      "Full-stack network engineering platform API powering AI topology generation, conversational Co-Pilot, live Packet Flow & Chaos SPOF simulation, Red-Team Attack-Path analysis, Traffic Load forecasting, Live CLI emulation, Zero-Trust Auditing, BOM/PoE cost estimation, Multi-Vendor Lab Packs, and Branch Planning.",
  },
  paths: {
    "/api/v1/auth/guest": {
      get: {
        tags: ["Auth"],
        summary: "Create or renew an isolated signed guest session",
        responses: { "200": { description: "Signed guest token and cookie" } },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Clear the account session cookie",
        responses: { "200": { description: "Signed out" } },
      },
    },
    "/api/v1/conversations/{id}/proposal": {
      post: {
        tags: ["Workspace"],
        summary:
          "Accept or reject an AI proposal using proposalId, accept and expectedVersion",
        responses: {
          "200": { description: "Reviewed" },
          "409": error,
          "404": error,
        },
      },
    },
    "/api/v1/conversations/{id}/restore": {
      post: {
        tags: ["Workspace"],
        summary:
          "Restore revision using revision and expectedVersion, preserving history",
        responses: {
          "200": { description: "Restored as a new revision" },
          "409": error,
          "404": error,
        },
      },
    },
    "/api/v1/exports/preflight": {
      post: {
        tags: ["Exports"],
        summary:
          "Validate topology, plan and ACLs; report blocking errors and warnings",
        responses: {
          "200": { description: "Readiness findings" },
          "422": error,
        },
      },
    },
    "/api/v1/health": {
      get: {
        tags: ["System"],
        summary: "Check API availability & capabilities",
        responses: { "200": { description: "Healthy" } },
      },
    },
    "/api/v1/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a new account (JWT HS256)",
        responses: { "201": { description: "Registered" }, "409": error },
      },
    },
    "/api/v1/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Sign in with email and password",
        responses: { "200": { description: "Authenticated" }, "401": error },
      },
    },
    "/api/v1/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current authenticated user",
        responses: { "200": { description: "User profile" }, "401": error },
      },
    },
    "/api/v1/agent/status": {
      get: {
        tags: ["AI Agent"],
        summary:
          "Check NetTopo Intelligence readiness, work modes, and engineering tools",
        responses: { "200": { description: "Agent capabilities" } },
      },
    },
    "/api/v1/agent/chat": {
      post: {
        tags: ["AI Agent"],
        summary:
          "Stateless autonomous AI engineering chat with reasoning steps & tool execution",
        responses: { "200": { description: "Agent response" }, "422": error },
      },
    },
    "/api/v1/conversations": {
      get: {
        tags: ["Workspace"],
        summary:
          "List conversations with q, offset and limit; returns total and nextOffset",
        responses: { "200": { description: "Conversations list" } },
      },
      post: {
        tags: ["Workspace"],
        summary: "Create a new conversation thread",
        responses: { "201": { description: "Created" } },
      },
    },
    "/api/v1/conversations/{id}": {
      get: {
        tags: ["Workspace"],
        summary:
          "Load workspace and retained messages using before and limit pagination",
        responses: {
          "200": { description: "Conversation detail" },
          "404": error,
        },
      },
      patch: {
        tags: ["Workspace"],
        summary: "Rename, pin, or update conversation workspace",
        responses: { "200": { description: "Updated" }, "404": error },
      },
      delete: {
        tags: ["Workspace"],
        summary: "Delete conversation thread",
        responses: { "200": { description: "Deleted" }, "404": error },
      },
    },
    "/api/v1/conversations/{id}/messages": {
      post: {
        tags: ["Workspace"],
        summary:
          "Send message (with optional file attachments & mode) and persist AI reply + live topology",
        responses: {
          "200": { description: "Updated thread & agent output" },
          "404": error,
        },
      },
    },
    "/api/v1/profile": {
      get: {
        tags: ["Profile & Settings"],
        summary:
          "Get engineer profile, custom instructions, memory notes, preferences & stats",
        responses: { "200": { description: "Profile & stats" } },
      },
      patch: {
        tags: ["Profile & Settings"],
        summary: "Update profile, AI custom instructions, memory & preferences",
        responses: { "200": { description: "Updated profile" } },
      },
    },
    "/api/v1/topology/generate": {
      post: {
        tags: ["Studio"],
        summary:
          "Generate topology, IP/VLAN plan & Zero-Trust ACLs from Arabic/English prompt",
        responses: {
          "200": { description: "Generated project" },
          "422": error,
        },
      },
    },
    "/api/v1/topology/copilot": {
      post: {
        tags: ["Studio"],
        summary: "Apply incremental Arabic/English mutation with diff preview",
        responses: {
          "200": { description: "Co-Pilot diff proposal" },
          "422": error,
        },
      },
    },
    "/api/v1/simulate/packet-trace": {
      post: {
        tags: ["Simulators"],
        summary: "Trace L2/L3/ACL packet hop-by-hop across active topology",
        responses: { "200": { description: "Hop trace" }, "422": error },
      },
    },
    "/api/v1/simulate/fault-analysis": {
      post: {
        tags: ["Simulators"],
        summary: "Run Tarjan SPOF detection and Chaos fault blast radius",
        responses: { "200": { description: "SPOF report" }, "422": error },
      },
    },
    "/api/v1/simulate/attack-path": {
      post: {
        tags: ["Simulators"],
        summary: "Simulate Red-Team lateral movement from compromised device",
        responses: {
          "200": { description: "Attack blast radius" },
          "422": error,
        },
      },
    },
    "/api/v1/simulate/traffic": {
      post: {
        tags: ["Simulators"],
        summary: "Forecast per-link Mbps utilization and bottlenecks",
        responses: { "200": { description: "Traffic forecast" }, "422": error },
      },
    },
    "/api/v1/simulate/cli": {
      post: {
        tags: ["Simulators"],
        summary: "Execute live Cisco IOS CLI command against virtual device",
        responses: { "200": { description: "CLI output" }, "422": error },
      },
    },
    "/api/v1/audit/security": {
      post: {
        tags: ["Audit & BOM"],
        summary: "Compute 0-100 4-pillar Security & Resilience score",
        responses: { "200": { description: "Audit report" }, "422": error },
      },
    },
    "/api/v1/audit/auto-remediate": {
      post: {
        tags: ["Audit & BOM"],
        summary: "One-click Zero-Trust + Redundancy remediation",
        responses: {
          "200": { description: "Remediated topology & ACLs" },
          "422": error,
        },
      },
    },
    "/api/v1/bom/estimate": {
      post: {
        tags: ["Audit & BOM"],
        summary: "Calculate PoE wattage budget & 3-tier BOM cost comparison",
        responses: {
          "200": { description: "BOM & PoE estimate" },
          "422": error,
        },
      },
    },
    "/api/v1/exports/cml": {
      post: {
        tags: ["Exports"],
        summary:
          "Export editable Cisco Modeling Labs (CML 2.x) .yaml lab with embedded IOS startup configs",
        responses: {
          "200": { description: "YAML file or JSON envelope" },
          "422": error,
        },
      },
    },
    "/api/v1/exports/gns3": {
      post: {
        tags: ["Exports"],
        summary: "Export openable GNS3 (.gns3) topology project JSON",
        responses: {
          "200": { description: "GNS3 JSON file or JSON envelope" },
          "422": error,
        },
      },
    },
    "/api/v1/exports/packet-tracer": {
      post: {
        tags: ["Exports"],
        summary:
          "Export Cisco Packet Tracer 8.x Ready Pack (.zip with .cfg, paste CLI, cabling CSV, HTML guide, CML & GNS3)",
        responses: {
          "200": { description: "ZIP or base64 JSON envelope" },
          "422": error,
        },
      },
    },
    "/api/v1/exports/lab-pack": {
      post: {
        tags: ["Exports"],
        summary:
          "Export Multi-Vendor Lab ZIP (Cisco CML, GNS3, Packet Tracer, IOS, MikroTik, Junos, Ansible, SHA-256)",
        responses: {
          "200": { description: "ZIP or base64 JSON envelope" },
          "422": error,
        },
      },
    },
    "/api/v1/projects": {
      get: {
        tags: ["Projects"],
        summary: "List owned Studio projects (Guest or Registered)",
        responses: { "200": { description: "Projects list" } },
      },
      post: {
        tags: ["Projects"],
        summary: "Save Studio project with initial Time-Machine revision",
        responses: { "201": { description: "Project saved" }, "422": error },
      },
    },
    "/api/v1/projects/{id}": {
      get: {
        tags: ["Projects"],
        summary: "Load Studio project and full revision history",
        responses: { "200": { description: "Project" }, "404": error },
      },
      patch: {
        tags: ["Projects"],
        summary: "Update project and append a revision",
        responses: { "200": { description: "Updated" }, "404": error },
      },
      delete: {
        tags: ["Projects"],
        summary: "Delete project",
        responses: { "200": { description: "Deleted" }, "404": error },
      },
    },
    "/api/v1/branch-plans": {
      post: {
        tags: ["Branch Planner"],
        summary: "Allocate IPv4 and compare switch alternatives",
        requestBody: input(ref("BranchInput")),
        responses: { "200": { description: "Branch plan" }, "422": error },
      },
    },
    "/api/v1/branch-changes": {
      post: {
        tags: ["Branch Planner"],
        summary: "Review VLAN addition diff and rollback against snapshot",
        responses: { "200": { description: "Change report" }, "422": error },
      },
    },
    "/api/v1/cisco-exports": {
      post: {
        tags: ["Exports"],
        summary: "Export Branch Cisco IOS ZIP",
        responses: {
          "200": { description: "ZIP or base64 JSON" },
          "422": error,
        },
      },
    },
    "/api/v1/branch-designs": {
      get: {
        tags: ["Branch Planner"],
        summary: "List saved branch designs",
        responses: { "200": { description: "Designs" } },
      },
      post: {
        tags: ["Branch Planner"],
        summary: "Save branch design revision 1",
        responses: { "201": { description: "Saved" }, "422": error },
      },
    },
    "/api/v1/branch-designs/{id}": {
      get: {
        tags: ["Branch Planner"],
        summary: "Load branch design revision",
        responses: { "200": { description: "Design detail" }, "404": error },
      },
      post: {
        tags: ["Branch Planner"],
        summary: "Append branch design revision (optimistic concurrency)",
        responses: { "201": { description: "Saved" }, "409": error },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      guestHeader: { type: "apiKey", in: "header", name: "X-NetTopo-Guest" },
    },
    schemas: {
      BranchInput: {
        type: "object",
        additionalProperties: false,
        required: ["schemaVersion", "parentCidr", "portsPerSwitch", "segments"],
      },
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
  },
};

export const openApiDocsHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>NetTopo AI 2.0 — API Reference</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #020617; color: #e2e8f0; margin: 0; padding: 2rem; line-height: 1.6; }
    .wrap { max-width: 960px; margin: 0 auto; }
    h1 { color: #38bdf8; margin-bottom: 0.25rem; }
    .badge { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; margin-right: 0.5rem; font-family: ui-monospace, monospace; }
    .get { background: #064e3b; color: #34d399; }
    .post { background: #1e3a8a; color: #60a5fa; }
    .patch { background: #78350f; color: #fbbf24; }
    .delete { background: #7f1d1d; color: #f87171; }
    .card { border: 1px solid #1e293b; background: #0f172a; border-radius: 10px; padding: 0.85rem 1.1rem; margin: 0.6rem 0; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
    code { font-family: ui-monospace, monospace; color: #f8fafc; font-size: 0.9rem; }
    .muted { color: #94a3b8; font-size: 0.85rem; }
    a { color: #38bdf8; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>NetTopo AI 2.0 API Reference</h1>
    <p class="muted">OpenAPI 3.1 JSON: <a href="/api/v1/openapi.json">/api/v1/openapi.json</a> · Health: <a href="/api/v1/health">/api/v1/health</a></p>
    ${Object.entries(openApi.paths)
      .flatMap(([path, methods]) =>
        Object.entries(methods).map(
          ([method, meta]) =>
            `<div class="card"><div><span class="badge ${method}">${method.toUpperCase()}</span><code>${path}</code></div><span class="muted">${(meta as { summary?: string }).summary ?? ""}</span></div>`,
        ),
      )
      .join("")}
  </div>
</body>
</html>`;
