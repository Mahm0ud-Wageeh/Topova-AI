import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// Import the exact deployment artifact in plain Node, without a TS loader.
// Only non-database routes run here; PostgreSQL integration is checked separately.
process.env.NODE_ENV = "production";
process.env.JWT_SECRET = randomBytes(48).toString("hex");
process.env.NETTOPO_STORAGE = "postgresql";
const { default: app } = await import("../api/index.mjs");
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
try {
  const address = server.address();
  assert(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const response = await fetch(`${base}/api/v1/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).storage, "postgresql");
  const missing = await fetch(`${base}/api/missing`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "NOT_FOUND");
  assert.equal((await fetch(`${base}/chat`)).status, 404);
  console.log("Serverless artifact smoke passed in plain Node.");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
