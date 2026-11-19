# NetTopo AI 3.0 — Conversational AI Network Engineering Platform Design Spec

**Date:** 2026-11-19

**Status:** Proposed for User Approval

**Scope:** Full-Stack Architectural Upgrade (Frontend SPA + Express Backend + AI Agent Engine)

---

## 1. Product Vision & Goals

Transform NetTopo AI from a tool-first diagram studio into a flagship **conversational AI engineering platform** on par with ChatGPT, Claude, and Kimi — purpose-built for network engineers while remaining capable of answering any general, technical, or architectural conversation.

### Core User Requirements
1. **Zero Provider/Model Exposure (100% White-Label AI Identity):** End users never see "Google", "Gemini", "API", model IDs, or provider selectors. The platform presents a single cohesive intelligence (**NetTopo AI**) that automatically routes on the backend to the strongest available engine with transparent fallback.
2. **Flagship Welcome & Onboarding Gateway:** A refined, high-impact Welcome landing page featuring a clean **Continue as Guest** vs **Sign In / Register** entry experience so users can either start chatting immediately or sync conversations, profile, settings, and topologies to their account.
3. **Claude/ChatGPT-Grade 3-Zone Workspace:**
   - **Left/Right Collapsible Sidebar (RTL-aware):** Multi-conversation thread management (grouped by Today, Yesterday, Earlier), live search, pin/unpin, rename, delete, New Chat button, Prompt Templates library, saved Projects shortcut, and User Profile + Settings footer trigger.
   - **Center Conversational AI Thread:** Clean full-height chat supporting any general or network engineering prompt, live animated **Thinking / Reasoning Accordion** showing structured analysis and executed engineering steps, **interactive clarifying question cards** for broad/complex requests, **dynamic contextual follow-up prompt chips** after every reply, **file/config attachments** (`.cfg`, `.txt`, `.json`, `.yaml`, `.csv`), and **Smart Work Modes** (`Auto`, `Deep Architect`, `Security & Red-Team`, `Executive Brief`).
   - **Collapsible Live Network Canvas / Artifacts Drawer:** Opens automatically beside the chat whenever the agent builds, modifies, audits, traces, or attacks a topology — showing the upgraded architectural React Flow diagram, quick metrics, live Packet/Red-Team/Traffic/Audit/BOM/CLI tabs, and one-click expansion to full-screen Studio view.
4. **Profile, Personalization & Settings Ecosystem:** Full user profile page + settings modal/page with custom AI instructions, persistent engineer preferences/memory, default engineering standards (routing protocol, VLAN isolation, hardware profile), theme & accent palette selector, language switch, keyboard shortcuts (`Ctrl+K` command search, `Ctrl+Shift+O` new chat), and personal statistics.
5. **Cisco Packet Tracer-First Export Center:** A dedicated interactive **Cisco Packet Tracer Export Modal** (accessible directly from chat cards and the workspace header) showcasing exact Packet Tracer 8.x device models, port-to-port wiring preview, 1-click CLI copy, per-device `.cfg` downloads, and 1-click complete **Packet Tracer Ready Pack (`.zip`)** download — with advanced emulator formats (Cisco CML `.yaml`, GNS3 `.gns3`, Multi-Vendor ZIP, Executive PDF) cleanly organized under a secondary **Advanced Labs** tab.

---

## 2. System Architecture

### 2.1 Backend Upgrades (`backend/`)

#### A. Upgraded White-Label Autonomous Agent (`backend/lib/ai/agent.ts`)
- **Automatic Best-Engine Routing:** Backend automatically selects the strongest healthy model (`gemini-4-hydrogen` primary via official `@google/genai` Interactions API, with automatic fallback to `gemini-3.5-flash-lite` and local deterministic network engine).
- **Zero Leakage Contract:** API responses NEVER expose raw vendor/model names to the UI (`engineLabel: "NetTopo Intelligence"` only; internal diagnostics stay server-side).
- **Mode-Aware Prompting (`mode`):**
  - `auto`: Balanced autonomous network architect + general technical assistant.
  - `architect`: Deep multi-step architecture planning; asks concise clarifying questions when requirements are underspecified, then designs HA + Zero-Trust networks and validates BOM/PoE.
  - `security`: Red-Team & Zero-Trust specialist focusing on attack paths, ACL hardening, and vulnerability remediation.
  - `executive`: Concise executive summaries, tables, and actionable recommendations.
