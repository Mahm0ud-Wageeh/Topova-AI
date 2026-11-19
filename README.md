# Topova AI

A React + Express network design workspace with deterministic planning, educational simulation, optional external AI, reviewed design changes, version history and lab exports.

## Development

Requires Node.js 22.12+ and npm. Run `npm install`, copy `.env.example` to `.env` if needed, then `npm run dev`. The frontend opens at http://localhost:3000 and proxies API requests to the backend at port 4000. Local JSON storage works without PostgreSQL or AI keys.

## What works

- Signed guest sessions and optional email/password accounts with HttpOnly session cookies; guest data moves into an account on sign-in or registration.
- Searchable, paginated conversations. Full message history is retained; older messages load on demand.
- Topology editing with visible save status, retry and optimistic version conflict detection.
- AI changes to an existing design are proposals: compare, accept or reject before the saved topology changes.
- Design revision history, comparison and restore without deleting later history.
- Deterministic addressing/VLAN planning, simulated packet/attack/traffic analysis, security heuristics, BOM/PoE estimates and a virtual CLI.
- Shared export validation: structural errors block export; lab compatibility warnings require acknowledgment. Exported configs still require testing in the target lab.
- English/Arabic, RTL/LTR, themes and keyboard-accessible command, terminal and export dialogs.

## Storage and production

`NETTOPO_STORAGE=local-json` is for development. Local writes reload under a cross-process lock, write atomically, preserve a `.bak` backup and reject corrupted stores. Keep JSON files on a local disk, not a shared network filesystem.

Production requires `NETTOPO_STORAGE=postgresql`, valid `DATABASE_URL` / `DIRECT_URL`, and a dedicated `JWT_SECRET` of at least 32 random characters. Configure the exact public origin in `APP_URL` and `NETTOPO_AUTHORIZED_ORIGINS`. Run `npm run db:deploy`, `npm run build`, then `npm start`. Express serves both the API and the SPA on `BACKEND_PORT` (default 4000); put it behind HTTPS. Production does not use Vite preview.

Import an existing local store with `npm run db:import-local -- /absolute/path/store.json [owner-map.json]` after migrating the target database. Imports are transactional and never overwrite existing records. Keep the source backup until the imported accounts and designs have been verified. Old unsigned guest IDs are intentionally not accepted as proof of ownership; an operator can explicitly map owners during import. Old Clerk-era tables are retained by migrations, but the active runtime uses local accounts and platform records.

## AI modes

Without `GEMINI_API_KEY`, chat uses local rules, current topology and structured preferences. It inspects JSON and Cisco/text attachments without executing their content; YAML/CSV are reported as text only. Free-form custom instructions and conversational inference require the external engine. The UI identifies local/external execution. Configuring external AI sends attached configuration text and profile context to that provider; avoid uploading secrets.

Additional provider keys in `.env.example` are for topology parsing, not conversational chat.

## Verification

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Type-check frontend, backend, shared domain and unit/integration tests |
| `npm run lint` | Lint all active application and test code |
| `npm test` | Offline domain and active Express API regression tests |
| `npm run test:db` | PostgreSQL tests; set `NETTOPO_TEST_DATABASE_URL` to an explicit disposable loopback database and migrate it first |
| `npm run test:e2e` | Desktop/mobile browser journeys; run `npx playwright install chromium` once |
| `npm run test:production` | Smoke-test built SPA deep links, assets and API errors with an ephemeral store |
| `npm run build` | Check server types and build the frontend |
| `npm run check` | Typecheck, lint, unit/API tests and build |

See [current architecture](Docs/04-architecture.md), [operations](Docs/09-operations.md), [reference labs](Docs/17-reference-labs.md) and [change report](Docs/18-hardening-and-review.md). Other product/design documents describe longer-term requirements and should not be read as a claim that every planned feature is shipped.
