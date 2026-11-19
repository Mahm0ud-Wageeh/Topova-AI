# NetTopo AI 2.0 — Full-Stack React Studio & Express Backend Specification

**Date:** 2026-11-19

**Status:** Approved Design Draft (Ready for User Spec Review)

**Scope:** Direct in-place upgrade of `frontend/`, `backend/`, `shared/`, and `scripts/` inside `nettopo-ai`.

---

## 1. Purpose, Audience & Success Criteria

NetTopo AI 2.0 upgrades the existing workspace into a standalone, high-agency **React 18 + Vite** frontend studio paired with a modular **Express + TypeScript** backend and pure deterministic **shared network engineering engines**.

### Target Outcomes
1. **Zero-friction launch & defense reliability:** Every feature works immediately in **Guest Mode** out-of-the-box with no required third-party SaaS keys (no mandatory Clerk or cloud Postgres), while supporting built-in **JWT email/password accounts** and automatic **dual persistence** (PostgreSQL via Prisma when `DATABASE_URL` is reachable, automatic atomic JSON file fallback in `backend/.data/store.json` when offline).
2. **10 integrated, competitor-beating capabilities (100% deterministic & real):**
   - Full Interactive Visual Canvas Editor (drag-drop/add/connect/delete, 3 auto-layout engines, VLAN zone halos, MiniMap, live recalculation, Undo/Redo).
   - Live Animated Packet Flow Simulator + Chaos / Fault Injection + Tarjan SPOF Detection.
   - Live Interactive Device CLI Terminal Emulator (`show ip interface brief`, `show vlan brief`, `show ip route`, `show access-lists`, `show cdp neighbors`, `show running-config`, `ping`, `traceroute`).
   - Red-Team Cyber Attack-Path & Lateral Movement Simulator + One-Click Zero-Trust Containment.
   - Real-Time Traffic Load & Link Bottleneck Forecaster (workload profiles + 1x/2x/5x stress multiplier + canvas heatmap).
   - Conversational AI Network Co-Pilot (Arabic + English incremental mutations with visual before/after diff preview).
   - Zero-Trust Security & Resilience Auditor (0–100 score across 4 weighted pillars, Inter-VLAN ACL generator, one-click Auto-Remediation).
   - BOM, Cost & PoE Power Budget Estimator (Budget / Enterprise / High-Availability tier comparison, PoE wattage vs switch capacity, rack U-space, CSV export).
   - Multi-Vendor Config Lab Pack ZIP (Cisco IOS + MikroTik RouterOS + Juniper Junos + Ansible Inventory YAML + Snapshot JSON + SHA-256 checksums) + Executive Engineering PDF Report + Version Time-Machine Diff.
   - Preserved & upgraded Branch Capacity Planner, VLAN Change Review, and Cisco Running-Config Importer with 100% compatibility for existing branch tests.
3. **Bilingual & accessible UX:** Instant Arabic (RTL) / English (LTR) switching and Dark ("Cyber-Precision") / Light ("Layered White") theming.

---

## 2. Monorepo Structure