- **Structured Agent Output Contract:**
  - `reply`: Clean markdown engineering response matching the user's language (Arabic/English).
  - `thinkingSteps`: Ordered list of real reasoning & execution steps (`{ title, detail, status: "done" }`) displayed in the collapsible Thinking accordion.
  - `followUpSuggestions`: 3–4 contextual clickable next prompts tailored to the current conversation & topology.
  - `clarifyingQuestions`: Optional interactive multiple-choice question cards (`{ question, options[] }`) when the user asks an open-ended design question.
  - `toolCalls`, `mutated`, `nextState`, `audit`, `packetTrace`, `attack`, `bom`, `cliOutput`.
- **Attachment Ingestion:** Accepts optional `attachments: [{ name, content, mimeType }]` (up to 64 KB each, text-based `.cfg`, `.txt`, `.json`, `.yaml`, `.csv`) injected safely into the agent turn so engineers can paste/upload real Cisco running-configs or topology notes for analysis, auditing, or refactoring.
- **User Personalization Injection:** Automatically reads the user's saved `customInstructions`, `engineerRole`, and `defaultRoutingProtocol` from their profile and grounds the agent's tone and architectural defaults accordingly.

#### B. Persistent Data Store Extensions (`backend/src/storage/`)
Extend `DataStore` & `LocalJsonStore` (`backend/.data/store.json`) with two new first-class entities (both supporting Registered Users AND Guest Mode with seamless guest-to-account adoption on sign-up!):
1. **Conversations (`ConversationRecord`):**
   - `id`, `ownerKey`, `title`, `pinned`, `mode`, `createdAt`, `updatedAt`
   - `messages[]`: `{ id, role, content, createdAt, thinkingSteps?, toolCalls?, followUpSuggestions?, clarifyingQuestions?, attachments?, cliOutput?, hasTopologyUpdate? }`
   - `workspaceState?`: `{ topology, plan, acls, projectName }` (persisted live topology attached to that chat thread so switching chats restores the exact diagram!).
2. **User Profiles & Settings (`UserProfileRecord`):**
   - `ownerKey`, `displayName`, `roleTitle`, `organization`, `bio`, `avatarColor`
   - `customInstructions` (string, max 1500 chars)
   - `memoryNotes` (string[], max 12 items — editable engineer facts/preferences)
   - `preferences`: `{ defaultMode, defaultRouting, autoVlan, autoApplyCanvas, accentTheme, showThinkingByDefault }`
   - `updatedAt`

#### C. New REST API v1 Endpoints (`backend/src/routes/`)
- `GET /api/v1/conversations` — List user/guest conversations (sorted: pinned first, then `updatedAt` desc, supports `?q=` search).
- `POST /api/v1/conversations` — Create a new conversation thread.
- `GET /api/v1/conversations/:id` — Load full message history + attached live topology snapshot.
- `PATCH /api/v1/conversations/:id` — Rename title, toggle `pinned`, update mode or attached workspace state.
- `DELETE /api/v1/conversations/:id` — Delete conversation.
- `POST /api/v1/conversations/:id/messages` — Send a message (with optional `attachments`, `mode`, live `state`) -> invokes `runNetworkAgentChat`, persists both user & assistant messages + updated `workspaceState`, auto-generates a concise conversation title on turn 1, and returns the updated thread + agent result!
- `GET /api/v1/profile` — Fetch profile, preferences, and computed usage stats (`conversationCount`, `projectCount`, `totalMessages`, `totalDevicesDesigned`).
- `PATCH /api/v1/profile` — Update profile details, custom instructions, memory notes, and preferences.
- Keep `POST /api/v1/agent/chat` backward-compatible for stateless calls & existing tests.

