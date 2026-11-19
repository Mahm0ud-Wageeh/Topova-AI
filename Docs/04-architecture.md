# Current runtime architecture

The active HTTP application is `backend/src/app.ts` (Express). `backend/src/routes` owns the only route implementations. Old Next.js route handlers, Clerk authentication and their repository helpers have been removed; backward-compatible URL mounts point to the same Express routers.

- `frontend/src/pages`: route composition and page-level state.
- `frontend/src/components/workspace`: conversations, save coordinator, design review, sidebar, command palette.
- `frontend/src/components/studio`: topology renderer, simulated analysis and export presentation.
- `frontend/src/components/ui`: shared controls and Radix-backed accessible modal behavior.
- `frontend/src/api/client.ts`: request timeouts, cancellation, signed guest bootstrap and session expiry.
- `backend/src/middleware`: identity, request limits, stable error responses.
- `backend/src/storage`: shared datastore contract, local JSON development adapter and PostgreSQL adapter.
- `backend/lib/ai/agent.ts`: inference orchestration and response composition; `agent-tools.ts`: deterministic mutations/tools; `local-attachments.ts`: nonexecuting attachment inspection.
- `shared/lib/validators`: canonical graph, addressing, ACL and workspace validation.
- `shared/lib/design/workspace-diff.ts`: comparison used by proposals and history.
- `shared/lib/network-engine/export-preflight.ts`: shared UI/server export gate.

PostgreSQL stores users in `PlatformUser` and indexed, owner-scoped domain records in `PlatformRecord`. Mutations run in serializable transactions with bounded conflict retries. Domain methods are reused through an in-memory store so both adapters implement the same behavior. Records contain JSON snapshots, so very large owner datasets may eventually require splitting message/revision payloads into dedicated relational tables.

Local JSON reloads inside an exclusive file lock for every operation. Mutations are atomic, fsynced and backed up. Corruption is surfaced rather than converted to an empty database. Production forbids local storage.

Conversation `version` is checked before workspace writes, AI completion, acceptance and restoration. A restored snapshot creates another revision. AI proposals are persisted independently of the accepted workspace; they must be accepted/rejected before another mutating interaction.