```text
nettopo-ai/
├── frontend/                   # Standalone React 18 + Vite 6 + TypeScript SPA
│   ├── index.html
│   ├── vite.config.ts          # Dev proxy /api -> backend, @ and @/lib aliases
│   ├── tailwind.config.ts
│   ├── postcss.config.cjs
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx             # React Router v6 routes + providers
│       ├── index.css           # Design tokens, Cyber-Precision & Layered White themes
│       ├── api/
│       │   └── client.ts       # Typed fetch client, JWT auth, guest ID header, timeouts
│       ├── context/
│       │   ├── auth-context.tsx
│       │   ├── language-context.tsx  # AR (RTL) / EN (LTR) + dictionary
│       │   └── theme-context.tsx
│       ├── components/
│       │   ├── layout/         # Navbar, Footer, AppShell
│       │   ├── ui/             # Button, Card, Badge, Input, Textarea, Dialog, Tabs, Slider
│       │   ├── studio/
│       │   │   ├── topology-canvas.tsx      # React Flow editor + packet animation + chaos + heatmap + attack overlay
│       │   │   ├── device-node.tsx          # Custom crisp node w/ status, SPOF, compromised, VLAN badges
│       │   │   ├── device-palette.tsx       # Add any of 10 devices + layout picker + toggles
│       │   │   ├── packet-simulator-panel.tsx
│       │   │   ├── cli-terminal-modal.tsx   # Live interactive IOS-style CLI terminal per device
│       │   │   ├── attack-simulator-panel.tsx
│       │   │   ├── traffic-load-panel.tsx
│       │   │   ├── copilot-panel.tsx        # Conversational chat + diff preview + Apply/Reject
│       │   │   ├── security-audit-panel.tsx # 0-100 score radar/bars + ACL viewer + Auto-Remediate
│       │   │   ├── bom-cost-panel.tsx       # Tier comparison + PoE gauge + CSV export
│       │   │   ├── multi-vendor-panel.tsx   # Cisco / MikroTik / Junos / Ansible switcher + ZIP export
│       │   │   ├── time-machine-panel.tsx   # Saved revisions + side-by-side structural diff + restore
│       │   │   ├── ip-plan-panel.tsx
│       │   │   └── executive-pdf.ts         # Multi-section jsPDF Executive Engineering Report generator
│       │   └── planner/        # Upgraded BranchPlanner, ChangeReview, CiscoImport, DesignExports, SavedDesigns
│       └── pages/
│           ├── home-page.tsx
│           ├── studio-page.tsx
│           ├── planner-page.tsx
│           ├── review-page.tsx
│           ├── projects-page.tsx
│           ├── auth-page.tsx
│           ├── privacy-page.tsx
│           ├── terms-page.tsx
│           └── not-found-page.tsx
│
├── backend/                    # Modular Express 4 + TypeScript API Server
│   ├── tsconfig.json
│   ├── prisma/                 # Existing PostgreSQL schema + migrations (preserved)
│   └── src/
│       ├── server.ts           # HTTP bootstrap, port validation, graceful shutdown
│       ├── app.ts              # Express app factory (testable via supertest/fetch)
│       ├── openapi.ts          # Updated OpenAPI 3.1 spec + /api/v1/docs interactive HTML UI
│       ├── middleware/
│       │   ├── auth.ts         # HS256 JWT + scrypt passwords + guest subject resolver
│       │   ├── rate-limit.ts   # Sliding-window in-memory rate limiter
│       │   └── error-handler.ts# Uniform JSON { error: { code, message, ... } }
│       ├── storage/
│       │   ├── types.ts        # Unified DataStore contract (users, projects, revisions, branchDesigns)
│       │   ├── local-store.ts  # Atomic JSON persistence (backend/.data/store.json)
│       │   ├── prisma-store.ts # PostgreSQL Prisma adapter
│       │   └── index.ts        # Auto-selecting store (Prisma when DB reachable, else local-store)
│       ├── lib/
│       │   ├── ai/             # Preserved 8-provider AI fallback + rule parser
│       │   ├── cisco-export.ts # Preserved branch Cisco ZIP export
│       │   └── lab-pack.ts     # New Multi-Vendor Lab Pack ZIP generator (Cisco+MikroTik+Junos+Ansible)
│       └── routes/
│           ├── auth.ts         # /api/v1/auth/*
│           ├── topology.ts     # /api/v1/topology/generate & /copilot (+ /api/topology/generate alias)
│           ├── simulate.ts     # /api/v1/simulate/packet-trace, /fault-analysis, /attack-path, /traffic, /cli
│           ├── audit.ts        # /api/v1/audit/security, /auto-remediate
│           ├── bom.ts          # /api/v1/bom/estimate
│           ├── exports.ts      # /api/v1/exports/lab-pack, /api/v1/cisco-exports
│           ├── projects.ts     # /api/v1/projects/* & /api/v1/projects/:id/revisions (+ /api/projects alias)
│           └── branch.ts       # /api/v1/branch-plans, /branch-changes, /branch-designs/*
│
├── shared/                     # Pure Deterministic Engines (zero Node/DOM lock-in)
│   └── lib/
│       ├── api-paths.ts
│       ├── design/             # Preserved branch planner, change review, Cisco import, snapshots
│       ├── validators/
│       │   └── schemas.ts      # Zod contracts for all 10 engines & API endpoints
│       └── network-engine/
│           ├── index.ts
│           ├── types.ts        # Extended with ACLs, faults, layout modes, revisions, profiles
│           ├── parser/rule-parser.ts
│           ├── topology-builder.ts  # Extended with 3 layout algorithms (tree, radial/star, tiered)
│           ├── ip-planner.ts
│           ├── vlan-planner.ts
│           ├── planner.ts
│           ├── routing.ts
│           ├── security.ts
│           ├── preflight.ts
│           ├── cisco.ts
│           ├── simulator.ts    # Packet Flow Engine + Tarjan SPOF + Chaos Fault Blast Radius
│           ├── attack-sim.ts   # Red-Team Lateral Movement & Zero-Trust Containment Engine
│           ├── traffic.ts      # Traffic Load & Link Utilization Bottleneck Engine
│           ├── auditor.ts      # 0-100 4-Pillar Security/Resilience Auditor + ACLs + Auto-Remediation
│           ├── bom.ts          # BOM, PoE Wattage Budget, Rack U, 3-Tier Cost Comparator
│           ├── copilot.ts      # Conversational Arabic/English Incremental Patch & Diff Engine
│           ├── cli-emulator.ts # Live Interactive Cisco IOS CLI Command Evaluator
│           └── multi-vendor.ts # Cisco IOS + MikroTik RouterOS + Juniper Junos + Ansible Inventory
│
├── scripts/
│   └── run.mjs                 # Unified dev / build / start launcher (Vite frontend + Express backend)
└── tests/                      # All existing tests (47 passing) + new engine & API integration tests
```