---

### 2.2 Frontend Upgrades (`frontend/src/`)

#### A. Flagship Welcome & Entry Experience (`frontend/src/pages/home-page.tsx`)
- Editorial high-craft dark/light hero with interactive animated network pulse preview, clear Arabic/English value proposition, and an immediate **Gateway Action Bar**:
  - Primary CTA: **Start Chatting Now (Guest Mode)** -> launches `/chat` immediately.
  - Secondary CTA: **Sign In / Create Account** -> opens `/auth` (and automatically migrates guest chats/projects upon registration).
- Showcase cards highlighting the 4 signature platform pillars: Autonomous Engineering Chat + Reasoning, Live Interactive Topology Canvas, Cisco Packet Tracer Ready Export, and Zero-Trust Security + Red-Team Simulation.
- Quick-start scenario strip that launches straight into a live conversation thread.

#### B. Flagship 3-Zone AI Chat Workspace (`frontend/src/pages/chat-workspace-page.tsx` at `/chat` & `/chat/:conversationId`)
- **Zone 1 — Collapsible Sidebar (`components/workspace/chat-sidebar.tsx`):**
  - Brand mark + **New Chat** button (`Ctrl+Shift+O`).
  - Instant conversation search bar.
  - Grouped threads (**Pinned**, **Today**, **Previous 7 Days**, **Older**) with hover actions: Pin, Rename inline, Delete.
  - Quick links: **Prompt Templates**, **Classic Studio**, **Saved Projects**, **Branch Planner**.
  - Bottom **User Profile Pill** (avatar, name/Guest badge, Role) opening a quick menu to **Profile**, **Settings**, **Sign In / Out**.
- **Zone 2 — Main Conversational Thread (`components/workspace/chat-thread.tsx` + `chat-composer.tsx`):**
  - **Empty State:** Personalized greeting (`مرحباً، كيف نبني أو نحلل شبكتك اليوم؟`), 4 mode pills (`Auto`, `Deep Architect`, `Security`, `Executive`), and clickable engineering starter cards.
  - **Message Bubbles:**
    - Clean markdown formatting (headings, bold, bullet lists, tables, copyable code blocks with syntax styling, strict RTL/LTR `dir="auto"` per paragraph).
    - **Animated Thinking Indicator** during streaming/execution (`جاري التفكير وتحليل المعمارية...` with rotating live phases).
    - **Expandable Thinking & Execution Accordion** (`خطوات التفكير والتحليل`) showing every reasoning & tool step cleanly — zero provider/model names.
    - **Embedded Topology Snapshot Card** inside messages that mutated a network: displays device/link/VLAN/security score summary + **"Open Canvas"** & **"Export to Packet Tracer"** buttons!
    - **Interactive Clarifying Question Cards:** When the AI asks clarifying questions, renders crisp clickable option pills right in the chat that auto-reply with the engineer's choice.
    - **Contextual Follow-Up Chips:** 3–4 clickable suggested next questions beneath the latest assistant reply.
    - **Message Utility Row:** Copy reply, Export Packet Tracer (if topology present), Regenerate.
  - **Pro Composer:** Auto-growing textarea, **Attach File** button (`.cfg`, `.txt`, `.json`, `.yaml`, `.csv`) with removable attachment chips, **Work Mode Selector** pill, **Templates** button, and Send button.
- **Zone 3 — Slide-Out Live Interactive Network Artifacts Panel (`components/workspace/artifact-drawer.tsx`):**
  - Opens smoothly beside the chat whenever a topology is created/updated (or toggled from the top bar).
  - Embeds the upgraded **Architectural `TopologyCanvas`** (port labels, cable legend, 3 layouts, Chaos mode, Heatmap, Double-click Live CLI) + compact bottom/side tabs for **Build**, **Packet Trace**, **Red-Team**, **Traffic**, **Audit**, **BOM/PoE**, **IP/VLAN**, and **Live CLI**!
  - Top actions: **Export Packet Tracer**, **Save to Projects**, **Expand Full Studio (`/studio`)**, **Close Drawer**.

