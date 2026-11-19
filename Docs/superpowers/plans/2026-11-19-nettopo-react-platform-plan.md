# NetTopo AI 2.0 — React Studio & Express Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `nettopo-ai` in place into a full-stack React 18 + Vite Studio and modular Express + TypeScript backend featuring 10 integrated network engineering capabilities, instant Guest Mode + built-in JWT auth, dual PostgreSQL/local-JSON persistence, and bilingual AR/EN theming.

**Architecture:** All 10 domain engines live as pure, side-effect-free TypeScript modules in `shared/lib/network-engine/` so both the Express API and React Studio share exact types and deterministic behavior. The Express backend exposes versioned `/api/v1/*` routes backed by a unified `DataStore` (Prisma PostgreSQL with automatic atomic local-JSON fallback) and self-contained HS256 JWT + `scrypt` authentication. The React + Vite SPA (`frontend/src/`) connects via Vite dev proxy and hosts the interactive React Flow Studio, Live CLI Terminal, Packet/Chaos/Attack/Traffic simulators, AI Co-Pilot, Security Auditor, BOM/PoE estimator, Multi-Vendor export, Time-Machine, Branch Planner, and Change Review.

**Tech Stack:** React 18, Vite 6, React Router v6, TypeScript 5, Tailwind CSS 3, React Flow 11, Framer Motion, Express 4, Helmet, CORS, Zod, Prisma 5, fflate, jsPDF, html-to-image, Vitest 2.