---

## 3. Core Shared Engine Specifications

### 3.1 Live Packet Flow, Chaos Fault Injection & Tarjan SPOF (`simulator.ts`)
- **Inputs:** `topology`, `plan`, optional `faults: { disabledDevices: string[]; disabledLinks: string[] }`, optional `acls: AclRule[]`.
- **Tarjan's Algorithm (`analyzeSpof`):**
  - Builds active undirected graph excluding `disabledDevices` and `disabledLinks`.
  - Runs iterative/recursive Tarjan DFS to compute **articulation points** (critical SPOF devices whose failure partitions the network) and **bridge edges** (critical SPOF cables).
  - Computes **Chaos Blast Radius**: compares connected component reachability from core gateway (`ROUTER` -> `FIREWALL` -> `SWITCH`) before vs after faults, returning `unreachableDevices`, `affectedVlans`, `redundancyScore`, and concrete recovery suggestions.
- **Packet Flow Trace (`tracePacket`):**
  - Accepts `sourceId`, `destinationId`, `protocol: "ICMP" | "TCP" | "UDP"`, optional `port: number`.
  - Finds shortest active path via BFS.
  - Emits ordered `PacketHop[]`, each containing: `deviceId`, `label`, `type`, `incomingLinkId`, `layer: "L2" | "L3" | "FW"`, `vlanTag` (dot1Q tag added on trunk, stripped on access), `ttl`, `srcIp`, `dstIp`, `action: "forward" | "route" | "inspect" | "deliver" | "drop"`, `reason`, and `latencyMs`.
  - Enforces **real ACL evaluation** at the gateway router / firewall when inter-VLAN traffic crosses L3 boundaries!

### 3.2 Red-Team Attack-Path & Zero-Trust Containment (`attack-sim.ts`)
- **Input:** `topology`, `plan`, `entryDeviceId`, `acls`, `faults`.
- **Algorithm:**
  - Starts from compromised `entryDeviceId`, classifies critical assets (`SERVER`, `ROUTER`, `FIREWALL`, `NVR`, `SWITCH` MGMT).
  - Traverses reachable devices respecting L2 broadcast domain (same VLAN or flat LAN = unrestricted lateral movement) and L3 inter-VLAN routing gated by `acls` and presence of `FIREWALL`.
  - Returns `compromisedPathEdges`, `exposedCriticalAssets`, `blastRadiusPercent` (0–100), `attackSteps[]` (human-readable kill chain in EN/AR), and `contained: boolean`.