#### C. Dedicated Cisco Packet Tracer Export Modal (`frontend/src/components/studio/packet-tracer-modal.tsx`)
- Accessible from the Chat Workspace header, Topology Artifact card, and Studio top bar.
- **Primary Tab — Cisco Packet Tracer 8.x Ready:**
  - Clear visual summary: Devices mapped to exact Packet Tracer 8.x hardware (`ISR 4331`, `Catalyst 2960-24TT`, `ASA 5506-X`, `Server-PT`, `PC-PT`, `AccessPoint-PT`, `7960 IP Phone`).
  - Interactive **Port-to-Port Wiring Matrix** preview (`R1 Gi0/0 ↔ FW1 Gi0/0 · Straight-through`).
  - Device selector to preview & **1-Click Copy CLI** or download individual `<device>-startup.cfg`.
  - Hero CTA: **Download Packet Tracer 8.x Ready Pack (`.zip`)** containing startup `.cfg` files, instant CLI-paste `.txt` scripts, `cabling-matrix.csv`, and self-contained interactive `packet-tracer-build-guide.html`.
  - Transparent engineering note explaining how to load `.cfg` in Packet Tracer (`Config -> NVRAM -> Load` or CLI paste).
- **Secondary Tab — Advanced Lab Emulators & Reports:**
  - 1-click downloads for **Cisco Modeling Labs (`.yaml`)**, **GNS3 (`.gns3`)**, **Full Multi-Vendor Lab Pack (`.zip`)**, and **Executive Engineering PDF**.

#### D. User Profile Page & Settings Center (`frontend/src/pages/profile-page.tsx` & `frontend/src/pages/settings-page.tsx`)
- **Profile Page (`/profile`):**
  - Editable identity card (Display Name, Role Title, Organization, Bio, Avatar Color).
  - Live engineering stats (Total Conversations, Saved Projects, Devices Architected, Account Status).
  - Pinned Conversations & Recent Saved Projects quick-launch cards.
- **Settings Page (`/settings`):**
  - **Personalization & AI Memory:** Custom Instructions textarea + Add/Remove Memory Notes (e.g., "Always isolate CCTV in VLAN 30", "Prefer concise Arabic explanations").
  - **Engineering Defaults:** Default Work Mode, Default Routing Protocol (`OSPF`, `EIGRP`, `BGP`, `STATIC`), Auto-enable VLANs, Auto-apply Canvas updates, Show Thinking Accordion expanded by default.
  - **Appearance & Language:** Dark/Light theme, Accent Palette (`Electric Blue`, `Cyber Cyan`, `Emerald NOC`, `Royal Violet`), Arabic/English toggle.
  - **Keyboard Shortcuts Reference & Data Management.**

#### E. Command Palette (`Ctrl+K`) & Templates Modal (`frontend/src/components/workspace/command-palette.tsx`)
- Instant keyboard-driven launcher for searching conversations, starting a new chat, opening Templates, opening Packet Tracer Export, or jumping to Profile/Settings/Studio.

---

## 3. Security, Reliability & Testing Plan

- **Strict White-Label Enforcement:** Automated tests verify no backend agent response or frontend component leaks provider/model strings (`gemini`, `google`, `groq`, `api key`) in user-facing UI payloads.
- **Guest & Account Parity:** Guest users (`X-NetTopo-Guest`) get full persisted conversations, profile customization, and projects locally; registering adopts all guest conversations, profile settings, and projects seamlessly.
- **Validation & Safety:** Strict Zod validation on all conversation, message, attachment (size-capped), and profile payloads.
- **Automated Test Coverage:**
  - `tests/conversations-profile.test.ts`: Full CRUD for conversations, pinning, searching, message sending with attachments, auto-titling, profile/preferences persistence, guest isolation + adoption on registration, and white-label response checks.
  - All existing 18 test suites (71 tests) remain 100% green.
  - Full verification gate: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
