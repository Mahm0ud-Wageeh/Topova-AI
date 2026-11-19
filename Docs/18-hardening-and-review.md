# Hardening and design review — 19 November 2026

The requested repository review follow-up is implemented in the working tree. Existing user edits were preserved. No production database migration, deployment or real-device configuration was performed.

## Changes

| Area | Result |
| --- | --- |
| Identity | Production rejects missing/short dedicated JWT secrets. Development uses an ephemeral random secret. Guests receive signed isolated identities with cookie continuity when browser storage is blocked. Invalid account signatures cannot silently access account data. |
| Accounts | Async salted scrypt, account/IP login limits, HttpOnly/SameSite account cookies, cookie logout, explicit session-expiry handling and origin enforcement. |
| Validation | One shared graph/addressing/ACL contract rejects duplicate IDs, missing link endpoints, loops, duplicate links, invalid/overlapping address pools and malformed ACLs. |
| Persistence | Local JSON reloads under a cross-process lock, writes atomically with fsync, preserves a backup and fails closed on corruption. Production requires the new PostgreSQL adapter with serializable transactions and owner-scoped indexed records. |
| Chat | Search debounce and stale-response protection; paginated lists/messages without deleting older history; cancellation prevents delayed writes; drafts/attachments recover after errors and retry in the same conversation. |
| Workspace saves | Serialized/debounced writes, visible saved/saving/error states, explicit retry/discard/reload and version conflict detection. |
| Review | AI edits become persisted proposals. Compare additions/removals/changed fields, accept or reject. Manual edits cannot bypass a pending review. |
| History | Workspace snapshots are retained. Compare any revision against the current design; restore into a new revision without deleting later history. |
| AI | Deterministic local attachment inspection and visible local/external capability limits. New network requests build the requested devices rather than extending a hidden sample. |
| Exports | Shared preflight blocks structural/profile errors; warnings require acknowledgment in UI and API. PDF code loads on demand and capture/PDF bundles are split. |
| UI | Radix-backed accessible command/export/terminal dialogs, focus handling and Escape support; reduced-motion behavior; mobile touch targets. Mobile proposals remain accessible and only one canvas instance mounts per viewport. |
| Structure | Removed old Next.js handlers, Clerk auth and legacy repository helpers. Active Express routes are tested directly. Composer, execution display, save coordination, deterministic tools and attachment inspection are separate modules. |
| Delivery | Current README/env/API/architecture/operations docs, transactional local-to-Postgres import, three reference lab fixtures, production SPA hosting and CI verification. |
| Dependencies | Updated Vite, Vitest, Zod, React Router, jsPDF and vulnerable transitive dependencies. Full workspace npm audit reports zero known vulnerabilities at verification time. |

## Verification

- TypeScript, whole-project ESLint and production build pass.
- 93 domain/API/database regression tests pass with the disposable loopback PostgreSQL database enabled; no database tests are skipped in that run.
- Six Chromium browser tests pass across desktop and mobile: guest design persistence, failed-save retry, AI review, revision restore, account adoption, acknowledged ZIP download, keyboard modal behavior and failed-message recovery.
- Production HTTP smoke verifies SPA deep links, built assets and API errors using an ephemeral injected store. The production datastore itself is covered separately by PostgreSQL integration tests.
- Full workspace dependency audit reports zero vulnerabilities. `git diff --check` passes.

Database tests ran against a newly initialized temporary PostgreSQL instance, not the configured application database. Reference lab tests validate model/config/package behavior, not live Cisco hardware.

## Operational boundaries

Production still needs the operator's database URLs, dedicated JWT secret, exact public origins, HTTPS and scheduled verified database backups. The import command preserves its source and refuses to overwrite conflicting target records. Old unsigned guest IDs are not treated as ownership proof; migration ownership mappings are administrator-controlled.

Local inference does not interpret arbitrary free-form memory/instructions. Those require external inference, which is clearly disclosed in the UI. The PostgreSQL adapter stores indexed domain documents; very large message/revision histories can later be normalized into separate tables as dataset size warrants it.

Generated configurations require an actual simulator/device lab pass before operational use. No licensed simulator or physical-device certification is claimed. Organization workspaces, SSO, reviewer roles and full live-device telemetry remain separate roadmap work.