**Spec:** [2026-11-19-nettopo-react-platform-design.md](file:///d:/Projects/Graduation%20project/nettopo-ai/Docs/superpowers/specs/2026-11-19-nettopo-react-platform-design.md)

## Global Constraints
- Node.js >= 22; preserve 100% of existing 47 passing Vitest tests (`tests/`).
- Every engine in `shared/lib/network-engine/` must be pure TypeScript with zero browser-only or Node-only runtime dependencies (except `node:crypto` only where already used in `shared/lib/design/change.ts`).
- Zero external SaaS keys required for full functionality (Guest Mode + LocalJsonStore + deterministic rule/AI fallback work offline).
- Bilingual Arabic (RTL) and English (LTR) support with Dark ("Cyber-Precision") and Light ("Layered White") themes.
- Strict verification gate before completion: `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` must all exit 0.

## Review Focus
- Disconnected or empty topology (`0` links or `1` device) passed into Packet Trace, Tarjan SPOF, Red-Team Attack, Traffic Load, or CLI Emulator must return clean structured results without crashing or dividing by zero.
- Chaos Mode disabling every uplink or the sole gateway router must report `unreachable` / `Request timed out` in Packet Trace and Live CLI `ping` instead of hanging or throwing.
- `LocalJsonStore` concurrent or malformed-file startup (`backend/.data/store.json` missing or empty) must auto-initialize cleanly with atomic writes and preserve project isolation between distinct `guest:<id>` and `user:<id>` owners.
- `Multi-Vendor` lab-pack export must validate ZIP integrity and SHA-256 checksums for every file across Cisco IOS, MikroTik RouterOS, Juniper Junos, and Ansible Inventory YAML.
- Upgrading `frontend/` to Vite React SPA must not leave Next.js type/lint conflicts in root `tsconfig.json`, `vitest.config.ts`, or `scripts/run.mjs`.

---

## Task 1: Shared Domain Types, Multi-Layout Builder & Packet/Chaos/Tarjan SPOF Simulator

**Files:**
- Modify: `shared/lib/network-engine/types.ts`
- Modify: `shared/lib/network-engine/topology-builder.ts`
- Create: `shared/lib/network-engine/simulator.ts`
- Test: `tests/simulator.test.ts`

**Interfaces:**
- Produces:
  - `AclRule`, `FaultState`, `LayoutMode`, `PacketHop`, `PacketTraceResult`, `SpofAnalysis`, `ProjectRevision`, `WorkspaceSnapshot` in `shared/lib/network-engine/types.ts`.
  - `computeLayout(devices, connections, mode: LayoutMode)` in `shared/lib/network-engine/topology-builder.ts`.
  - `analyzeSpof(topology, plan, faults?)`, `tracePacket(topology, plan, req)` in `shared/lib/network-engine/simulator.ts`.

- [ ] **Step 1:** Extend `shared/lib/network-engine/types.ts` with `AclRule`, `FaultState`, `LayoutMode` (`"tree" | "radial" | "tiered"`), `PacketHop`, `PacketTraceResult`, `SpofAnalysis`, and `ProjectRevision`.
- [ ] **Step 2:** Add `computeLayout(devices, connections, mode)` supporting `"tree"`, `"radial"`, and `"tiered"` layouts in `shared/lib/network-engine/topology-builder.ts`.
- [ ] **Step 3:** Implement `shared/lib/network-engine/simulator.ts` with Tarjan articulation-point & bridge detection (`analyzeSpof`) and hop-by-hop L2/L3/ACL packet simulator (`tracePacket`) with live fault injection.
- [ ] **Step 4:** Write `tests/simulator.test.ts` covering SPOF detection on single-router vs redundant topologies, Chaos link-cut blast radius, L2 VLAN trunk tagging, L3 TTL decrement, ACL deny verdict, and empty/single-node topologies.
- [ ] **Step 5:** Run `npx vitest run tests/simulator.test.ts` and verify PASS.

---

## Task 2: Red-Team Attack-Path Simulator & Real-Time Traffic Load Forecaster

**Files:**
- Create: `shared/lib/network-engine/attack-sim.ts`
- Create: `shared/lib/network-engine/traffic.ts`
- Test: `tests/attack-traffic.test.ts`

**Interfaces:**
- Consumes: `assignAddressing` (`cisco.ts`), `FaultState`, `AclRule`, `BuiltTopology`, `NetworkPlan`.
- Produces:
  - `simulateAttackPath(topology, plan, entryDeviceId, acls?, faults?)` -> `AttackSimulationResult`.
  - `forecastTraffic(topology, plan, profile, multiplier, faults?)` -> `TrafficForecastResult`.

- [ ] **Step 1:** Implement `shared/lib/network-engine/attack-sim.ts` modeling lateral movement from any compromised entry device across L2 broadcast domains and L3 VLAN boundaries gated by firewalls and ACLs.
- [ ] **Step 2:** Implement `shared/lib/network-engine/traffic.ts` computing per-link Mbps demand across workload profiles (`office`, `surveillance`, `voip`, `cloud-backup`) and stress multipliers (`0.5`–`5.0`), returning utilization % and bottleneck upgrade recommendations.
- [ ] **Step 3:** Write `tests/attack-traffic.test.ts` verifying high blast radius on flat unfirewalled networks, containment drop after VLAN+Firewall+ACL remediation, congestion detection on stress test, and 0-link graceful handling.
- [ ] **Step 4:** Run `npx vitest run tests/attack-traffic.test.ts` and verify PASS.

---

## Task 3: Zero-Trust Security Auditor, Auto-Remediation & BOM/PoE Cost Estimator

**Files:**
- Create: `shared/lib/network-engine/auditor.ts`
- Create: `shared/lib/network-engine/bom.ts`
- Test: `tests/auditor-bom.test.ts`

**Interfaces:**
- Consumes: `analyzeSpof`, `planNetwork`, `buildTopology`, `TYPE_VLAN`.
- Produces:
  - `auditSecurityResilience(topology, plan, acls?, faults?)` -> `SecurityAuditReport` (0–100 score + 4 pillars + findings).
  - `generateZeroTrustAcls(plan)` -> `AclRule[]`.
  - `autoRemediateTopology(topology, plan, acls?)` -> `{ topology, plan, acls, changesSummary }`.
  - `estimateBomAndPoe(topology, plan)` -> `BomEstimateReport` (PoE wattage vs switch budget, 3 tiers: `budget`, `enterprise`, `high-availability`, CSV export).

- [ ] **Step 1:** Implement `shared/lib/network-engine/auditor.ts` with 4 weighted scoring pillars (25 pts each), Zero-Trust Inter-VLAN ACL generator, and one-click `autoRemediateTopology`.
- [ ] **Step 2:** Implement `shared/lib/network-engine/bom.ts` calculating PoE watts (`AP`, `CAMERA`, `IP_PHONE`), PoE switch capacity & overload warnings, rack U-space, SFPs/cabling, 3-tier cost comparison, and CSV generation.
- [ ] **Step 3:** Write `tests/auditor-bom.test.ts` verifying score jumps significantly after `autoRemediateTopology`, Zero-Trust ACL rules block Wi-Fi/Camera lateral access, PoE overload warning triggers accurately, and 3-tier costs are ordered `budget < enterprise < high-availability`.
- [ ] **Step 4:** Run `npx vitest run tests/auditor-bom.test.ts` and verify PASS.

---

## Task 4: Conversational Co-Pilot, Live CLI Terminal Emulator & Multi-Vendor Config Generator

**Files:**
- Create: `shared/lib/network-engine/copilot.ts`
- Create: `shared/lib/network-engine/cli-emulator.ts`
- Create: `shared/lib/network-engine/multi-vendor.ts`
- Modify: `shared/lib/network-engine/index.ts`
- Test: `tests/copilot-cli-multivendor.test.ts`

**Interfaces:**
- Consumes: `ruleParse`, `buildTopology`, `planNetwork`, `assignAddressing`, `generateCiscoConfigs`, `tracePacket`, `autoRemediateTopology`.
- Produces:
  - `applyCopilotInstruction(current, instruction)` -> `CopilotProposal` (summary + structured before/after diff + next state).
  - `executeCliCommand(state, deviceId, command)` -> `CliExecutionResult` (`prompt`, `output`, `exitOk`).
  - `generateMultiVendorConfigs(topology, plan, acls?)` -> `{ cisco, mikrotik, junos, ansibleInventory, addressing }`.

- [ ] **Step 1:** Implement `shared/lib/network-engine/copilot.ts` supporting Arabic & English incremental mutations (add/remove devices, enable VLANs, add firewall/redundancy, switch routing protocol, apply zero-trust ACLs) with exact structural diff.
- [ ] **Step 2:** Implement `shared/lib/network-engine/cli-emulator.ts` supporting `show ip interface brief`, `show vlan brief`, `show ip route`, `show access-lists`, `show cdp neighbors`, `show running-config`, `show version`, `ping <target>`, `traceroute <target>`, and `help`/`?` reflecting live faults and ACLs.
- [ ] **Step 3:** Implement `shared/lib/network-engine/multi-vendor.ts` outputting full Cisco IOS (with ACLs), MikroTik RouterOS, Juniper Junos, and Ansible Inventory YAML.
- [ ] **Step 4:** Re-export all new modules cleanly from `shared/lib/network-engine/index.ts`.
- [ ] **Step 5:** Write `tests/copilot-cli-multivendor.test.ts` testing Arabic/English co-pilot diffs, live CLI `show` + `ping` before/after fault cut, and all 4 vendor outputs.
- [ ] **Step 6:** Run `npx vitest run tests/copilot-cli-multivendor.test.ts` and verify PASS.

---

## Task 5: Express Backend Upgrade, Built-in JWT + Guest Auth, Dual Persistence & Multi-Vendor Lab Pack

**Files:**
- Modify: `backend/package.json` (add `express`, `cors`, `helmet`, `@types/express`, `@types/cors`)
- Create: `backend/src/middleware/auth.ts`
- Create: `backend/src/middleware/rate-limit.ts`
- Create: `backend/src/middleware/error-handler.ts`
- Create: `backend/src/storage/types.ts`
- Create: `backend/src/storage/local-store.ts`
- Create: `backend/src/storage/prisma-store.ts`
- Create: `backend/src/storage/index.ts`
- Create: `backend/lib/lab-pack.ts`
- Create: `backend/src/routes/auth.ts`
- Create: `backend/src/routes/topology.ts`
- Create: `backend/src/routes/simulate.ts`
- Create: `backend/src/routes/audit.ts`
- Create: `backend/src/routes/bom.ts`
- Create: `backend/src/routes/exports.ts`
- Create: `backend/src/routes/projects.ts`
- Create: `backend/src/routes/branch.ts`
- Create: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/openapi.ts`
- Test: `tests/backend-api.test.ts`

**Interfaces:**
- Produces: `createApp(options?)` Express app factory exposing all `/api/v1/*` routes + `/api/v1/docs` interactive HTML docs + `/api/v1/openapi.json`, preserving all existing `backend/routes/v1/*` and `backend/lib/auth.ts` exports so existing tests keep passing.

- [ ] **Step 1:** Add `express`, `cors`, `helmet`, `@types/express`, `@types/cors` to `backend/package.json` and install dependencies.
- [ ] **Step 2:** Implement `backend/src/middleware/auth.ts` (HS256 JWT via `node:crypto`, salted `scryptSync` passwords, `X-NetTopo-Guest` guest owner resolution), `rate-limit.ts`, and `error-handler.ts`.
- [ ] **Step 3:** Implement dual storage (`types.ts`, `local-store.ts` with atomic writes to `backend/.data/store.json`, `prisma-store.ts`, and auto-fallback `index.ts`).
- [ ] **Step 4:** Implement `backend/lib/lab-pack.ts` building a verified ZIP archive with Cisco IOS, MikroTik RouterOS, Juniper Junos, Ansible YAML, wiring CSV, IP plan CSV, snapshot JSON, and SHA-256 `manifest.json`.
- [ ] **Step 5:** Implement all modular Express routers (`auth.ts`, `topology.ts`, `simulate.ts`, `audit.ts`, `bom.ts`, `exports.ts`, `projects.ts`, `branch.ts`), `app.ts`, updated `server.ts`, and updated `openapi.ts` + `/api/v1/docs`.
- [ ] **Step 6:** Write `tests/backend-api.test.ts` testing health, register/login/me, guest isolation, project CRUD + revision time-machine, packet trace, fault analysis, attack path, traffic forecast, security audit + auto-remediate, BOM estimate, CLI execution, Co-Pilot, and Multi-Vendor Lab Pack ZIP checksum verification.
- [ ] **Step 7:** Run `npx vitest run tests/backend-api.test.ts` and verify PASS.

---

## Task 6: Standalone React 18 + Vite Frontend Scaffolding, Contexts & Core Shell

**Files:**
- Modify: `frontend/package.json` (add `vite`, `@vitejs/plugin-react`, `react-router-dom`, ESLint React/TS plugins; switch scripts to `vite`, `vite build`, `vite preview`, `eslint src`)
- Create: `frontend/index.html`
- Create: `frontend/vite.config.ts`
- Modify: `frontend/tsconfig.json`, `frontend/tailwind.config.ts`, `frontend/.eslintrc.json`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/context/theme-context.tsx`
- Create: `frontend/src/context/language-context.tsx`
- Create: `frontend/src/context/auth-context.tsx`
- Create: `frontend/src/components/layout/navbar.tsx`
- Create: `frontend/src/components/layout/footer.tsx`
- Create: `frontend/src/pages/home-page.tsx`
- Create: `frontend/src/pages/auth-page.tsx`
- Create: `frontend/src/pages/projects-page.tsx`
- Create: `frontend/src/pages/privacy-page.tsx`
- Create: `frontend/src/pages/terms-page.tsx`
- Create: `frontend/src/pages/not-found-page.tsx`

- [ ] **Step 1:** Configure `frontend/package.json`, `vite.config.ts`, `index.html`, `tsconfig.json`, `tailwind.config.ts`, and `.eslintrc.json` for pure React + Vite SPA with `@` and `@/lib` aliases and `/api` dev proxy to backend.
- [ ] **Step 2:** Create `src/index.css` (Cyber-Precision Dark + Layered White Light design tokens, smooth animations, RTL support), `src/api/client.ts`, and `ThemeContext`, `LanguageContext` (AR/EN toggle), and `AuthContext` (Guest + JWT).
- [ ] **Step 3:** Build `Navbar`, `Footer`, `HomePage` (instant Arabic/English AI prompt launchpad + 10-capability showcase + one-click scenario launchers), `ProjectsPage` (saved Studio projects + Branch designs hub), `AuthPage`, `PrivacyPage`, `TermsPage`, and `NotFoundPage`.

---

## Task 7: Flagship Interactive NetTopo Studio (`/studio` & `/studio/:projectId`)

**Files:**
- Create: `frontend/src/pages/studio-page.tsx`
- Create: `frontend/src/components/studio/device-node.tsx`
- Create: `frontend/src/components/studio/topology-canvas.tsx`
- Create: `frontend/src/components/studio/device-palette.tsx`
- Create: `frontend/src/components/studio/packet-simulator-panel.tsx`
- Create: `frontend/src/components/studio/cli-terminal-modal.tsx`
- Create: `frontend/src/components/studio/attack-simulator-panel.tsx`
- Create: `frontend/src/components/studio/traffic-load-panel.tsx`
- Create: `frontend/src/components/studio/copilot-panel.tsx`
- Create: `frontend/src/components/studio/security-audit-panel.tsx`
- Create: `frontend/src/components/studio/bom-cost-panel.tsx`
- Create: `frontend/src/components/studio/multi-vendor-panel.tsx`
- Create: `frontend/src/components/studio/time-machine-panel.tsx`
- Create: `frontend/src/components/studio/ip-plan-panel.tsx`
- Create: `frontend/src/components/studio/executive-pdf.ts`

- [ ] **Step 1:** Build `DeviceNode` (status dot, SPOF crown/alert badge, compromised crimson ring, disabled chaos overlay, VLAN pill) and `TopologyCanvas` (React Flow visual editor with add/connect/delete, animated packet flow edge highlights, Chaos click-to-cut mode, Red-Team compromised path highlight, Traffic utilization heatmap colors + Mbps labels, 3 layout buttons, MiniMap).
- [ ] **Step 2:** Build `CliTerminalModal` (interactive IOS-style terminal with command history, autocomplete suggestions, quick-command chips, live `show`/`ping`/`traceroute` execution).
- [ ] **Step 3:** Build all Studio workbench panels (`DevicePalette`, `PacketSimulatorPanel`, `AttackSimulatorPanel`, `TrafficLoadPanel`, `CopilotPanel`, `SecurityAuditPanel`, `BomCostPanel`, `MultiVendorPanel`, `TimeMachinePanel`, `IpPlanPanel`) and `executive-pdf.ts` multi-page PDF Engineering Report generator.
- [ ] **Step 4:** Wire everything inside `StudioPage` with Undo/Redo stack, auto-recalculation on edits, Save & Save Revision dialog, Executive PDF + Lab ZIP + PNG + JSON exports.

---

## Task 8: Upgraded Branch Planner, Change Review, Launcher & Full Verification

**Files:**
- Create: `frontend/src/pages/planner-page.tsx`
- Create: `frontend/src/pages/review-page.tsx`
- Modify: `scripts/run.mjs`
- Modify: `package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md`

- [ ] **Step 1:** Port & upgrade Branch Planner, Saved Branch Designs, Cisco Export, Change Review, and Cisco Running-Config Importer cleanly into `frontend/src/pages/planner-page.tsx` and `review-page.tsx` (using React Router `Link` and our typed API client).
- [ ] **Step 2:** Update `scripts/run.mjs`, root `package.json`, `tsconfig.json`, `vitest.config.ts`, and `README.md` so `npm run dev`, `npm run build`, `npm start`, `npm run typecheck`, `npm run lint`, and `npm test` run the Vite React frontend + Express backend cleanly.
- [ ] **Step 3:** Run full verification:
  - `npm run typecheck` -> exit 0
  - `npm run lint` -> exit 0
  - `npm test` -> all existing + new tests pass (0 failures)
  - `npm run build` -> both backend and Vite frontend build cleanly (exit 0)
  - Live smoke test against running Express backend + Vite frontend verifying `/api/v1/health`, `/api/v1/docs`, `/api/v1/topology/generate`, `/api/v1/simulate/packet-trace`, `/api/v1/simulate/attack-path`, `/api/v1/audit/security`, `/api/v1/bom/estimate`, and `/api/v1/exports/lab-pack`.