- **Zero-Trust Containment Action:** Invokes `autoRemediate` (`enableVlans + addFirewall + generateZeroTrustAcls`), reducing exposed critical assets from high % to `0%` (or strictly permitted service ports only) so users can empirically re-run the attack and verify containment!

### 3.3 Traffic Load & Link Bottleneck Forecaster (`traffic.ts`)
- **Input:** `topology`, `plan`, `profile: "office" | "surveillance" | "voip" | "cloud-backup"`, `multiplier: number` (`0.5` to `5.0`), `faults`.
- **Algorithm:**
  - Assigns realistic per-device egress/ingress bandwidth (Mbps) by device type and workload profile (e.g., `CAMERA` = 8 Mbps in normal, 20 Mbps in 4K surveillance; `PC` = 12 Mbps; `SERVER` = 80 Mbps; `AP` = 100 Mbps; `IP_PHONE` = 0.15 Mbps).
  - Routes endpoint flows along shortest active paths to `SERVER` (east-west) and `ROUTER` (north-south WAN), accumulating load on every link.
  - Compares link load against nominal link capacity (`1000 Mbps` Gigabit access/uplink, `10000 Mbps` Fiber, `100 Mbps` Serial).
  - Returns per-link `{ linkId, loadMbps, capacityMbps, utilizationPercent, status: "healthy" | "elevated" | "congested", recommendation? }` plus peak bottleneck summary.

### 3.4 Zero-Trust Security & Resilience Auditor (`auditor.ts`)
- **4 Weighted Pillars (25 points each = 100 total):**
  1. **Redundancy & Resilience (25):** Deducts for Tarjan SPOF routers/switches/bridges and single-router/single-uplink topologies.
  2. **Segmentation & VLAN Isolation (25):** Checks VLAN separation between Users, Servers, Wi-Fi, Cameras, and Management VLAN 99.
  3. **Perimeter & ACL Hardening (25):** Checks Firewall presence, explicit Inter-VLAN Zero-Trust ACLs, and zero unconnected/orphaned nodes.
  4. **Capacity & Growth Headroom (25):** Checks switch port utilization (<80% target) and subnet spare IP headroom.
- **Zero-Trust ACL Generator (`generateZeroTrustAcls`):** Produces structured `AclRule[]` (e.g., permit Users -> Servers TCP 80/443/53, deny Wi-Fi/Guest -> Servers & MGMT, deny Cameras -> Users, permit Cameras -> NVR RTSP 554, restrict MGMT VLAN 99 to Admin).
- **One-Click Auto-Remediation (`autoRemediate`):** Deterministically transforms a topology + plan (adds missing perimeter `FIREWALL`, adds redundant secondary `ROUTER`/`SWITCH` uplink when SPOF detected, enables VLAN segmentation, attaches Zero-Trust ACLs) and returns the upgraded `{ topology, plan, acls, changesSummary }`.

### 3.5 BOM, Cost & PoE Power Budget Estimator (`bom.ts`)
- **PoE Wattage Calculation:** `AP` (15.4W 802.3af / 25.5W 802.3at), `CAMERA` (12.95W), `IP_PHONE` (7W). Compares total required PoE watts against switch PoE budget (`370W` per 24-port PoE+ switch / `740W` per 48-port PoE+ switch) and flags PoE overload warnings!
- **3-Tier Comparison (`budget`, `enterprise`, `high-availability`):** Outputs itemized BOM (`sku`, `category`, `quantity`, `unitPriceUsd`, `totalUsd`, `rackUnits`, `poeWatts`), total CapEx, rack U-space, power draw, and CSV export string.

