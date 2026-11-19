# Active API contracts

All routes are mounted by `backend/src/app.ts`. Errors use `{ error: { code, message, ...details } }`. Shared graph, ACL and addressing schemas are in `shared/lib/validators/schemas.ts`.

- `GET /api/v1/auth/guest`: obtains a signed guest token for `X-NetTopo-Guest`. Missing/invalid tokens receive a fresh isolated cookie identity, never a shared default owner.
- `POST /api/v1/auth/register`, `/login`: credentials, signed token transport and HttpOnly session cookie. Registration requires a password of at least 10 characters. `POST /logout` clears the browser session cookie. `/me` reads the registered account.
- `GET /api/v1/conversations?q=&offset=0&limit=30`: returns `conversations`, `total`, `nextOffset`.
- `GET /api/v1/conversations/:id?before=&limit=50`: returns a retained message page with `olderBefore` and `totalMessages`. `before` is an exclusive message index; absent means latest messages.
- Workspace PATCH requires `expectedVersion`; stale writes return `409 STALE_VERSION`. Name/pin-only patches do not require a workspace snapshot.
- `POST /api/v1/conversations/:id/messages`: message, optional attachments, request ID, mode/language and expected version. Request IDs prevent duplicate stored messages after retry. Mutating an existing network creates `pendingProposal`.
- `POST /api/v1/conversations/:id/proposal`: `proposalId`, `accept`, `expectedVersion`. Acceptance creates a revision; rejection keeps the saved network.
- `POST /api/v1/conversations/:id/restore`: `revision`, `expectedVersion`; restores into a new revision without discarding history.
- `POST /api/v1/exports/preflight`: topology, plan, ACLs; returns `ready` and severity-tagged findings.
- Lab exports require valid data and `acknowledgeWarnings: true`. Errors are not bypassable by acknowledgment. Cisco branch exports additionally validate selected hardware profile and feasibility.

Project and branch URLs retained for compatibility route to these same active Express services. Old Next.js API handlers and authentication aliases were removed. See `/api/v1/openapi.json` for route discovery and `README.md` for the current runtime.
