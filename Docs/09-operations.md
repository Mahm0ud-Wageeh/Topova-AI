# Operations

## Development and production

Development: Node 22.12+, `npm install`, `npm run dev`. Local JSON is the default. No external AI key is required.

Production: configure PostgreSQL URLs, `NETTOPO_STORAGE=postgresql`, a dedicated random `JWT_SECRET` of at least 32 characters, exact allowed origins and HTTPS. Run database migrations, build, and start. Express serves `/api` and the built SPA on port 4000 by default. A missing production secret, unsupported storage or missing web build prevents startup. Database connection is checked before listening.

Use a process manager that forwards SIGTERM. The backend stops accepting connections and disconnects PostgreSQL on shutdown. `/api/v1/health` identifies the active storage adapter; use an actual database check in deployment readiness monitoring as appropriate to your hosting platform.

## Backups and restore

On Vercel, use the repository-root configuration in `vercel.json`, not the legacy
Next.js preset. Static files are served from `frontend/dist` and API traffic goes
to `api/index.ts`. The production build applies committed Prisma migrations
before building; preview builds do not migrate and require separate database
credentials and session/origin configuration. Keep the function in the database's
region and use a pool-compatible connection URL. In-process rate limits are per
function instance; configure platform rate limiting when shared enforcement is
required. See the README for required environment variables.

PostgreSQL: schedule encrypted database backups using the deployment's database tooling and verify restoration into a separate database. Retain those backups according to your project policy. Application revisions are not a substitute for database backups.

Local JSON: every successful mutation atomically replaces the store after preserving the previous file as `.bak`. If parsing fails, stop the app, preserve both files, inspect/restore the known-good backup and restart. Do not discard a lock unless its recorded process is no longer alive. Lock acquisition is bounded; timeouts return a retryable error.

To move local data to PostgreSQL, stop writes, back up the source, migrate an empty target and run `npm run db:import-local -- SOURCE [OWNER_MAP]`. Unique conflicts roll back the import rather than overwrite records. Compare imported counts and sign into a migrated test account before changing the active storage setting. Owner maps are explicit administrator-controlled JSON objects, for example mapping an old guest owner to an existing `user:ID`. Never expose that mapping workflow as a public claim-by-ID endpoint.

## Sessions and AI

Restarting without a configured development JWT secret expires development signatures. Production uses a stable externally configured secret; rotation intentionally invalidates prior signatures. Account cookies are HttpOnly, SameSite=Strict and Secure in production. Guest tokens are signed, expire and remain isolated even when localStorage is unavailable. Old unsigned guest IDs cannot claim stored data.

`GEMINI_API_KEY` enables external chat and sends attachment/profile context to it. Keep it empty for offline operation. Local attachment inspection does not execute config commands. Restrict uploaded material to nonsecret lab configurations.

## CI

The workflow runs lint, typecheck, offline API/domain tests, real disposable PostgreSQL integration tests, build, dependency audit and desktop/mobile browser tests. It does not deploy or publish the application.