### 3.6 Conversational AI Network Co-Pilot (`copilot.ts`)
- Accepts current `{ topology, plan, acls }` + user instruction in Arabic or English (e.g., `"أضف 6 كاميرات و NVR واعزلهم في VLAN"`, `"add a firewall and enable OSPF"`, `"remove 2 switches"`, `"add redundant router"`).
- Uses AI provider (when available) or deterministic bilingual intent parser to produce a structured `TopologyMutation` (`addDevices`, `removeDevices`, `enableVlans`, `setRouting`, `applyZeroTrustAcls`, `addRedundancy`).
- Returns `{ summary, diff: { addedDevices, removedDevices, addedLinks, removedLinks, vlanChanges, routingChange, aclCountDelta }, nextState }` so the Studio shows a clear **Diff Preview Card** with **Apply** / **Discard** buttons and pushes onto the Undo/Redo stack!

### 3.7 Live Interactive Device CLI Emulator (`cli-emulator.ts`)
- Evaluates real Cisco IOS-style commands against live `{ topology, plan, addressing, acls, faults, deviceId }`:
  - `show ip interface brief`, `show vlan brief`, `show ip route`, `show access-lists`, `show cdp neighbors`, `show running-config`, `show version`, `ping <ip|label>`, `traceroute <ip|label>`, `help` / `?`.
- Reflects live Chaos Mode cuts (`administratively down / down` on cut links, `U.U.U` / timeout on `ping`).

### 3.8 Multi-Vendor Config Generator (`multi-vendor.ts`)
- Generates full, vendor-idiomatic configurations from the exact same topology + addressing + ACLs:
  - **Cisco IOS** (Router-on-a-stick, DHCP pools with safe exclusions, Extended ACLs, OSPF/EIGRP/BGP/RIP/Static, Switch VLANs + trunks + port-security + SVI 99).
  - **MikroTik RouterOS** (`/interface vlan`, `/ip address`, `/ip pool`, `/ip dhcp-server`, `/ip firewall filter`, `/routing ospf`, `/interface bridge vlan`).
  - **Juniper Junos** (`set vlans ...`, `set interfaces irb unit ...`, `set firewall family inet filter ...`, `set protocols ospf ...`).
  - **Ansible Inventory YAML** (`hosts.yml` grouped by role with management IPs and VLAN vars).

---

## 4. Backend API & Dual Persistence Design

### Authentication & Identity (`backend/src/middleware/auth.ts`)
- **Zero external lock-in:** Self-contained HS256 JWT (using `node:crypto` HMAC-SHA256) + salted `crypto.scryptSync` password hashing.
- **Guest Mode:** Frontend generates a stable random `X-NetTopo-Guest` UUID stored in `localStorage`. When no `Authorization: Bearer <jwt>` is sent, backend resolves owner identity as `guest:<uuid>`, allowing immediate saving, revisions, and dashboard listing with zero login friction!
- **Registered Accounts:** `POST /api/v1/auth/register` & `POST /api/v1/auth/login` issue a 7-day JWT; optional guest-to-user project adoption on sign-up/login.

### Dual Persistence (`backend/src/storage/`)
- `createDataStore()` tests Prisma connectivity when `DATABASE_URL` is present; if unreachable or unset, seamlessly activates `LocalJsonStore` (`backend/.data/store.json` with atomic write-rename) and logs the active storage mode (`postgresql` vs `local-json`) in `/api/v1/health`.
- Stores: `users`, `projects` (with `revisions[]` array for Version Time-Machine!), and `branchDesigns` (with optimistic concurrency `head` revisions).

### Key Endpoints
- `GET /api/v1/health` -> `{ status: "ok", storage: "postgresql" | "local-json", apiVersion: "v1" }`
- `GET /api/v1/openapi.json` & `GET /api/v1/docs` -> OpenAPI 3.1 JSON + clean interactive API explorer page.
- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `GET /api/v1/auth/me`
- `POST /api/v1/topology/generate` & `POST /api/v1/topology/copilot`
- `POST /api/v1/simulate/packet-trace`, `POST /api/v1/simulate/fault-analysis`, `POST /api/v1/simulate/attack-path`, `POST /api/v1/simulate/traffic`, `POST /api/v1/simulate/cli`
- `POST /api/v1/audit/security`, `POST /api/v1/audit/auto-remediate`
- `POST /api/v1/bom/estimate`
- `POST /api/v1/exports/lab-pack` (Multi-Vendor ZIP) & `POST /api/v1/cisco-exports` (Branch Cisco ZIP)
- `GET/POST /api/v1/projects`, `GET/PATCH/DELETE /api/v1/projects/:id`, `POST /api/v1/projects/:id/revisions`
- `POST /api/v1/branch-plans`, `POST /api/v1/branch-changes`, `GET/POST /api/v1/branch-designs`, `GET/POST /api/v1/branch-designs/:id`

