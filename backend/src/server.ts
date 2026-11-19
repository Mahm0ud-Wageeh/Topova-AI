import { prisma } from "@server/db/prisma";
import { createApp } from "./app";

const host = process.env.BACKEND_HOST || "127.0.0.1";
const port = Number(process.env.BACKEND_PORT || "4000");

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("BACKEND_PORT must be an integer from 1 to 65535.");
  process.exit(1);
}

const { app, store } = createApp();

if (store.mode === "postgresql") await prisma.$connect();

const server = app.listen(port, host, () => {
  console.log(
    `NetTopo AI 2.0 Express API listening at http://${host}:${port} (storage: ${store.mode})`,
  );
  console.log(`Interactive API Docs: http://${host}:${port}/api/v1/docs`);
});

server.requestTimeout = 120_000;
server.headersTimeout = 15_000;

server.on("error", (error: NodeJS.ErrnoException) => {
  console.error(
    error.code === "EADDRINUSE"
      ? `NetTopo API: ${host}:${port} is in use. Stop the server using it or set BACKEND_PORT to a free port.`
      : `NetTopo API failed to listen on ${host}:${port}: ${error.message}`,
  );
  process.exitCode = 1;
});

function shutdown() {
  server.close(() => {
    if (store.mode === "postgresql") void prisma.$disconnect().catch(() => {});
  });
  server.closeIdleConnections?.();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
