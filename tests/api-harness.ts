import { createApp } from "../backend/src/app";
import { LocalJsonStore } from "../backend/src/storage/local-store";
import type { DataStore } from "../backend/src/storage/types";

export async function startApi(
  store: DataStore = new LocalJsonStore(),
  disableRateLimit = true,
) {
  const { app } = createApp({ store, disableRateLimit });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address.");
  const url = `http://127.0.0.1:${address.port}`;
  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

/** Exercises the mounted Express route, including JSON parsing and error handling. */
export async function POST(request: Request) {
  const api = await startApi();
  try {
    const response = await fetch(`${api.url}${new URL(request.url).pathname}`, {
      method: request.method,
      headers: request.headers,
      body: await request.text(),
    });
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: response.headers,
    });
  } finally {
    await api.close();
  }
}
export { POST as exportCisco };