---

## 5. Frontend React SPA Design & Aesthetic Direction

- **Aesthetic System:** **Cyber-Precision Engineering Studio** (Dark default `#020617` deep obsidian slate with electric blue `#3B82F6` primary + laser cyan `#22D3EE` telemetry accent, plus crisp Layered White light theme). Typography: `Hanken Grotesk` display + `Inter` UI + `JetBrains Mono` for IPs/CLI + Arabic system UI font stack for RTL.
- **Studio Workspace Layout (`/studio` & `/studio/:projectId`):**
  - **Top Command Bar:** Logo, editable project name, Undo/Redo, Chaos Mode toggle (pulsing red badge when active), Traffic Heatmap toggle, Save / Save Revision button, Export Menu (Executive PDF Report, Multi-Vendor Lab ZIP, PNG, JSON), Language (AR/EN) & Theme toggles.
  - **Left Icon Rail:** Switch active side-workbench panel while keeping the live interactive React Flow canvas visible and responsive!
    1. **Build & Inspect** (Add devices palette, 3 auto-layout buttons, device/link properties, live CLI launch button)
    2. **Packet & Chaos Simulator** (Pick Source/Dest/Protocol/Port -> Play animated hop-by-hop packet trace + SPOF summary)
    3. **Red-Team Attack Simulator** (Pick compromised entry node -> Simulate Lateral Movement -> One-Click Zero-Trust Containment)
    4. **Traffic & Bottlenecks** (Workload profile + Stress slider 1x–5x + congested links table)
    5. **AI Co-Pilot Chat** (Arabic/English conversational prompt + structured diff preview + Apply/Reject)
    6. **Security & Resilience Audit** (0–100 radial score + 4 pillar gauges + ACL rules + One-Click Auto-Remediate)
    7. **BOM & PoE Cost** (PoE power gauge + 3-tier comparison cards + itemized table + CSV download)
    8. **IP & VLAN Plan** (Subnets, masks, ranges, routing table)
    9. **Multi-Vendor CLI** (Cisco IOS / MikroTik RouterOS / Juniper Junos / Ansible YAML tabs + Copy + Lab ZIP)
    10. **Version Time-Machine** (Revision timeline + visual diff between revisions + Restore)
  - **Interactive Floating Live CLI Terminal Modal:** Double-click any router/switch/firewall node (or click "Open Terminal") to launch the live IOS-style terminal right over the Studio!

---

## 6. Launcher & Testing Strategy

- **`scripts/run.mjs`:** Runs Express backend (`tsx watch src/server.ts` on port 4000) and Vite frontend (`vite --port 3000` proxying `/api` to backend) in `dev`; builds backend typecheck + Vite static bundle (`frontend/dist`) in `build`; serves both in `start` (Express can also serve or proxy cleanly).
- **Automated Verification (`tests/`):**
  - Keep all 47 existing tests green (`branch-planner`, `branch-change`, `cisco-export`, `cisco-import`, `ai-fallback`, `parser`, `ip-planner`, `engine`, `validators`, `bug-fixes`).
  - Add comprehensive new Vitest suites covering: `simulator.test.ts` (Packet Trace + Tarjan SPOF + Chaos), `attack-traffic.test.ts` (Red-Team containment + Traffic bottleneck), `auditor-bom.test.ts` (4-pillar score + Auto-Remediation + PoE/BOM), `copilot-cli-multivendor.test.ts` (Co-Pilot diff + Live CLI commands + Cisco/MikroTik/Junos/Ansible output), and `backend-api.test.ts` (Express routes, JWT auth, Guest mode, LocalJsonStore CRUD & revisions, Lab Pack ZIP verification).
  - Full `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` must exit 0.
