import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createApp } from "../backend/src/app";
import { LocalJsonStore } from "../backend/src/storage/local-store";

// Ephemeral injected store: verify the built HTTP surface without touching any configured database.
process.env.NODE_ENV = "production";
process.env.JWT_SECRET = randomBytes(48).toString("hex");
const { app } = createApp({
  store: new LocalJsonStore(),
  disableRateLimit: true,
});
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((resolve) => server.once("listening", resolve));
try {
  const address = server.address();
  assert(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${url}/chat`);
  assert.equal(response.status, 200);
  assert(
    response.headers
      .get("content-security-policy")
      ?.includes("script-src 'self'"),
  );
  const html = await response.text();
  assert(html.includes('id="root"'));
  const script = /src="([^"]+\.js)"/.exec(html)?.[1];
  assert(script, "Production HTML must include the built JavaScript bundle.");
  const bundle = await fetch(`${url}${script}`);
  assert.equal(bundle.status, 200);
  assert(bundle.headers.get("content-type")?.includes("javascript"));
  assert.equal((await fetch(`${url}/api/missing`)).status, 404);
  assert.equal((await fetch(`${url}/assets/missing.js`)).status, 404);
  console.log(
    "Production HTTP smoke passed: SPA deep link, built JS asset and API 404.",
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
